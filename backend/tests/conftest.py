"""Shared test fixtures for TimeRead backend tests.

Router integration tests use a mock DB session to avoid the pgvector/PostgreSQL
dependency. Service unit tests (segmenter, llm_parser, extractor) are pure Python
and need no fixtures.
"""
import sys
import os
import uuid
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

# Patch pgvector before any model imports so Vector(1536) resolves to Text.
# This lets us import the models module without a live PostgreSQL connection.
_mock_pgvector = MagicMock()
_mock_pgvector.Vector = lambda dim: __import__('sqlalchemy').Text()
sys.modules.setdefault('pgvector', MagicMock())
sys.modules.setdefault('pgvector.sqlalchemy', _mock_pgvector)

# Add backend/ to sys.path so imports work the same way as the app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set env vars before app import so auth/config modules pick them up
os.environ.setdefault('INTERNAL_API_SECRET', 'test-secret')
os.environ.setdefault('ENV', 'development')
os.environ.setdefault('DATABASE_URL', 'sqlite://')  # not used by mock, but prevents crash


def _make_content(**kwargs):
    """Build a minimal mock Content object."""
    defaults = dict(
        id=uuid.uuid4(),
        title="Test Article",
        url="https://example.com/test",
        source="example.com",
        author="Test Author",
        content_type="article",
        status="ready",
        estimated_time=5.0,
        word_count=1000,
        clean_text="This is test content.",
        error_message=None,
        created_at=datetime.now(timezone.utc),
        embedding=None,
    )
    defaults.update(kwargs)
    obj = MagicMock(**defaults)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_segment(content_id=None, **kwargs):
    """Build a minimal mock Segment object."""
    defaults = dict(
        id=uuid.uuid4(),
        content_id=content_id or uuid.uuid4(),
        segment_index=0,
        text="Segment text here.",
        word_count=200,
        estimated_time=1.0,
    )
    defaults.update(kwargs)
    obj = MagicMock(**defaults)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


def _make_reading_session(segment_id=None, completed=True, **kwargs):
    """Build a minimal mock ReadingSession object."""
    defaults = dict(
        id=uuid.uuid4(),
        segment_id=segment_id or uuid.uuid4(),
        completed=completed,
        time_spent=60.0,
        words_read=200,
    )
    defaults.update(kwargs)
    obj = MagicMock(**defaults)
    for k, v in defaults.items():
        setattr(obj, k, v)
    return obj


@pytest.fixture
def mock_db():
    """A MagicMock SQLAlchemy session. Configure per-test via return_value chains."""
    db = MagicMock()
    # Default: query().filter().first() → None (no rows found)
    db.query.return_value.filter.return_value.first.return_value = None
    db.query.return_value.filter.return_value.count.return_value = 0
    db.query.return_value.filter.return_value.all.return_value = []
    db.query.return_value.count.return_value = 0
    db.query.return_value.all.return_value = []
    return db


@pytest.fixture
def client(mock_db):
    """FastAPI TestClient with auth and DB dependencies overridden."""
    from main import app
    from auth import verify_api_key
    from db.database import get_db

    app.dependency_overrides[verify_api_key] = lambda: None
    app.dependency_overrides[get_db] = lambda: mock_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-secret"}


# Export helpers for use in test modules
__all__ = ['mock_db', 'client', 'auth_headers', '_make_content', '_make_segment', '_make_reading_session']
