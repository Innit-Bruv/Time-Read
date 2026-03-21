"""initial_schema

Revision ID: 27fb5d66d95d
Revises: 
Create Date: 2026-03-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = '27fb5d66d95d'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # -- content table --
    op.create_table(
        "content",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("source", sa.Text()),
        sa.Column("author", sa.Text()),
        sa.Column("url", sa.Text(), unique=True, nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("clean_text", sa.Text()),
        sa.Column("word_count", sa.Integer(), server_default="0"),
        sa.Column("estimated_time", sa.Float(), server_default="0"),
        sa.Column("embedding", Vector(1536)),
        sa.Column("publish_date", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Text(), server_default="'pending'"),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint(
            "content_type IN ('twitter_thread','substack','article','pdf_report','research_paper')",
            name="ck_content_content_type"
        ),
        sa.CheckConstraint(
            "status IN ('pending','processing','ready','failed')",
            name="ck_content_status"
        ),
    )
    op.create_index("ix_content_embedding_hnsw", "content", ["embedding"],
                    postgresql_using="hnsw",
                    postgresql_with={"m": 16, "ef_construction": 64},
                    postgresql_ops={"embedding": "vector_cosine_ops"})
    op.create_index("ix_content_content_type", "content", ["content_type"])
    op.create_index("ix_content_status", "content", ["status"])
    op.create_index("ix_content_created_at_desc", "content", [sa.text("created_at DESC")])

    # -- segments table --
    op.create_table(
        "segments",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("content_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("content.id", ondelete="CASCADE"), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("estimated_time", sa.Float(), nullable=False),
        sa.UniqueConstraint("content_id", "segment_index", name="uq_segment_content_index"),
    )
    op.create_index("ix_segments_content_id", "segments", ["content_id"])

    # -- reading_sessions table --
    op.create_table(
        "reading_sessions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("segment_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("segments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("time_spent", sa.Float()),
        sa.Column("completed", sa.Boolean(), server_default="false"),
        sa.Column("words_read", sa.Integer(), server_default="0"),
    )
    op.create_index("ix_reading_sessions_segment_id", "reading_sessions", ["segment_id"])

    # -- user_stats table (single row) --
    op.create_table(
        "user_stats",
        sa.Column("id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("reading_speed", sa.Float(), server_default="200"),
        sa.Column("total_words", sa.Integer(), server_default="0"),
        sa.Column("total_time", sa.Float(), server_default="0"),
        sa.CheckConstraint("id = 1", name="ck_user_stats_single_row"),
    )

    # Insert default user_stats row
    op.execute("INSERT INTO user_stats (id) VALUES (1) ON CONFLICT DO NOTHING")


def downgrade() -> None:
    op.drop_table("user_stats")
    op.drop_table("reading_sessions")
    op.drop_table("segments")
    op.drop_table("content")
    op.execute("DROP EXTENSION IF EXISTS vector")
