"""Service authentication: only the SiliconBox backend may call the solver.

Hardening findings 4 and 5. Every call carries a short-lived token signed (HS256) with the key
shared by the web app and the solver. The token names the learner the call is for (`sub`)
and what it may do (`scope`), so a token minted to read one learner's run cannot submit jobs
or read another learner's runs. There is no CORS: browsers are never callers.
"""

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

ISSUER = "siliconbox-web"
AUDIENCE = "siliconbox-solver"
MAX_TOKEN_LIFETIME_SECONDS = 120
CLOCK_LEEWAY_SECONDS = 5

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Caller:
    user_id: str
    scope: str


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def verify_token(token: str, key: str) -> Caller:
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"],
            audience=AUDIENCE,
            issuer=ISSUER,
            leeway=CLOCK_LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "scope"]},
        )
    except jwt.PyJWTError as error:
        raise _unauthorized() from error
    if claims["exp"] - claims["iat"] > MAX_TOKEN_LIFETIME_SECONDS:
        raise _unauthorized()
    user_id, scope = claims["sub"], claims["scope"]
    if not isinstance(user_id, str) or not user_id or not isinstance(scope, str):
        raise _unauthorized()
    return Caller(user_id=user_id, scope=scope)


def require_scope(scope: str):  # noqa: ANN201  Returns a FastAPI dependency.
    def dependency(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> Caller:
        if credentials is None:
            raise _unauthorized()
        key = settings.solver_signing_key.get_secret_value()
        caller = verify_token(credentials.credentials, key)
        if caller.scope != scope:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        return caller

    return dependency
