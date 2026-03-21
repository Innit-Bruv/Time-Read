"""Unit tests for services/extractor.py.

Tests cover:
- fetch_and_extract routing (article vs pdf)
- ExtractionError raised correctly on failures
- HTTP failures propagated as ExtractionError
- PDF tempfile cleanup (no leak even on exception)
"""
import sys
import os
from unittest.mock import patch, MagicMock, call

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.extractor import ExtractionError


class TestFetchAndExtract:
    def _mock_trafilatura(self, text="Sample article text. " * 50, title="Test Title", author="John Doe"):
        """Return patch targets for a successful trafilatura extraction."""
        import json
        meta = json.dumps({"title": title, "author": author})
        return {
            'trafilatura.extract': MagicMock(side_effect=[text, meta]),
        }

    def test_raises_extraction_error_on_http_failure(self):
        import httpx
        from services.extractor import fetch_and_extract
        with patch('httpx.get') as mock_get:
            mock_get.side_effect = httpx.HTTPError("connection refused")
            try:
                fetch_and_extract("https://example.com/article", "article")
                assert False, "Should have raised ExtractionError"
            except ExtractionError as e:
                assert "fetch_failed" in str(e)

    def test_raises_extraction_error_on_http_status_error(self):
        import httpx
        from services.extractor import fetch_and_extract
        with patch('httpx.get') as mock_get:
            mock_response = MagicMock()
            mock_response.raise_for_status.side_effect = httpx.HTTPError("404 Not Found")
            mock_get.return_value = mock_response
            try:
                fetch_and_extract("https://example.com/article", "article")
                assert False, "Should have raised ExtractionError"
            except ExtractionError:
                pass

    def test_routes_pdf_to_pdf_extractor(self):
        from services.extractor import fetch_and_extract
        with patch('services.extractor._extract_pdf') as mock_pdf:
            mock_pdf.return_value = {
                "clean_text": "word " * 200,
                "title": "",
                "author": "",
                "source": "example.com",
                "word_count": 200,
            }
            result = fetch_and_extract("https://example.com/doc.pdf", "pdf_report")
        mock_pdf.assert_called_once_with("https://example.com/doc.pdf")
        assert result["word_count"] == 200

    def test_trafilatura_success_returns_clean_text(self):
        import httpx
        from services.extractor import fetch_and_extract

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = "<html><body>content</body></html>"

        long_text = "This is meaningful text content for a test. " * 10  # >100 words

        with patch('httpx.get', return_value=mock_response), \
             patch('trafilatura.extract', return_value=long_text):
            result = fetch_and_extract("https://example.com/article", "article")

        assert result["clean_text"] == long_text
        assert result["word_count"] > 0
        assert "source" in result

    def test_falls_back_to_newspaper_when_trafilatura_returns_none(self):
        import httpx
        from services.extractor import fetch_and_extract

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = "<html>content</html>"

        long_text = "word " * 150

        mock_article = MagicMock()
        mock_article.text = long_text
        mock_article.title = "Newspaper Title"
        mock_article.authors = ["Jane Doe"]

        with patch('httpx.get', return_value=mock_response), \
             patch('trafilatura.extract', return_value=None), \
             patch('newspaper.Article', return_value=mock_article):
            result = fetch_and_extract("https://example.com/article", "article")

        assert result["clean_text"] == long_text
        assert result["title"] == "Newspaper Title"

    def test_raises_when_both_extractors_fail(self):
        import httpx
        from services.extractor import fetch_and_extract

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = "<html></html>"

        with patch('httpx.get', return_value=mock_response), \
             patch('trafilatura.extract', return_value=None), \
             patch('services.extractor._extract_newspaper', return_value=None):
            try:
                fetch_and_extract("https://example.com/article", "article")
                assert False, "Should have raised ExtractionError"
            except ExtractionError as e:
                assert "extraction_failed" in str(e)


class TestExtractPdfTempfileCleanup:
    def test_tempfile_deleted_on_success(self):
        """Temporary PDF file must be deleted even after successful extraction."""
        import httpx
        from services.extractor import _extract_pdf

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b"%PDF fake content"
        mock_response.__len__ = lambda self: len(self.content)

        deleted_paths = []

        mock_pdf = MagicMock()
        mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
        mock_pdf.__exit__ = MagicMock(return_value=False)
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "word " * 200
        mock_pdf.pages = [mock_page]

        with patch('httpx.get', return_value=mock_response), \
             patch('pdfplumber.open', return_value=mock_pdf), \
             patch('os.unlink', side_effect=lambda p: deleted_paths.append(p)):
            try:
                _extract_pdf("https://example.com/doc.pdf")
            except Exception:
                pass

        assert len(deleted_paths) == 1, "os.unlink should be called exactly once"

    def test_tempfile_deleted_on_exception(self):
        """Temporary PDF file must be deleted even when pdfplumber raises."""
        import httpx
        from services.extractor import _extract_pdf

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b"%PDF fake content"

        deleted_paths = []

        with patch('httpx.get', return_value=mock_response), \
             patch('pdfplumber.open', side_effect=RuntimeError("corrupt PDF")), \
             patch('os.unlink', side_effect=lambda p: deleted_paths.append(p)):
            try:
                _extract_pdf("https://example.com/doc.pdf")
            except Exception:
                pass

        assert len(deleted_paths) == 1, "os.unlink should be called even after exception"

    def test_raises_extraction_error_on_pdf_too_large(self):
        import httpx
        from services.extractor import _extract_pdf, ExtractionError

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        # 21MB — exceeds 20MB limit
        mock_response.content = b"x" * (21 * 1024 * 1024)

        with patch('httpx.get', return_value=mock_response):
            try:
                _extract_pdf("https://example.com/huge.pdf")
                assert False, "Should have raised ExtractionError"
            except ExtractionError as e:
                assert "pdf_too_large" in str(e)

    def test_raises_extraction_error_on_too_little_text(self):
        import httpx
        from services.extractor import _extract_pdf, ExtractionError

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b"%PDF tiny"

        mock_pdf = MagicMock()
        mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
        mock_pdf.__exit__ = MagicMock(return_value=False)
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "just a few words"  # < 100 words
        mock_pdf.pages = [mock_page]

        with patch('httpx.get', return_value=mock_response), \
             patch('pdfplumber.open', return_value=mock_pdf), \
             patch('os.unlink'):
            try:
                _extract_pdf("https://example.com/tiny.pdf")
                assert False, "Should have raised ExtractionError"
            except ExtractionError as e:
                assert "extraction_failed" in str(e)
