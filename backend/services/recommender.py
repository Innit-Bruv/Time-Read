"""Recommendation engine — generates time-fitted reading packs.

Priority ordering per PRD Section 11:
1. Unfinished segments (highest priority)
2. Topic-similar (vector similarity search)
3. Content type match
4. Oldest unread
"""
import uuid
import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text, and_

from models.content import Content, Segment, ReadingSession, UserStats
from services.embedder import generate_embedding

logger = logging.getLogger(__name__)


def generate_pack(
    db: Session,
    time_budget: float,
    topic: Optional[str] = None,
    content_type: Optional[str] = None,
) -> dict:
    """Generate a reading pack that fits within time_budget minutes.
    
    Returns:
        dict with session_id, total_estimated_time, items[]
    """
    items = []
    remaining_time = time_budget

    # Get user reading speed
    user_stats = db.query(UserStats).filter(UserStats.id == 1).first()
    reading_speed = int(user_stats.reading_speed) if user_stats else 200

    # 1. Unfinished segments (highest priority)
    unfinished = _get_unfinished_segments(db)
    for seg_info in unfinished:
        if remaining_time <= 0:
            break
        if seg_info["estimated_time"] <= remaining_time:
            items.append(seg_info)
            remaining_time -= seg_info["estimated_time"]

    # 2. Topic-similar segments (vector similarity)
    if remaining_time > 0 and topic:
        used_segment_ids = {item["segment_id"] for item in items}
        similar = _get_topic_similar_segments(db, topic, content_type, used_segment_ids)
        for seg_info in similar:
            if remaining_time <= 0:
                break
            if seg_info["estimated_time"] <= remaining_time:
                items.append(seg_info)
                remaining_time -= seg_info["estimated_time"]

    # 3. Content type filtered (no topic)
    if remaining_time > 0 and content_type and not topic:
        used_segment_ids = {item["segment_id"] for item in items}
        typed = _get_typed_segments(db, content_type, used_segment_ids)
        for seg_info in typed:
            if remaining_time <= 0:
                break
            if seg_info["estimated_time"] <= remaining_time:
                items.append(seg_info)
                remaining_time -= seg_info["estimated_time"]

    # 4. Oldest unread (fill remaining)
    if remaining_time > 0:
        used_segment_ids = {item["segment_id"] for item in items}
        oldest = _get_oldest_unread_segments(db, used_segment_ids)
        for seg_info in oldest:
            if remaining_time <= 0:
                break
            if seg_info["estimated_time"] <= remaining_time:
                items.append(seg_info)
                remaining_time -= seg_info["estimated_time"]

    total_time = sum(item["estimated_time"] for item in items)

    return {
        "session_id": str(uuid.uuid4()),
        "total_estimated_time": round(total_time, 1),
        "items": items,
    }


def _get_unfinished_segments(db: Session) -> list[dict]:
    """Get segments that have been started but not completed."""
    # Find segments with at least one incomplete session
    subquery = (
        db.query(ReadingSession.segment_id)
        .filter(ReadingSession.completed == False)
        .distinct()
        .subquery()
    )

    # Exclude completed segments
    completed_subquery = (
        db.query(ReadingSession.segment_id)
        .filter(ReadingSession.completed == True)
        .distinct()
        .subquery()
    )

    segments = (
        db.query(Segment, Content)
        .join(Content, Segment.content_id == Content.id)
        .filter(Segment.id.in_(subquery))
        .filter(~Segment.id.in_(completed_subquery))
        .filter(Content.status == "ready")
        .order_by(Content.created_at.asc())
        .all()
    )

    return [_segment_to_item(seg, content, db) for seg, content in segments]


def _get_topic_similar_segments(
    db: Session, topic: str, content_type: Optional[str],
    exclude_ids: set
) -> list[dict]:
    """Get segments from content similar to the topic via vector similarity."""
    try:
        topic_embedding = generate_embedding(topic)
    except Exception as e:
        logger.warning(f"Could not generate topic embedding: {e}")
        return []

    # Get completed segment IDs to exclude
    completed_ids = _get_completed_segment_ids(db)
    exclude_all = exclude_ids | completed_ids

    # Vector similarity query
    query = (
        db.query(Content)
        .filter(Content.status == "ready")
        .filter(Content.embedding.isnot(None))
    )
    if content_type:
        query = query.filter(Content.content_type == content_type)

    # Order by cosine similarity
    query = query.order_by(Content.embedding.cosine_distance(topic_embedding))
    query = query.limit(20)

    results = []
    for content in query.all():
        segments = (
            db.query(Segment)
            .filter(Segment.content_id == content.id)
            .order_by(Segment.segment_index)
            .all()
        )
        for seg in segments:
            if seg.id not in exclude_all:
                results.append(_segment_to_item(seg, content, db))

    return results


def _get_typed_segments(
    db: Session, content_type: str, exclude_ids: set
) -> list[dict]:
    """Get unread segments of a specific content type."""
    completed_ids = _get_completed_segment_ids(db)
    exclude_all = exclude_ids | completed_ids

    segments = (
        db.query(Segment, Content)
        .join(Content, Segment.content_id == Content.id)
        .filter(Content.status == "ready")
        .filter(Content.content_type == content_type)
        .order_by(Content.created_at.desc(), Segment.segment_index)
        .all()
    )

    return [
        _segment_to_item(seg, content, db)
        for seg, content in segments
        if seg.id not in exclude_all
    ]


def _get_oldest_unread_segments(db: Session, exclude_ids: set) -> list[dict]:
    """Get oldest unread segments."""
    completed_ids = _get_completed_segment_ids(db)
    exclude_all = exclude_ids | completed_ids

    segments = (
        db.query(Segment, Content)
        .join(Content, Segment.content_id == Content.id)
        .filter(Content.status == "ready")
        .order_by(Content.created_at.asc(), Segment.segment_index)
        .all()
    )

    return [
        _segment_to_item(seg, content, db)
        for seg, content in segments
        if seg.id not in exclude_all
    ]


def _get_completed_segment_ids(db: Session) -> set:
    """Get set of segment IDs that have been completed."""
    completed = (
        db.query(ReadingSession.segment_id)
        .filter(ReadingSession.completed == True)
        .distinct()
        .all()
    )
    return {row[0] for row in completed}


def _segment_to_item(segment: Segment, content: Content, db: Session) -> dict:
    """Convert a Segment + Content to a recommendation item dict."""
    total_segments = (
        db.query(func.count(Segment.id))
        .filter(Segment.content_id == content.id)
        .scalar()
    )

    # Check if this is a continuation (segment_index > 0)
    is_continuation = segment.segment_index > 0

    return {
        "content_id": str(content.id),
        "segment_id": str(segment.id),
        "title": content.title,
        "source": content.source,
        "author": content.author,
        "content_type": content.content_type,
        "estimated_time": segment.estimated_time,
        "segment_index": segment.segment_index,
        "total_segments": total_segments,
        "is_continuation": is_continuation,
    }
