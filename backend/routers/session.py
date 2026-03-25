"""Session router — POST /session/track, GET /content/{id}/segment/{id}, GET /content/{id}/segments."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from auth import verify_api_key
from db.database import get_db
from models.content import Content, Segment, ReadingSession, UserStats
from models.schemas import TrackRequest, TrackResponse, SegmentResponse, RecommendItem, RecommendResponse, ManualSessionRequest

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/content/{content_id}/segment/{segment_id}", response_model=SegmentResponse)
def get_segment(content_id: uuid.UUID, segment_id: uuid.UUID, db: Session = Depends(get_db)):
    """Fetch segment text for reading."""
    segment = (
        db.query(Segment)
        .filter(Segment.id == segment_id, Segment.content_id == content_id)
        .first()
    )
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    total_segments = (
        db.query(func.count(Segment.id))
        .filter(Segment.content_id == content_id)
        .scalar()
    )

    return SegmentResponse(
        segment_id=segment.id,
        content_id=content.id,
        title=content.title,
        author=content.author,
        source=content.source,
        url=content.url,
        content_type=content.content_type,
        segment_index=segment.segment_index,
        total_segments=total_segments,
        estimated_time=segment.estimated_time,
        text=segment.text,
        word_count=segment.word_count,
        cover_image=content.cover_image,
        publish_date=content.publish_date,
    )


@router.get("/content/{content_id}/segments", response_model=RecommendResponse)
def get_content_segments(content_id: uuid.UUID, db: Session = Depends(get_db)):
    """Return all segments of a content item as a RecommendResponse so the Reader can consume them directly."""
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    if content.status != "ready":
        raise HTTPException(status_code=409, detail=f"Content is not ready (status: {content.status})")

    segments = (
        db.query(Segment)
        .filter(Segment.content_id == content_id)
        .order_by(Segment.segment_index)
        .all()
    )
    if not segments:
        raise HTTPException(status_code=404, detail="No segments found for this content")

    total_segments = len(segments)
    total_article_time = round(sum(seg.estimated_time for seg in segments), 1)
    items = [
        RecommendItem(
            content_id=content.id,
            segment_id=seg.id,
            title=content.title,
            source=content.source,
            author=content.author,
            content_type=content.content_type,
            estimated_time=seg.estimated_time,
            article_total_time=total_article_time,
            segment_index=seg.segment_index,
            total_segments=total_segments,
            is_continuation=seg.segment_index > 0,
        )
        for seg in segments
    ]

    return RecommendResponse(
        session_id=uuid.uuid4(),
        total_estimated_time=total_article_time,
        items=items,
    )


@router.post("/session/manual", response_model=RecommendResponse)
def manual_session(req: ManualSessionRequest, db: Session = Depends(get_db)):
    """Build a chunk reading session from explicitly selected articles.

    Divides time_budget equally across N content_ids. For each article,
    picks up from the last tracked paragraph_end (resumption-aware).
    Minimum chunk: 1 minute. Articles not yet ready are silently skipped.

    Flow:
      content_ids[] + time_budget
        → chunk_minutes = max(1, budget / N)
        → for each article: find segment, lookup last paragraph_end,
          walk paragraphs until chunk_words reached
        → return RecommendItem[] with paragraph_start/end set per chunk
    """
    if not req.content_ids:
        raise HTTPException(status_code=400, detail="No articles selected")
    if req.time_budget <= 0:
        raise HTTPException(status_code=400, detail="time_budget must be positive")

    n = len(req.content_ids)
    chunk_minutes = max(1.0, req.time_budget / n)

    user_stats = db.query(UserStats).filter(UserStats.id == 1).first()
    reading_speed = user_stats.reading_speed if user_stats else 200.0
    chunk_words = chunk_minutes * reading_speed

    # Batch-fetch reading history for all first segments (single query)
    # Maps segment_id → last paragraph_end
    items = []
    for content_id in req.content_ids:
        content = db.query(Content).filter(Content.id == content_id).first()
        if not content or content.status != "ready":
            continue

        segment = (
            db.query(Segment)
            .filter(Segment.content_id == content_id)
            .order_by(Segment.segment_index)
            .first()
        )
        if not segment:
            continue

        total_segments = (
            db.query(func.count(Segment.id))
            .filter(Segment.content_id == content_id)
            .scalar()
        )

        # Full article time = sum of all segment estimated_times
        article_total_time = round(
            db.query(func.sum(Segment.estimated_time))
            .filter(Segment.content_id == content_id)
            .scalar() or 0,
            1,
        )

        # Resumption: last paragraph_end for this segment
        last_session = (
            db.query(ReadingSession)
            .filter(ReadingSession.segment_id == segment.id)
            .order_by(ReadingSession.ended_at.desc())
            .first()
        )
        para_start = 0
        if last_session and last_session.paragraph_end is not None:
            para_start = last_session.paragraph_end

        # Split into paragraphs and find chunk boundary
        paragraphs = [p for p in segment.text.split("\n\n") if p.strip()]
        total_paras = len(paragraphs)

        if para_start >= total_paras:
            para_start = 0  # fully read before — restart from beginning

        running_words = 0
        para_end = None  # None = show full article (shorter than chunk)
        for i, para in enumerate(paragraphs[para_start:], start=para_start):
            running_words += len(para.split())
            if running_words >= chunk_words:
                para_end = i + 1  # exclusive
                break

        items.append(RecommendItem(
            content_id=content.id,
            segment_id=segment.id,
            title=content.title,
            source=content.source,
            author=content.author,
            content_type=content.content_type,
            estimated_time=chunk_minutes,
            article_total_time=article_total_time,
            segment_index=segment.segment_index,
            total_segments=total_segments,
            is_continuation=para_start > 0,
            paragraph_start=para_start,
            paragraph_end=para_end,
        ))

    if not items:
        raise HTTPException(status_code=409, detail="None of the selected articles are ready")

    return RecommendResponse(
        session_id=uuid.uuid4(),
        total_estimated_time=sum(item.estimated_time for item in items),
        items=items,
    )


@router.post("/content/{content_id}/re-extract")
def re_extract_metadata(content_id: uuid.UUID, db: Session = Depends(get_db)):
    """Re-fetch a content item's URL and update cover_image + publish_date.

    Does NOT re-segment or re-embed — only refreshes metadata fields that may
    have been NULL because the article was ingested before those columns existed.
    Safe to call on any ready article.
    """
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    if content.content_type == "pdf_report":
        raise HTTPException(status_code=400, detail="PDFs do not have extractable metadata")

    from services.extractor import fetch_and_extract, ExtractionError
    try:
        result = fetch_and_extract(content.url, content.content_type)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=f"Re-extraction failed: {e}")

    updated: list[str] = []
    if result.get("cover_image") and not content.cover_image:
        content.cover_image = result["cover_image"]
        updated.append("cover_image")
    if result.get("publish_date") and not content.publish_date:
        content.publish_date = result["publish_date"]
        updated.append("publish_date")
    if result.get("author") and not content.author:
        content.author = result["author"]
        updated.append("author")

    db.commit()
    return {"ok": True, "updated": updated, "content_id": str(content_id)}


@router.post("/content/{content_id}/finish")
def finish_content(content_id: uuid.UUID, db: Session = Depends(get_db)):
    """Mark an article as finished — it will no longer appear in recommendations.

    Idempotent: calling this on an already-finished article is a no-op.
    """
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    if not content.is_finished:
        content.is_finished = True
        db.commit()
        logger.info(f"Article {content_id} marked finished by user")

    return {"ok": True, "content_id": str(content_id)}


@router.post("/session/track", response_model=TrackResponse)
def track_reading(req: TrackRequest, db: Session = Depends(get_db)):
    """Record reading progress for a segment."""
    # Verify segment exists
    segment = db.query(Segment).filter(Segment.id == req.segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Create reading session record
    session = ReadingSession(
        segment_id=req.segment_id,
        time_spent=req.time_spent,
        words_read=req.words_read,
        completed=req.completed,
        ended_at=datetime.now(timezone.utc),
        paragraph_end=req.paragraph_end,
    )
    db.add(session)

    # Update user stats
    user_stats = db.query(UserStats).filter(UserStats.id == 1).first()
    if user_stats:
        user_stats.total_words += req.words_read
        user_stats.total_time += req.time_spent

        # Recalculate reading speed if enough data (at least 5 minutes)
        if user_stats.total_time > 300 and user_stats.total_words > 0:
            user_stats.reading_speed = round(
                user_stats.total_words / (user_stats.total_time / 60), 1
            )

    db.commit()

    return TrackResponse(ok=True)
