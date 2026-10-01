"""FastAPI entry point. Every route sits behind a signed service token; there is no CORS.

There is no synchronous run route (hardening finding 7): jobs are queued and polled.
"""

from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from redis import Redis

from app.auth import Caller, require_scope
from app.config import get_settings
from app.models import JobResult, JobSpec, WireModel
from app.store import Job, JobState, JobStore, QueueFull
from app.tools import SbyTool

router = APIRouter(prefix="/v1")


@lru_cache
def get_store() -> JobStore:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url.get_secret_value())
    return JobStore(redis, settings.max_queue_length)


Store = Annotated[JobStore, Depends(get_store)]


class JobView(WireModel):
    """What the backend sees of a job: no owner, no code, no server paths."""

    id: str
    state: JobState
    position: int | None = None
    result: JobResult | None = None


def _view(store: JobStore, job: Job) -> JobView:
    position = store.position(job.id) if job.state == "queued" else None
    return JobView(id=job.id, state=job.state, position=position, result=job.result)


@router.get("/health")
def health(_: Annotated[Caller, Depends(require_scope("health"))]) -> dict[str, str]:
    return {"status": "ok", "sby": "available" if SbyTool.locate() else "missing"}


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED, response_model_by_alias=True)
def create_job(
    spec: JobSpec, caller: Annotated[Caller, Depends(require_scope("jobs:write"))], store: Store
) -> JobView:
    try:
        job = store.enqueue(caller.user_id, spec)
    except QueueFull as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from error
    return _view(store, job)


@router.get("/jobs/{job_id}", response_model_by_alias=True)
def read_job(
    job_id: UUID, caller: Annotated[Caller, Depends(require_scope("jobs:read"))], store: Store
) -> JobView:
    job = store.get(str(job_id))
    # Another learner's job looks exactly like a missing one.
    if job is None or job.owner != caller.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _view(store, job)


def create_app() -> FastAPI:
    application = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    application.include_router(router)
    return application


app = create_app()
