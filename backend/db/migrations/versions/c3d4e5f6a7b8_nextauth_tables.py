"""nextauth_tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-22

Creates tables required by NextAuth.js @auth/pg-adapter:
  users, accounts, sessions, verification_token
"""
from typing import Sequence, Union
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT,
            email TEXT UNIQUE,
            "emailVerified" TIMESTAMPTZ,
            image TEXT
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            provider TEXT NOT NULL,
            "providerAccountId" TEXT NOT NULL,
            refresh_token TEXT,
            access_token TEXT,
            expires_at BIGINT,
            id_token TEXT,
            scope TEXT,
            session_state TEXT,
            token_type TEXT
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires TIMESTAMPTZ NOT NULL,
            "sessionToken" TEXT UNIQUE NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS verification_token (
            identifier TEXT NOT NULL,
            token TEXT NOT NULL,
            expires TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (identifier, token)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS verification_token")
    op.execute("DROP TABLE IF EXISTS sessions")
    op.execute("DROP TABLE IF EXISTS accounts")
    op.execute("DROP TABLE IF EXISTS users")
