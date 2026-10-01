"""The worker: takes one job at a time from the queue and runs it in isolation.

Run with `python -m app.worker`. Scale by running more workers; each runs one job at a time.
"""

import logging
import time

from redis import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.config import Settings, get_settings
from app.runners import ContainerRunner, LocalRunner, Runner
from app.store import JobStore

logger = logging.getLogger("solver.worker")
WAIT_SECONDS = 30
# Pause before trying again while Redis is unreachable.
RETRY_SECONDS = 5


def process_next(store: JobStore, runner: Runner, wait_seconds: int = WAIT_SECONDS) -> bool:
    """Runs the next queued job, if one arrives within `wait_seconds`."""
    taken = store.take(wait_seconds)
    if taken is None:
        return False
    job, spec = taken
    result = runner.run(spec)
    store.finish(job, result)
    logger.info("job %s finished: %s in %.1fs", job.id, result.status, result.elapsed_seconds)
    return True


def make_runner(settings: Settings) -> Runner:
    if settings.solver_runner == "container":
        return ContainerRunner(settings.solver_runner_image, settings.solver_container_runtime)
    return LocalRunner()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings = get_settings()
    # The socket must outlast the blocking wait on the queue, or every idle wait looks like
    # a dead connection.
    redis = Redis.from_url(
        settings.redis_url.get_secret_value(),
        socket_timeout=WAIT_SECONDS + 10,
        health_check_interval=WAIT_SECONDS,
    )
    store = JobStore(redis, settings.max_queue_length)
    runner = make_runner(settings)
    logger.info("worker ready (%s runner)", settings.solver_runner)
    while True:
        try:
            process_next(store, runner)
        except (RedisConnectionError, RedisTimeoutError) as error:
            # A job taken before the outage is reported as lost once it goes stale.
            logger.warning("redis unavailable: %s", error)
            time.sleep(RETRY_SECONDS)


if __name__ == "__main__":
    main()
