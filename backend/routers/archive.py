"""Archive router — GET /archive with search, filtering, sorting, and pagination."""
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, case

from auth import verify_api_key
from db.database import get_db
from models.content import Content, Segment, ReadingSession
from models.schemas import ArchiveResponse, ArchiveItem

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/archive", response_model=ArchiveResponse)
def get_archive(
    search: str = Query(default="", description="Text search"),
    content_type: str = Query(default="", description="Filter by content type"),
    sort: str = Query(default="recent", description="Sort order: recent|oldest|unread"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Browse saved content with search, filtering, and pagination."""
    query = db.query(Content)

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            Content.title.ilike(search_pattern) | Content.clean_text.ilike(search_pattern)
        )

    # Content type filter
    if content_type:
        query = query.filter(Content.content_type == content_type)

    # Get total count
    total = query.count()

    # Sort
    if sort == "oldest":
        query = query.order_by(asc(Content.created_at))
    elif sort == "unread":
        query = query.order_by(asc(Content.created_at))  # oldest-first = most likely unread
    else:  # recent
        query = query.order_by(desc(Content.created_at))

    # Pagination
    offset = (page - 1) * limit
    contents = query.offset(offset).limit(limit).all()

    if not contents:
        return ArchiveResponse(items=[], total=total, page=page, limit=limit)

    content_ids = [c.id for c in contents]

    # Single query: total segment count per content item
    segment_counts = dict(
        db.query(Segment.content_id, func.count(Segment.id))
        .filter(Segment.content_id.in_(content_ids))
        .group_by(Segment.content_id)
        .all()
    )

    # Single query: completed segment count per content item
    completed_counts = dict(
        db.query(Segment.content_id, func.count(func.distinct(ReadingSession.segment_id)))
        .join(ReadingSession, ReadingSession.segment_id == Segment.id)
        .filter(Segment.content_id.in_(content_ids))
        .filter(ReadingSession.completed == True)
        .group_by(Segment.content_id)
        .all()
    )

    items = []
    for content in contents:
        total_segs = segment_counts.get(content.id, 0)
        completed_segs = completed_counts.get(content.id, 0)
        completion = (
            round((completed_segs / total_segs) * 100, 1) if total_segs > 0 else 0.0
        )
        items.append(
            ArchiveItem(
                content_id=content.id,
                title=content.title,
                source=content.source,
                content_type=content.content_type,
                estimated_time=content.estimated_time or 0,
                status=content.status,
                created_at=content.created_at,
                completion_percent=completion,
            )
        )

    return ArchiveResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
    )
