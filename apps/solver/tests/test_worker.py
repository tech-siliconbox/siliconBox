"""Finding 6: jobs are persisted, survive in the store, and a lost run is reported."""

import time

from app.models import JobResult, JobSpec
from app.store import STALE_AFTER_SECONDS, JobStore
from app.worker import process_next
from tests.conftest import counter_spec


class FakeRunner:
    def __init__(self) -> None:
        self.seen: list[JobSpec] = []

    def run(self, spec: JobSpec) -> JobResult:
        self.seen.append(spec)
        return JobResult(status="FAIL", elapsed_seconds=0.5, failed_check="ap_x")


def test_runs_queued_jobs_in_order(store: JobStore) -> None:
    first = store.enqueue("learner-1", counter_spec())
    second = store.enqueue("learner-2", counter_spec("counter_bug.sv"))
    assert store.position(first.id) == 1
    assert store.position(second.id) == 2

    runner = FakeRunner()
    assert process_next(store, runner, wait_seconds=1)
    assert runner.seen[0].design == counter_spec().design
    done = store.get(first.id)
    assert done is not None
    assert done.state == "done"
    assert done.result is not None
    assert done.result.failed_check == "ap_x"
    assert store.position(second.id) == 1


def test_the_code_is_dropped_once_the_job_is_taken(store: JobStore) -> None:
    job = store.enqueue("learner-1", counter_spec())
    process_next(store, FakeRunner(), wait_seconds=1)
    assert store._redis.get(f"solver:spec:{job.id}") is None  # noqa: SLF001


def test_an_empty_queue_returns_quietly(store: JobStore) -> None:
    assert not process_next(store, FakeRunner(), wait_seconds=1)


def test_a_run_lost_with_its_worker_is_reported(store: JobStore) -> None:
    job = store.enqueue("learner-1", counter_spec())
    taken = store.take(wait_seconds=1)
    assert taken is not None
    running = taken[0]
    stale = running.model_copy(update={"started_at": time.time() - STALE_AFTER_SECONDS - 1})
    store._save(stale)  # noqa: SLF001
    seen = store.get(job.id)
    assert seen is not None
    assert seen.state == "done"
    assert seen.result is not None
    assert seen.result.status == "ERROR"
