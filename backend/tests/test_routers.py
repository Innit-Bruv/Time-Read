"""Integration tests for all four FastAPI routers.

Uses TestClient with mock DB — no PostgreSQL required.
The auth dependency is overridden so all requests pass authentication.

Routers under test:
- POST /ingest, GET /content/{id}/status
- POST /recommend
- GET /archive
- POST /session/track, GET /content/{id}/segment/{segment_id}
"""
import sys
import os
import uuid
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# --- Helpers ---

def _content(status="ready", **kwargs):
    """Create a mock Content object with sensible defaults."""
    obj = MagicMock()
    obj.id = kwargs.get('id', uuid.uuid4())
    obj.title = kwargs.get('title', 'Test Article')
    obj.url = kwargs.get('url', 'https://example.com/test')
    obj.source = kwargs.get('source', 'example.com')
    obj.author = kwargs.get('author', 'Test Author')
    obj.content_type = kwargs.get('content_type', 'article')
    obj.status = status
    obj.estimated_time = kwargs.get('estimated_time', 5.0)
    obj.word_count = kwargs.get('word_count', 1000)
    obj.clean_text = kwargs.get('clean_text', 'Content text here.')
    obj.error_message = None
    obj.created_at = datetime.now(timezone.utc)
    obj.embedding = None
    return obj


def _segment(content_id=None, **kwargs):
    """Create a mock Segment object with sensible defaults."""
    obj = MagicMock()
    obj.id = kwargs.get('id', uuid.uuid4())
    obj.content_id = content_id or uuid.uuid4()
    obj.segment_index = kwargs.get('segment_index', 0)
    obj.text = kwargs.get('text', 'Segment text here. More words to fill out the content.')
    obj.word_count = kwargs.get('word_count', 200)
    obj.estimated_time = kwargs.get('estimated_time', 1.0)
    return obj


# ==================== INGEST ROUTER ====================

