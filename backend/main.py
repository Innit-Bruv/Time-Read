"""FastAPI main application — TimeRead backend."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import ingest, recommend, archive, session  # noqa

app = FastAPI(
    title="TimeRead API",
    version="1.0.0",
    description="Personal time-aware reading system backend",
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


@app.get("/health")
def health_check():
    return {"status": "ok"}
