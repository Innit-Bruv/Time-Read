"""Recommend router — POST /recommend."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import verify_api_key
from db.database import get_db
from models.schemas import RecommendRequest, RecommendResponse, RecommendItem
from services.recommender import generate_pack
from services.llm_parser import parse_query

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest, db: Session = Depends(get_db)):
    """Generate a reading pack fitting the time budget.
    
    At minimum `query` OR `time_budget` must be present.
    """
    time_budget = req.time_budget
    topic = req.topic
    content_type = req.content_type

    # If query provided and time_budget is missing, parse it
    if req.query and time_budget is None:
        parsed = parse_query(req.query)
        time_budget = parsed.get("time_budget")
        if not topic:
            topic = parsed.get("topic")
        if not content_type:
            content_type = parsed.get("content_type")

    if time_budget is None:
        raise HTTPException(status_code=422, detail="Could not parse time from query")

    # Generate the reading pack
    pack = generate_pack(
        db=db,
        time_budget=time_budget,
        topic=topic,
        content_type=content_type,
    )

    if not pack["items"]:
        raise HTTPException(
            status_code=404,
            detail="Nothing matches that time window. Try a longer session.",
        )

    # Convert to response model
    items = [
        RecommendItem(
            content_id=uuid.UUID(item["content_id"]),
            segment_id=uuid.UUID(item["segment_id"]),
            title=item["title"],
            source=item["source"],
            author=item["author"],
            content_type=item["content_type"],
            estimated_time=item["estimated_time"],
            segment_index=item["segment_index"],
            total_segments=item["total_segments"],
            is_continuation=item["is_continuation"],
        )
        for item in pack["items"]
    ]

    return RecommendResponse(
        session_id=uuid.UUID(pack["session_id"]),
        total_estimated_time=pack["total_estimated_time"],
        items=items,
    )
