"""Add is_deleted to content for soft-delete support

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-03-27

Adds is_deleted (boolean, default False) to the content table.
Soft-deleted articles are excluded from archive listing and recommendations.
Migration is idempotent — safe to re-run.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'a1b2c3d4e5f6'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def _existing_columns(table: str) -> set:
    bind = op.get_bind()
    return {col["name"] for col in inspect(bind).get_columns(table)}


def upgrade() -> None:
    existing = _existing_columns('content')

    if 'is_deleted' not in existing:
        op.add_column(
            'content',
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false'))
        )
        op.create_index('ix_content_is_deleted', 'content', ['is_deleted'])


def downgrade() -> None:
    existing = _existing_columns('content')

    if 'is_deleted' in existing:
        op.drop_index('ix_content_is_deleted', table_name='content')
        op.drop_column('content', 'is_deleted')
