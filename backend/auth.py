"""Auth middleware — validates INTERNAL_API_SECRET on all backend routes."""
import os
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "dev-secret-change-me")


async def verify_api_key(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """Dependency that validates the Bearer token matches INTERNAL_API_SECRET."""
    if credentials.credentials != INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return credentials.credentials
