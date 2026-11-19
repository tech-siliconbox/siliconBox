"""The supervisor: holds the open Praman sessions of this host (ADR 0031).

Run with `python -m app.supervisor`, one per host; every host takes from the same waiting line.
While it has a free slot (SOLVER_SESSION_SLOTS) it opens the next waiting session in a process of
its own (a container in production), relays that session's requests from Redis to the process
and the replies back, and sends a heartbeat. A session with no command for PRAMAN_IDLE_SECONDS
while no proof runs is closed; its last records stay in Redis for the web app.
"""

import json
import logging
import threading
import time
from typing import Any

from redis import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.config import Settings, get_settings
from app.limits import PRAMAN_IDLE_SECONDS
from app.session_runners import (
    ContainerSessionRunner,
    LocalSessionRunner,
    SessionGone,
    SessionProcess,
    SessionRunner,
)
from app.session_store import CLOSE_REQUEST_ID, SessionRecord, SessionStore

logger = logging.getLogger("solver.supervisor")

OPEN_REQUEST_ID = "open"
STATUS_REQUEST_ID = "status"
OPEN_WAIT_SECONDS = 60
WAIT_SECONDS = 1  # one blocking wait on a session's requests; bounds how fast it notices idling
HEARTBEAT_SECONDS = 5
STATUS_SECONDS = 30  # how often an idle-looking session is asked whether a proof still runs
RETRY_SECONDS = 5


class LiveSession:
    """One open session: its process, the thread reading its replies and the relay thread."""

    def __init__(
        self, record: SessionRecord, process: SessionProcess, store: SessionStore, idle: float
    ) -> None:
        self.record = record
        self.done = threading.Event()
        self._process = process
        self._store = store
        self._idle = idle
        self._opened = threading.Event()
        self._open_reply: dict[str, Any] = {}
        self._last_command = time.monotonic()
        self._working = False
        self._closing = ""
        self._finish_lock = threading.Lock()

    def open(self, open_line: str) -> bool:
        threading.Thread(target=self._read, name=f"read-{self.record.id}", daemon=True).start()
        request = json.loads(open_line)
        self._send(OPEN_REQUEST_ID, request)
        if not self._opened.wait(OPEN_WAIT_SECONDS) or not self._open_reply.get("ok"):
            self.finish("could not open")
            return False
        self.record = self._store.mark_open(self.record)
        threading.Thread(target=self._relay, name=f"relay-{self.record.id}", daemon=True).start()
        return True

    def _send(self, request_id: str, request: dict[str, Any]) -> None:
        self._process.send(json.dumps({"id": request_id, "request": request}))

    def _read(self) -> None:
        for line in self._process.replies():
            try:
                message = json.loads(line)
                self._take(str(message["id"]), message["reply"])
            except (ValueError, KeyError, TypeError):
                logger.warning("session %s sent a line that is not a reply", self.record.id)
        self.finish("stopped")

    def _take(self, request_id: str, reply: dict[str, Any]) -> None:
        if request_id == OPEN_REQUEST_ID:
            self._open_reply = reply
            self._opened.set()
        elif request_id == CLOSE_REQUEST_ID:
            self.finish(self._closing or "closed", final=reply)
        else:
            if "proofRunning" in reply:
                self._working = bool(reply["proofRunning"] or reply.get("busy"))
            if request_id != STATUS_REQUEST_ID:
                self._store.put_reply(self.record.id, request_id, reply)

    def _relay(self) -> None:
        try:
            self._relay_until_done()
        except Exception:  # noqa: BLE001  Never leave a process running with nobody relaying.
            logger.exception("session %s: the relay stopped", self.record.id)
            self.finish("supervisor error")

    def _relay_until_done(self) -> None:
        last_beat = last_status = time.monotonic()
        while not self.done.is_set():
            try:
                raw = self._store.next_request(self.record.id, WAIT_SECONDS)
            except (RedisConnectionError, RedisTimeoutError) as error:
                logger.warning("session %s: redis unavailable: %s", self.record.id, error)
                time.sleep(RETRY_SECONDS)
                continue
            if raw is not None:
                self._forward(raw)
            now = time.monotonic()
            if now - last_beat >= HEARTBEAT_SECONDS:
                self.record = self._store.heartbeat(self.record)
                last_beat = now
            if now - self._last_command >= self._idle and now - last_status >= STATUS_SECONDS:
                self._send(STATUS_REQUEST_ID, {"op": "status"})
                last_status = now
            if now - self._last_command >= self._idle and not self._working and not self._closing:
                self._closing = "idle"
                self._send(CLOSE_REQUEST_ID, {"op": "close"})

    def _forward(self, raw: str) -> None:
        op = json.loads(raw)["request"]["op"]
        if op != "poll":
            self._last_command = time.monotonic()
        try:
            self._process.send(raw)
        except SessionGone:
            self.finish("stopped")

    def close(self, reason: str) -> None:
        """Close the session properly, so its last records reach the web app."""
        self._closing = reason
        try:
            self._send(CLOSE_REQUEST_ID, {"op": "close"})
        except SessionGone:
            self.finish(reason)
            return
        if not self.done.wait(OPEN_WAIT_SECONDS):
            self.finish(reason)

    def finish(self, reason: str, final: dict[str, Any] | None = None) -> None:
        """Close once, whichever thread sees the end first."""
        with self._finish_lock:
            if self.done.is_set():
                return
            self.done.set()
        self._store.mark_closed(self.record, reason, final)
        self._process.stop()
        logger.info("session %s closed: %s", self.record.id, reason)


class Supervisor:
    def __init__(
        self,
        store: SessionStore,
        runner: SessionRunner,
        slots: int,
        idle_seconds: float = PRAMAN_IDLE_SECONDS,
    ) -> None:
        self._store = store
        self._runner = runner
        self._slots = slots
        self._idle = idle_seconds
        self.live: dict[str, LiveSession] = {}

    def step(self, wait_seconds: int) -> bool:
        """Open the next waiting session if a slot is free; True when one was opened."""
        self.live = {key: live for key, live in self.live.items() if not live.done.is_set()}
        if len(self.live) >= self._slots:
            time.sleep(wait_seconds)
            return False
        taken = self._store.take_waiting(wait_seconds)
        if taken is None:
            return False
        record, open_line = taken
        try:
            process = self._runner.start(record.id)
        except OSError:
            logger.exception("session %s could not be started", record.id)
            self._store.mark_closed(record, "could not start")
            return False
        live = LiveSession(record, process, self._store, self._idle)
        if not live.open(open_line):
            return False
        self.live[record.id] = live
        logger.info("session %s open (%d of %d slots)", record.id, len(self.live), self._slots)
        return True

    def close_all(self) -> None:
        for live in self.live.values():
            live.close("supervisor stopped")


def make_session_runner(settings: Settings) -> SessionRunner:
    if settings.solver_runner == "container":
        return ContainerSessionRunner(
            settings.solver_runner_image, settings.solver_container_runtime
        )
    return LocalSessionRunner()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url.get_secret_value(), socket_timeout=30)
    store = SessionStore(redis, settings.max_waiting_sessions)
    supervisor = Supervisor(store, make_session_runner(settings), settings.solver_session_slots)
    logger.info("supervisor ready: %d session slots", settings.solver_session_slots)
    try:
        while True:
            try:
                supervisor.step(WAIT_SECONDS)
            except (RedisConnectionError, RedisTimeoutError) as error:
                logger.warning("redis unavailable: %s", error)
                time.sleep(RETRY_SECONDS)
    finally:
        supervisor.close_all()


if __name__ == "__main__":
    main()
