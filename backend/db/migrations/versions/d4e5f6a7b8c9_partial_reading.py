"""partial_reading — paragraph-level progress tracking

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-22

Adds paragraph_offset and paragraph_end to reading_sessions so the
recommender can resume partial reads from the correct paragraph when
the user's time budget is smaller than a full segment.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'reading_sessions',
        sa.Column('paragraph_offset', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column(
        'reading_sessions',
        sa.Column('paragraph_end', sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('reading_sessions', 'paragraph_end')
    op.drop_column('reading_sessions', 'paragraph_offset')
