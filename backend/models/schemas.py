"""Pydantic schemas for API request/response validation."""
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, HttpUrl


# --- Ingest ---

class IngestRequest(BaseModel):
    url: str
    title: Optional[str] = None
    source_hint: Optional[str] = None


class IngestResponse(BaseModel):
    content_id: uuid.UUID
    status: str
    message: str


# --- Recommend ---

class RecommendRequest(BaseModel):
    query: Optional[str] = None
    time_budget: Optional[float] = None
    topic: Optional[str] = None
    content_type: Optional[str] = None


class RecommendItem(BaseModel):
    content_id: uuid.UUID
    segment_id: uuid.UUID
    title: str
    source: Optional[str]
    author: Optional[str]
    content_type: str
    estimated_time: float
    segment_index: int
    total_segments: int
    is_continuation: bool


class RecommendResponse(BaseModel):
    session_id: uuid.UUID
    total_estimated_time: float
    items: list[RecommendItem]


# --- Content / Segment ---

class SegmentResponse(BaseModel):
    segment_id: uuid.UUID
    content_id: uuid.UUID
    title: str
    author: Optional[str]
    source: Optional[str]
    url: str
    content_type: str
    segment_index: int
    total_segments: int
    estimated_time: float
    text: str
    word_count: int


# --- Session Tracking ---

class TrackRequest(BaseModel):
    segment_id: uuid.UUID
    time_spent: float  # seconds
    words_read: int
    completed: bool = False


class TrackResponse(BaseModel):
    ok: bool


# --- Archive ---

class ArchiveItem(BaseModel):
    content_id: uuid.UUID
    title: str
    source: Optional[str]
    content_type: str
    estimated_time: float
    status: str
    created_at: datetime
    completion_percent: float = 0


class ArchiveResponse(BaseModel):
    items: list[ArchiveItem]
    total: int
    page: int
    limit: int


# --- Status ---

class ContentStatusResponse(BaseModel):
    content_id: uuid.UUID
    status: str
    title: Optional[str]
    estimated_time: Optional[float]
    error_message: Optional[str]


# --- LLM Parser ---

class ParsedQuery(BaseModel):
    time_budget: Optional[float] = None
    topic: Optional[str] = None
    content_type: Optional[str] = None
