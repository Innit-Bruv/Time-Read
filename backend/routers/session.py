"""Session router — POST /session/track, GET /content/{id}/segment/{id}."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from auth import verify_api_key
from db.database import get_db
from models.content import Content, Segment, ReadingSession, UserStats
from models.schemas import TrackRequest, TrackResponse, SegmentResponse

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
    )


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
        ended_at=datetime.now(timezone.utc) if req.completed else None,
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
