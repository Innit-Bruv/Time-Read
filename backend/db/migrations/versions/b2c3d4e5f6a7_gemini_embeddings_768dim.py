"""gemini_embeddings_768dim

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-22

Migrates embedding column from Vector(1536) (OpenAI text-embedding-3-small)
to Vector(768) (Gemini text-embedding-004) and adds embedding_model column
to track which model generated each row's embedding.

IMPORTANT: Existing embeddings (if any) are incompatible with the new dimension
and must be regenerated. The upgrade drops and recreates the HNSW index.
After running this migration, re-process all content to regenerate embeddings.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the HNSW index before altering the column — index type is dimension-sensitive
    op.execute("DROP INDEX IF EXISTS ix_content_embedding_hnsw")

    # Add embedding_model column
    op.add_column("content", sa.Column("embedding_model", sa.Text(), nullable=True))

    # Change embedding dimension from 1536 → 768
    # NULL out existing embeddings — they are incompatible with the new dimension
    op.execute("UPDATE content SET embedding = NULL")
    op.execute("ALTER TABLE content ALTER COLUMN embedding TYPE vector(768)")

    # Recreate HNSW index for the new dimension
    op.execute(
        "CREATE INDEX ix_content_embedding_hnsw "
        "ON content USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_content_embedding_hnsw")
    op.drop_column("content", "embedding_model")
    op.execute("UPDATE content SET embedding = NULL")
    op.execute("ALTER TABLE content ALTER COLUMN embedding TYPE vector(1536)")
    op.execute(
        "CREATE INDEX ix_content_embedding_hnsw "
        "ON content USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )
