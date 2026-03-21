"""Celery app configuration and content processing task."""
import os
import logging
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

celery_app = Celery(
    "timeread",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_content_task(self, content_id: str):
    """Main async task: fetch → extract → segment → embed → store.
    
    Called after POST /ingest creates a content record.
    Retries up to 3× with exponential backoff on failure.
    """
    from db.database import SessionLocal
    from models.content import Content, Segment, UserStats
    from services.extractor import fetch_and_extract, ExtractionError
    from services.segmenter import segment_content
    from services.embedder import generate_embedding

    db = SessionLocal()
    try:
        content = db.query(Content).filter(Content.id == content_id).first()
        if not content:
            logger.error(f"Content {content_id} not found")
            return

        # Mark as processing
        content.status = "processing"
        db.commit()

        # Step 1: Extract
        try:
            result = fetch_and_extract(content.url, content.content_type)
        except ExtractionError as e:
            content.status = "failed"
            content.error_message = str(e)
            db.commit()
            return

        # Update content with extracted data
        content.clean_text = result["clean_text"]
        content.word_count = result["word_count"]
        if result.get("title"):
            content.title = result["title"]
        if result.get("author"):
            content.author = result["author"]
        if result.get("source"):
            content.source = result["source"]

        # Step 2: Get reading speed from user_stats
        user_stats = db.query(UserStats).filter(UserStats.id == 1).first()
        reading_speed = int(user_stats.reading_speed) if user_stats else 200

        # Step 3: Calculate estimated reading time
        content.estimated_time = round(content.word_count / reading_speed, 2)

        # Step 4: Segment
        segments_data = segment_content(result["clean_text"], reading_speed)

        # Clear old segments if re-processing
        db.query(Segment).filter(Segment.content_id == content.id).delete()

        for seg_data in segments_data:
            segment = Segment(
                content_id=content.id,
                segment_index=seg_data["segment_index"],
                text=seg_data["text"],
                word_count=seg_data["word_count"],
                estimated_time=seg_data["estimated_time"],
            )
            db.add(segment)

        # Step 5: Generate embedding (title + first 1500 words)
        embed_text = f"{content.title}\n\n{' '.join(result['clean_text'].split()[:1500])}"
        try:
            embedding = generate_embedding(embed_text)
            content.embedding = embedding
        except Exception as e:
            logger.warning(f"Embedding failed for {content_id}: {e}")
            # Non-fatal — content still usable without embedding

        # Mark as ready
        content.status = "ready"
        db.commit()
        logger.info(f"Content {content_id} processed: {content.word_count} words, {len(segments_data)} segments")

    except Exception as e:
        logger.exception(f"Processing failed for {content_id}")
        try:
            content.status = "failed"
            content.error_message = f"processing_error: {str(e)}"
            db.commit()
        except Exception:
            pass

        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=10 * (2 ** self.request.retries))
    finally:
        db.close()
