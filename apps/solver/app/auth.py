"""Service authentication: only the SiliconBox backend may call the solver.

A shared bearer token for now. Hardening finding 5 (docs/security/solver-hardening.md)
replaces it with signed short-lived tokens plus a network allow-list in phase 3.
"""

import hmac
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


def require_service_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    expected = settings.solver_service_token.get_secret_value()
    presented = credentials.credentials if credentials is not None else ""
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
