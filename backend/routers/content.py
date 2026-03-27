"""Content router — mutations on existing content (delete, undelete, finish)."""
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import verify_api_key
from db.database import get_db
from models.content import Content

router = APIRouter(dependencies=[Depends(verify_api_key)])
logger = logging.getLogger(__name__)


@router.delete("/content/{content_id}", status_code=200)
def delete_content(content_id: uuid.UUID, db: Session = Depends(get_db)):
    """Soft-delete an article. Hidden from archive and recommendations until re-ingested."""
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    content.is_deleted = True
    db.commit()
    logger.info(f"Content {content_id} soft-deleted")
    return {"ok": True}


@router.post("/content/{content_id}/undelete", status_code=200)
def undelete_content(content_id: uuid.UUID, db: Session = Depends(get_db)):
    """Undo a soft-delete. Restores article to archive and recommendations."""
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    content.is_deleted = False
    db.commit()
    logger.info(f"Content {content_id} un-deleted")
    return {"ok": True}
