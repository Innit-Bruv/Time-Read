"""Add is_finished to content for user-driven article dismissal

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-25

Adds is_finished (boolean, default False) to the content table.
Articles marked finished are excluded from future recommendations.
Migration is idempotent — safe to re-run.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def _existing_columns(table: str) -> set:
    bind = op.get_bind()
    return {col["name"] for col in inspect(bind).get_columns(table)}


def upgrade() -> None:
    existing = _existing_columns('content')

    if 'is_finished' not in existing:
        op.add_column(
            'content',
            sa.Column('is_finished', sa.Boolean(), nullable=False, server_default=sa.text('false'))
        )
        op.create_index('ix_content_is_finished', 'content', ['is_finished'])


def downgrade() -> None:
    existing = _existing_columns('content')

    if 'is_finished' in existing:
        op.drop_index('ix_content_is_finished', table_name='content')
        op.drop_column('content', 'is_finished')
