"""cover_image and publish_date on content

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-24

Adds cover_image (og:image URL) and publish_date to the content table.
Both columns are nullable — existing rows keep NULL until re-extracted.

This migration is idempotent: it checks whether each column already
exists (e.g. from the initial schema or a prior partial run) before
attempting to add it, so re-running `alembic upgrade head` is safe.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def _existing_columns(table: str) -> set:
    """Return the set of column names currently present in *table*."""
    bind = op.get_bind()
    return {col["name"] for col in inspect(bind).get_columns(table)}


def upgrade() -> None:
    existing = _existing_columns('content')

    if 'cover_image' not in existing:
        op.add_column(
            'content',
            sa.Column('cover_image', sa.Text(), nullable=True)
        )

    if 'publish_date' not in existing:
        op.add_column(
            'content',
            sa.Column('publish_date', sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    existing = _existing_columns('content')

    if 'publish_date' in existing:
        op.drop_column('content', 'publish_date')

    if 'cover_image' in existing:
        op.drop_column('content', 'cover_image')
