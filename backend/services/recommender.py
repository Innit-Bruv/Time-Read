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
from sqlalchemy import func, and_

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

    Computes completed segment IDs once upfront (instead of once per tier)
    to avoid repeated DB round-trips.

    Returns:
        dict with session_id, total_estimated_time, items[]
    """
    items = []
    remaining_time = time_budget

    # Get user reading speed
    user_stats = db.query(UserStats).filter(UserStats.id == 1).first()
    reading_speed = int(user_stats.reading_speed) if user_stats else 200

    # Compute completed segment IDs once — reused by all four tiers.
    completed_ids = _get_completed_segment_ids(db)

    # Build a lazily-populated segment count cache so _segment_to_item
    # never fires a per-item COUNT query.
    seg_count_cache: dict = {}

    # 1. Unfinished segments (highest priority)
    unfinished = _get_unfinished_segments(db, completed_ids)
    for seg_info in unfinished:
        if remaining_time <= 0:
            break
        if seg_info["estimated_time"] <= remaining_time:
            items.append(seg_info)
            remaining_time -= seg_info["estimated_time"]

    # 2. Topic-similar segments (vector similarity)
    if remaining_time > 0 and topic:
        used_segment_ids = {item["segment_id"] for item in items}
        similar = _get_topic_similar_segments(
            db, topic, content_type, used_segment_ids, completed_ids, seg_count_cache
        )
        for seg_info in similar:
            if remaining_time <= 0:
                break
            if seg_info["estimated_time"] <= remaining_time:
                items.append(seg_info)
                remaining_time -= seg_info["estimated_time"]

    # 3. Content type filtered (no topic)
    if remaining_time > 0 and content_type and not topic:
        used_segment_ids = {item["segment_id"] for item in items}
        typed = _get_typed_segments(
            db, content_type, used_segment_ids, completed_ids, seg_count_cache
        )
        for seg_info in typed:
            if remaining_time <= 0:
                break
            if seg_info["estimated_time"] <= remaining_time:
                items.append(seg_info)
                remaining_time -= seg_info["estimated_time"]

    # 4. Oldest unread (fill remaining)
    if remaining_time > 0:
        used_segment_ids = {item["segment_id"] for item in items}
        oldest = _get_oldest_unread_segments(
            db, used_segment_ids, completed_ids, seg_count_cache
        )
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


def _get_completed_segment_ids(db: Session) -> set:
    """Get set of segment IDs that have been completed. Called once per pack."""
    completed = (
        db.query(ReadingSession.segment_id)
        .filter(ReadingSession.completed == True)
        .distinct()
        .all()
    )
    return {row[0] for row in completed}


def _get_segment_count(db: Session, content_id, cache: dict) -> int:
    """Return total segment count for a content item, using cache to avoid N+1."""
    if content_id not in cache:
        cache[content_id] = (
            db.query(func.count(Segment.id))
            .filter(Segment.content_id == content_id)
            .scalar() or 0
        )
    return cache[content_id]


def _get_unfinished_segments(db: Session, completed_ids: set) -> list[dict]:
    """Get segments that have been started but not completed."""
    started_subquery = (
        db.query(ReadingSession.segment_id)
        .filter(ReadingSession.completed == False)
        .distinct()
        .subquery()
    )

    segments = (
        db.query(Segment, Content)
        .join(Content, Segment.content_id == Content.id)
        .filter(Segment.id.in_(started_subquery))
        .filter(~Segment.id.in_(completed_ids))
        .filter(Content.status == "ready")
        .order_by(Content.created_at.asc())
        .all()
    )

    # Bulk-precompute segment counts for all content in this result.
    content_ids = list({content.id for _, content in segments})
    cache: dict = {}
    if content_ids:
        rows = (
            db.query(Segment.content_id, func.count(Segment.id))
            .filter(Segment.content_id.in_(content_ids))
            .group_by(Segment.content_id)
            .all()
        )
        cache = dict(rows)

    return [_segment_to_item(seg, content, cache) for seg, content in segments]


def _get_topic_similar_segments(
    db: Session,
    topic: str,
    content_type: Optional[str],
    exclude_ids: set,
    completed_ids: set,
    seg_count_cache: dict,
) -> list[dict]:
    """Get segments from content similar to the topic via vector similarity."""
    try:
        topic_embedding = generate_embedding(topic)
    except Exception as e:
        logger.warning(f"Could not generate topic embedding: {e}")
        return []

    exclude_all = exclude_ids | completed_ids

    query = (
        db.query(Content)
        .filter(Content.status == "ready")
        .filter(Content.embedding.isnot(None))
    )
    if content_type:
        query = query.filter(Content.content_type == content_type)

    query = query.order_by(Content.embedding.cosine_distance(topic_embedding)).limit(20)

    results = []
    for content in query.all():
        segments = (
            db.query(Segment)
            .filter(Segment.content_id == content.id)
            .order_by(Segment.segment_index)
            .all()
        )
        # Populate cache for this content
        seg_count_cache[content.id] = len(segments)
        for seg in segments:
            if seg.id not in exclude_all:
                results.append(_segment_to_item(seg, content, seg_count_cache))

    return results


def _get_typed_segments(
    db: Session,
    content_type: str,
    exclude_ids: set,
    completed_ids: set,
    seg_count_cache: dict,
) -> list[dict]:
    """Get unread segments of a specific content type."""
    exclude_all = exclude_ids | completed_ids

    segments = (
        db.query(Segment, Content)
        .join(Content, Segment.content_id == Content.id)
        .filter(Content.status == "ready")
        .filter(Content.content_type == content_type)
        .order_by(Content.created_at.desc(), Segment.segment_index)
        .all()
    )

    _bulk_populate_cache(db, segments, seg_count_cache)

    return [
        _segment_to_item(seg, content, seg_count_cache)
        for seg, content in segments
        if seg.id not in exclude_all
    ]


def _get_oldest_unread_segments(
    db: Session,
    exclude_ids: set,
    completed_ids: set,
    seg_count_cache: dict,
) -> list[dict]:
    """Get oldest unread segments."""
    exclude_all = exclude_ids | completed_ids

    segments = (
        db.query(Segment, Content)
        .join(Content, Segment.content_id == Content.id)
        .filter(Content.status == "ready")
        .order_by(Content.created_at.asc(), Segment.segment_index)
        .all()
    )

    _bulk_populate_cache(db, segments, seg_count_cache)

    return [
        _segment_to_item(seg, content, seg_count_cache)
        for seg, content in segments
        if seg.id not in exclude_all
    ]


def _bulk_populate_cache(db: Session, segments: list, cache: dict) -> None:
    """Precompute segment counts for all content IDs not already in cache."""
    missing_ids = list(
        {content.id for _, content in segments if content.id not in cache}
    )
    if not missing_ids:
        return
    rows = (
        db.query(Segment.content_id, func.count(Segment.id))
        .filter(Segment.content_id.in_(missing_ids))
        .group_by(Segment.content_id)
        .all()
    )
    cache.update(dict(rows))


def _segment_to_item(segment: Segment, content: Content, seg_count_cache: dict) -> dict:
    """Convert a Segment + Content to a recommendation item dict."""
    total_segments = seg_count_cache.get(content.id, 0)
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
        "is_continuation": segment.segment_index > 0,
    }
