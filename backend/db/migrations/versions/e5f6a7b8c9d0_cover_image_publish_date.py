"""cover_image and publish_date on content

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-24

Adds cover_image (og:image URL) and publish_date to the content table.
Both columns are nullable — existing rows keep NULL until re-extracted.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'content',
        sa.Column('cover_image', sa.Text(), nullable=True)
    )
    op.add_column(
        'content',
        sa.Column('publish_date', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('content', 'publish_date')
    op.drop_column('content', 'cover_image')
