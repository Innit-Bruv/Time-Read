"""FastAPI main application — TimeRead backend."""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import ingest, recommend, archive, session, content  # noqa

logger = logging.getLogger(__name__)

DEFAULT_SECRET = "dev-secret-change-me"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate critical env vars at startup — fail fast in production."""
    env = os.getenv("ENV", "development")
    secret = os.getenv("INTERNAL_API_SECRET", DEFAULT_SECRET)

    if secret == DEFAULT_SECRET and env != "development":
        raise RuntimeError(
            "INTERNAL_API_SECRET is set to the default dev value in a non-development "
            "environment. Set a strong secret in your environment variables."
        )

    if not os.getenv("GEMINI_API_KEY"):
        logger.warning(
            "GEMINI_API_KEY is not set — embedding and LLM features will fail. "
            "Set GEMINI_API_KEY in your environment."
        )

    if secret == DEFAULT_SECRET:
        logger.warning(
            "INTERNAL_API_SECRET is using the default dev value. "
            "Set a strong secret before deploying to production."
        )

    yield


app = FastAPI(
    title="TimeRead API",
    version="1.0.0",
    description="Personal time-aware reading system backend",
    lifespan=lifespan,
)

# CORS
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ingest.router, tags=["ingest"])
app.include_router(recommend.router, tags=["recommend"])
app.include_router(archive.router, tags=["archive"])
app.include_router(session.router, tags=["session"])
app.include_router(content.router, tags=["content"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
