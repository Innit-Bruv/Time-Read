"""Ingest router — POST /ingest, GET /content/{id}/status."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import verify_api_key
from db.database import get_db
from models.content import Content
from models.schemas import IngestRequest, IngestResponse, ContentStatusResponse

router = APIRouter(dependencies=[Depends(verify_api_key)])


def _detect_content_type(url: str, source_hint: str | None = None) -> str:
    """Detect content type from URL patterns and optional hint."""
    url_lower = url.lower()
    if source_hint:
        hint_lower = source_hint.lower()
        if hint_lower in ("twitter_thread", "substack", "article", "pdf_report", "research_paper"):
            return hint_lower

    if "twitter.com" in url_lower or "x.com" in url_lower:
        return "twitter_thread"
    elif "substack.com" in url_lower or ".substack." in url_lower:
        return "substack"
    elif url_lower.endswith(".pdf"):
        return "pdf_report"
    elif "arxiv.org" in url_lower or "scholar.google" in url_lower:
        return "research_paper"
    else:
        return "article"


@router.post("/ingest", response_model=IngestResponse, status_code=202)
def ingest_content(req: IngestRequest, db: Session = Depends(get_db)):
    """Save a new URL for processing. Returns 409 if already exists."""
    # Check for duplicate URL
    existing = db.query(Content).filter(Content.url == req.url).first()
    if existing:
        return IngestResponse(
            content_id=existing.id,
            status=existing.status,
            message="Already saved",
        )

    # Detect content type
    content_type = _detect_content_type(req.url, req.source_hint)

    # Create content record
    content = Content(
        title=req.title or "Untitled",
        url=req.url,
        content_type=content_type,
        status="pending",
    )
    db.add(content)
    db.commit()
    db.refresh(content)

    # Dispatch async processing via Celery
    try:
        from tasks.process_content import process_content_task
        process_content_task.delay(str(content.id))
    except Exception:
        # Celery/Redis not available — run pipeline synchronously as fallback.
        # Calls run_pipeline directly (not the Celery task wrapper) to avoid
        # the self.retry() Celery context requirement.
        try:
            from tasks.process_content import run_pipeline
            run_pipeline(str(content.id))
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(
                f"Synchronous fallback pipeline failed for {content.id}: {e}"
            )

    return IngestResponse(
        content_id=content.id,
        status="processing",
        message="Content queued for processing",
    )


@router.get("/content/{content_id}/status", response_model=ContentStatusResponse)
def get_content_status(content_id: uuid.UUID, db: Session = Depends(get_db)):
    """Poll processing status."""
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    return ContentStatusResponse(
        content_id=content.id,
        status=content.status,
        title=content.title,
        estimated_time=content.estimated_time,
        error_message=content.error_message,
    )
