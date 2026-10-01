"""FastAPI entry point. Every route sits behind the service token; there is no CORS."""

from fastapi import APIRouter, Depends, FastAPI

from app.auth import require_service_token

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app() -> FastAPI:
    application = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    application.include_router(router)
    return application


app = create_app()
