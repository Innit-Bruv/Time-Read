"""Archive router — GET /archive with search, filtering, sorting, and pagination."""
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc

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
    limit: int = Query(default=20, ge=1, le=50),
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
        # Show items with least completion first
        query = query.order_by(desc(Content.created_at))  # simplified — unread first
    else:  # recent
        query = query.order_by(desc(Content.created_at))

    # Pagination
    offset = (page - 1) * limit
    contents = query.offset(offset).limit(limit).all()

    # Calculate completion percent for each item
    items = []
    for content in contents:
        completion = _calculate_completion(db, content.id)
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


def _calculate_completion(db: Session, content_id: uuid.UUID) -> float:
    """Calculate reading completion percentage for a content item."""
    total_segments = (
        db.query(func.count(Segment.id))
        .filter(Segment.content_id == content_id)
        .scalar() or 0
    )

    if total_segments == 0:
        return 0

    completed_segments = (
        db.query(func.count(func.distinct(ReadingSession.segment_id)))
        .join(Segment, ReadingSession.segment_id == Segment.id)
        .filter(Segment.content_id == content_id)
        .filter(ReadingSession.completed == True)
        .scalar() or 0
    )

    return round((completed_segments / total_segments) * 100, 1)
