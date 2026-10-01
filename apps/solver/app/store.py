"""Jobs live in Redis: a record per job and one queue (hardening findings 6 and 7).

The old service kept jobs in a dict in memory with 8-character ids: lost on restart, one
instance only, and guessable. Here ids are UUIDv4, every record names its owner, and records
expire after a day (the web app keeps the results it needs in MongoDB).
"""

import time
import uuid
from typing import Literal

from redis import Redis

from app.limits import MAX_TIMEOUT_SECONDS
from app.models import JobResult, JobSpec, WireModel, error_result
from app.runners import RUNNER_GRACE_SECONDS

QUEUE_KEY = "solver:queue"
JOB_TTL_SECONDS = 24 * 60 * 60
# A job still "running" after this was lost with its worker.
STALE_AFTER_SECONDS = MAX_TIMEOUT_SECONDS + RUNNER_GRACE_SECONDS + 60

JobState = Literal["queued", "running", "done"]


class Job(WireModel):
    id: str
    owner: str
    state: JobState
    created_at: float
    started_at: float | None = None
    finished_at: float | None = None
    result: JobResult | None = None


def _job_key(job_id: str) -> str:
    return f"solver:job:{job_id}"


def _spec_key(job_id: str) -> str:
    return f"solver:spec:{job_id}"


class QueueFull(Exception):
    """Too many jobs are waiting; the caller should try again later."""


class JobStore:
    def __init__(self, redis: Redis, max_queue_length: int) -> None:
        self._redis = redis
        self._max_queue_length = max_queue_length

    def _save(self, job: Job) -> None:
        self._redis.set(_job_key(job.id), job.model_dump_json(), ex=JOB_TTL_SECONDS)

    def enqueue(self, owner: str, spec: JobSpec) -> Job:
        if self._redis.llen(QUEUE_KEY) >= self._max_queue_length:
            raise QueueFull
        job = Job(id=str(uuid.uuid4()), owner=owner, state="queued", created_at=time.time())
        pipe = self._redis.pipeline()
        pipe.set(_job_key(job.id), job.model_dump_json(), ex=JOB_TTL_SECONDS)
        pipe.set(_spec_key(job.id), spec.model_dump_json(), ex=JOB_TTL_SECONDS)
        pipe.lpush(QUEUE_KEY, job.id)
        pipe.execute()
        return job

    def get(self, job_id: str) -> Job | None:
        raw = self._redis.get(_job_key(job_id))
        if raw is None:
            return None
        job = Job.model_validate_json(raw)
        if job.state == "running" and time.time() - (job.started_at or 0) > STALE_AFTER_SECONDS:
            return job.model_copy(
                update={"state": "done", "result": error_result("The run was lost. Try again.")}
            )
        return job

    def position(self, job_id: str) -> int | None:
        """1 for the next job to run. The queue is pushed on the left and taken from the right."""
        index = self._redis.lpos(QUEUE_KEY, job_id)
        if index is None:
            return None
        return int(self._redis.llen(QUEUE_KEY)) - int(index)

    def take(self, wait_seconds: int) -> tuple[Job, JobSpec] | None:
        popped = self._redis.brpop([QUEUE_KEY], timeout=wait_seconds)
        if popped is None:
            return None
        job_id = popped[1].decode() if isinstance(popped[1], bytes) else popped[1]
        job = self.get(job_id)
        raw_spec = self._redis.getdel(_spec_key(job_id))
        if job is None or raw_spec is None:
            return None
        running = job.model_copy(update={"state": "running", "started_at": time.time()})
        self._save(running)
        return running, JobSpec.model_validate_json(raw_spec)

    def finish(self, job: Job, result: JobResult) -> None:
        self._save(
            job.model_copy(update={"state": "done", "finished_at": time.time(), "result": result})
        )