class TestIngestRouter:
    def test_ingest_new_url_returns_202(self, client, mock_db):
        """POST /ingest with a new URL creates content and returns 202."""
        # No existing content
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with patch('tasks.process_content.process_content_task') as mock_task:
            mock_task.delay = MagicMock()
            response = client.post("/ingest", json={"url": "https://example.com/brand-new"})

        assert response.status_code == 202
        data = response.json()
        assert "content_id" in data
        assert "status" in data

    def test_ingest_duplicate_url_returns_existing(self, client, mock_db):
        """POST /ingest with a URL that already exists returns the existing record."""
        existing = _content(status="ready")
        mock_db.query.return_value.filter.return_value.first.return_value = existing

        response = client.post("/ingest", json={"url": "https://example.com/existing"})

        assert response.status_code == 202
        data = response.json()
        assert str(data["content_id"]) == str(existing.id)
        assert data["message"] == "Already saved"

    def test_get_content_status_200_for_known_content(self, client, mock_db):
        """GET /content/{id}/status returns 200 with status for known content."""
        content = _content(status="ready")
        mock_db.query.return_value.filter.return_value.first.return_value = content

        response = client.get(f"/content/{content.id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert str(data["content_id"]) == str(content.id)

    def test_get_content_status_404_for_unknown(self, client, mock_db):
        """GET /content/{id}/status returns 404 for unknown content ID."""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        response = client.get(f"/content/{uuid.uuid4()}/status")

        assert response.status_code == 404

    def test_get_content_status_422_for_invalid_uuid(self, client, mock_db):
        """GET /content/{id}/status returns 422 for a non-UUID path param."""
        response = client.get("/content/not-a-uuid/status")
        assert response.status_code == 422

    def test_ingest_celery_unavailable_calls_sync_pipeline(self, client, mock_db):
        """When Celery raises, run_pipeline is called synchronously as fallback."""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with patch('routers.ingest.process_content_task') as mock_celery, \
             patch('routers.ingest.run_pipeline') as mock_pipeline:
            mock_celery.delay.side_effect = Exception("Redis down")
            response = client.post("/ingest", json={"url": "https://example.com/fallback"})

        assert response.status_code == 202
        mock_pipeline.assert_called_once()


# ==================== RECOMMEND ROUTER ====================

class TestRecommendRouter:
    def test_recommend_empty_library_returns_404(self, client, mock_db):
        """POST /recommend with no content returns 404 (no items to recommend)."""
        with patch('routers.recommend.generate_pack') as mock_pack:
            mock_pack.return_value = {
                "session_id": str(uuid.uuid4()),
                "total_estimated_time": 0.0,
                "items": [],
            }
            response = client.post("/recommend", json={"query": "15 minutes"})

        # Router raises 404 when pack has no items
        assert response.status_code == 404

    def test_recommend_with_items_returns_200(self, client, mock_db):
        """POST /recommend with available content returns pack with items."""
        seg_id = uuid.uuid4()
        content_id = uuid.uuid4()
        with patch('routers.recommend.generate_pack') as mock_pack:
            mock_pack.return_value = {
                "session_id": str(uuid.uuid4()),
                "total_estimated_time": 5.0,
                "items": [{
                    "content_id": str(content_id),
                    "segment_id": str(seg_id),
                    "title": "Test Article",
                    "source": "example.com",
                    "author": "Author",
                    "content_type": "article",
                    "estimated_time": 5.0,
                    "segment_index": 0,
                    "total_segments": 1,
                    "is_continuation": False,
                }],
            }
            response = client.post("/recommend", json={"time_budget": 15.0})

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["total_estimated_time"] == 5.0

    def test_recommend_no_time_budget_no_query_returns_422(self, client, mock_db):
        """POST /recommend with neither query nor time_budget returns 422."""
        response = client.post("/recommend", json={})
        assert response.status_code == 422

    def test_recommend_invalid_time_budget_type_returns_422(self, client, mock_db):
        """POST /recommend with non-numeric time_budget returns 422."""
        response = client.post("/recommend", json={"time_budget": "fifteen"})
        assert response.status_code == 422

    def test_recommend_uses_llm_parser_for_query(self, client, mock_db):
        """POST /recommend with only a query string calls parse_query."""
        with patch('routers.recommend.parse_query') as mock_parse, \
             patch('routers.recommend.generate_pack') as mock_pack:
            mock_parse.return_value = {"time_budget": 10, "topic": None, "content_type": None}
            mock_pack.return_value = {
                "session_id": str(uuid.uuid4()),
                "total_estimated_time": 0.0,
                "items": [],
            }
            client.post("/recommend", json={"query": "10 minutes of reading"})

        mock_parse.assert_called_once_with("10 minutes of reading")


# ==================== ARCHIVE ROUTER ====================

class TestArchiveRouter:
    def _setup_empty_archive(self, mock_db):
        """Configure mock_db to return empty archive."""
        # The archive router calls query().count() for total, then
        # query()....all() for the paginated result.
        mock_db.query.return_value.count.return_value = 0
        mock_db.query.return_value.filter.return_value.count.return_value = 0
        (mock_db.query.return_value
            .filter.return_value
            .order_by.return_value
            .offset.return_value
            .limit.return_value
            .all.return_value) = []
        (mock_db.query.return_value
            .order_by.return_value
            .offset.return_value
            .limit.return_value
            .all.return_value) = []

    def test_archive_empty_returns_empty_items(self, client, mock_db):
        """GET /archive with no content returns empty items list."""
        self._setup_empty_archive(mock_db)
        response = client.get("/archive")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1

    def test_archive_default_pagination(self, client, mock_db):
        """GET /archive uses default page=1, limit=20."""
        self._setup_empty_archive(mock_db)
        response = client.get("/archive")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["limit"] == 20

    def test_archive_custom_pagination(self, client, mock_db):
        """GET /archive respects page and limit query params."""
        self._setup_empty_archive(mock_db)
        response = client.get("/archive?page=3&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 3
        assert data["limit"] == 10

    def test_archive_limit_over_50_rejected(self, client, mock_db):
        """GET /archive rejects limit > 50 with 422."""
        response = client.get("/archive?limit=100")
        assert response.status_code == 422

    def test_archive_page_zero_rejected(self, client, mock_db):
        """GET /archive rejects page < 1 with 422."""
        response = client.get("/archive?page=0")
        assert response.status_code == 422


# ==================== SESSION ROUTER ====================

class TestSessionRouter:
    def test_track_reading_happy_path_returns_ok(self, client, mock_db):
        """POST /session/track records reading progress and returns ok=true."""
        seg = _segment()
        # First query: segment lookup; second: user_stats
        mock_db.query.return_value.filter.return_value.first.side_effect = [seg, None]

        payload = {
            "segment_id": str(seg.id),
            "time_spent": 120.0,
            "words_read": 400,
            "completed": True,
        }
        response = client.post("/session/track", json=payload)

        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_track_reading_404_for_unknown_segment(self, client, mock_db):
        """POST /session/track returns 404 when segment doesn't exist."""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        payload = {
            "segment_id": str(uuid.uuid4()),
            "time_spent": 60.0,
            "words_read": 200,
            "completed": False,
        }
        response = client.post("/session/track", json=payload)

        assert response.status_code == 404

    def test_track_reading_422_for_invalid_segment_id(self, client, mock_db):
        """POST /session/track returns 422 for a non-UUID segment_id."""
        response = client.post("/session/track", json={
            "segment_id": "not-a-uuid",
            "time_spent": 60.0,
            "words_read": 200,
        })
        assert response.status_code == 422

    def test_track_reading_updates_user_stats(self, client, mock_db):
        """POST /session/track with user_stats present updates reading speed."""
        seg = _segment()
        user_stats = MagicMock()
        user_stats.total_time = 400.0  # > 300 sec threshold
        user_stats.total_words = 1200
        user_stats.reading_speed = 200.0
        mock_db.query.return_value.filter.return_value.first.side_effect = [seg, user_stats]

        payload = {
            "segment_id": str(seg.id),
            "time_spent": 60.0,
            "words_read": 200,
            "completed": True,
        }
        response = client.post("/session/track", json=payload)

        assert response.status_code == 200
        # user_stats should have been mutated
        assert user_stats.total_words == 1400  # 1200 + 200

    def test_get_segment_returns_text_and_metadata(self, client, mock_db):
        """GET /content/{id}/segment/{id} returns segment text and metadata."""
        content = _content(status="ready")
        seg = _segment(content_id=content.id)

        # Router queries: Segment first, then Content, then count
        mock_db.query.return_value.filter.return_value.first.side_effect = [seg, content]
        mock_db.query.return_value.filter.return_value.scalar.return_value = 1

        response = client.get(f"/content/{content.id}/segment/{seg.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["text"] == seg.text
        assert data["segment_index"] == seg.segment_index
        assert data["word_count"] == seg.word_count

    def test_get_segment_404_for_unknown_segment(self, client, mock_db):
        """GET /content/{id}/segment/{id} returns 404 if segment not found."""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        response = client.get(f"/content/{uuid.uuid4()}/segment/{uuid.uuid4()}")

        assert response.status_code == 404

    def test_get_segment_422_for_non_uuid_params(self, client, mock_db):
        """GET /content/{id}/segment/{id} returns 422 for non-UUID path params."""
        response = client.get("/content/not-uuid/segment/also-not-uuid")
        assert response.status_code == 422
