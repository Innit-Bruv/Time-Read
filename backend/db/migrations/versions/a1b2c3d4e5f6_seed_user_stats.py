"""seed_user_stats

Revision ID: a1b2c3d4e5f6
Revises: 27fb5d66d95d
Create Date: 2026-03-22

Inserts the default user_stats row (id=1, reading_speed=200) if it does not
already exist. Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "27fb5d66d95d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO user_stats (id, reading_speed) "
            "VALUES (1, 200) "
            "ON CONFLICT (id) DO NOTHING"
        )
    )


def downgrade() -> None:
    # Leave the row — removing default data is rarely the right rollback.
    pass
