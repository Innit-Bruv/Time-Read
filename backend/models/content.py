"""SQLAlchemy ORM models for TimeRead."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Text, Integer, Float, Boolean, DateTime,
    ForeignKey, CheckConstraint, UniqueConstraint, Index, text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from db.database import Base


class Content(Base):
    """Main content table — stores ingested articles, threads, PDFs."""
    __tablename__ = "content"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(Text, nullable=False)
    source = Column(Text)  # domain name e.g. "substack.com"
    author = Column(Text)
    url = Column(Text, unique=True, nullable=False)
    content_type = Column(
        Text, nullable=False,
        info={"check": "content_type IN ('twitter_thread','substack','article','pdf_report','research_paper')"}
    )
    clean_text = Column(Text)
    word_count = Column(Integer, default=0)
    estimated_time = Column(Float, default=0)  # minutes
    embedding = Column(Vector(768))   # text-embedding-004 → 768 dim
    embedding_model = Column(Text, default="text-embedding-004")  # track which model generated this
    cover_image = Column(Text)       # og:image URL extracted at ingest; null for older content
    publish_date = Column(DateTime(timezone=True))
    is_finished = Column(Boolean, default=False, nullable=False)  # user-dismissed; excluded from recommendations
    status = Column(
        Text, default="pending",
        info={"check": "status IN ('pending','processing','ready','failed')"}
    )
    error_message = Column(Text)  # populated if status = 'failed'
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    segments = relationship("Segment", back_populates="content", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "content_type IN ('twitter_thread','substack','article','pdf_report','research_paper')",
            name="ck_content_content_type"
        ),
        CheckConstraint(
            "status IN ('pending','processing','ready','failed')",
            name="ck_content_status"
        ),
        Index("ix_content_content_type", "content_type"),
        Index("ix_content_status", "status"),
        Index("ix_content_created_at_desc", text("created_at DESC")),
    )


class Segment(Base):
    """Segments — timed sub-sections of content."""
    __tablename__ = "segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id = Column(UUID(as_uuid=True), ForeignKey("content.id", ondelete="CASCADE"), nullable=False)
    segment_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False)
    estimated_time = Column(Float, nullable=False)  # minutes

    # Relationships
    content = relationship("Content", back_populates="segments")
    reading_sessions = relationship("ReadingSession", back_populates="segment", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("content_id", "segment_index", name="uq_segment_content_index"),
        Index("ix_segments_content_id", "content_id"),
    )


class ReadingSession(Base):
    """Reading sessions — tracks user reading progress per segment."""
    __tablename__ = "reading_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    segment_id = Column(UUID(as_uuid=True), ForeignKey("segments.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True))
    time_spent = Column(Float)  # seconds
    completed = Column(Boolean, default=False)
    words_read = Column(Integer, default=0)
    paragraph_offset = Column(Integer, default=0, nullable=False)  # paragraph index reading started from
    paragraph_end = Column(Integer, nullable=True)  # paragraph index reading stopped at (exclusive); None = reached segment end

    # Relationships
    segment = relationship("Segment", back_populates="reading_sessions")

    __table_args__ = (
        Index("ix_reading_sessions_segment_id", "segment_id"),
    )


class UserStats(Base):
    """User stats — single row, upserted. Tracks reading speed and totals."""
    __tablename__ = "user_stats"

    id = Column(Integer, primary_key=True, default=1)
    reading_speed = Column(Float, default=200)  # words per minute
    total_words = Column(Integer, default=0)
    total_time = Column(Float, default=0)  # seconds

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_user_stats_single_row"),
    )
