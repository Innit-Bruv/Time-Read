"""Session router — POST /session/track, GET /content/{id}/segment/{id}, GET /content/{id}/segments."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from auth import verify_api_key
from db.database import get_db
from models.content import Content, Segment, ReadingSession, UserStats
from models.schemas import TrackRequest, TrackResponse, SegmentResponse, RecommendItem, RecommendResponse

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
    items = [
        RecommendItem(
            content_id=content.id,
            segment_id=seg.id,
            title=content.title,
            source=content.source,
            author=content.author,
            content_type=content.content_type,
            estimated_time=seg.estimated_time,
            segment_index=seg.segment_index,
            total_segments=total_segments,
            is_continuation=seg.segment_index > 0,
        )
        for seg in segments
    ]

    return RecommendResponse(
        session_id=uuid.uuid4(),
        total_estimated_time=sum(seg.estimated_time for seg in segments),
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
