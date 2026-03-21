"""Content extractor — converts URLs to clean readable text.

Priority: trafilatura → newspaper3k → fallback
"""
import logging
from typing import Optional
import trafilatura
import httpx

logger = logging.getLogger(__name__)


def fetch_and_extract(url: str, content_type: str) -> dict:
    """Fetch URL and extract clean text, title, author.
    
    Returns:
        dict with keys: clean_text, title, author, source, word_count
    
    Raises:
        ExtractionError if extraction fails or yields < 100 words.
    """
    if content_type == "pdf_report":
        return _extract_pdf(url)

    if content_type == "twitter_thread":
        return _extract_twitter(url)

    # Fetch page
    try:
        response = httpx.get(url, timeout=30, follow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 (compatible; TimeRead/1.0)"})
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise ExtractionError(f"fetch_failed: {str(e)}")

    html = response.text

    # Try trafilatura first (best for most articles)
    result = _extract_trafilatura(html, url)
    if result and len(result.get("clean_text", "").split()) >= 100:
        return result

    # Fallback: newspaper3k
    result = _extract_newspaper(url)
    if result and len(result.get("clean_text", "").split()) >= 100:
        return result

    raise ExtractionError("extraction_failed: could not extract sufficient content")


def _extract_trafilatura(html: str, url: str) -> Optional[dict]:
    """Extract using trafilatura."""
    try:
        text = trafilatura.extract(
            html,
            url=url,
            include_comments=False,
            include_tables=True,
            favor_recall=True,
        )
        if not text:
            return None

        metadata = trafilatura.extract(
            html, url=url, output_format="json",
            include_comments=False,
        )
        # trafilatura metadata extraction 
        meta = {}
        if metadata:
            import json
            try:
                meta = json.loads(metadata) if isinstance(metadata, str) else {}
            except (json.JSONDecodeError, TypeError):
                meta = {}

        words = text.split()
        source = url.split("//")[-1].split("/")[0]  # extract domain

        return {
            "clean_text": text,
            "title": meta.get("title", ""),
            "author": meta.get("author", ""),
            "source": source,
            "word_count": len(words),
        }
    except Exception as e:
        logger.warning(f"trafilatura failed for {url}: {e}")
        return None


def _extract_newspaper(url: str) -> Optional[dict]:
    """Extract using newspaper3k as fallback."""
    try:
        from newspaper import Article
        article = Article(url)
        article.download()
        article.parse()

        if not article.text:
            return None

        words = article.text.split()
        source = url.split("//")[-1].split("/")[0]

        return {
            "clean_text": article.text,
            "title": article.title or "",
            "author": ", ".join(article.authors) if article.authors else "",
            "source": source,
            "word_count": len(words),
        }
    except Exception as e:
        logger.warning(f"newspaper3k failed for {url}: {e}")
        return None


def _extract_twitter(url: str) -> dict:
    """Extract Twitter/X thread content via fxtwitter.com mirror.

    fxtwitter.com renders the full thread as readable HTML, avoiding Twitter's
    JS-only SPA and bot-blocking. Rewrite x.com/twitter.com → fxtwitter.com,
    then run the standard trafilatura extraction path.

    Flow:
      x.com/user/status/123  →  fxtwitter.com/user/status/123
                              →  trafilatura extracts thread text
    """
    import re

    # Rewrite x.com or twitter.com → fxtwitter.com
    mirror_url = re.sub(r'https?://(www\.)?(twitter\.com|x\.com)/', 'https://fxtwitter.com/', url)

    try:
        response = httpx.get(mirror_url, timeout=30, follow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 (compatible; TimeRead/1.0)"})
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise ExtractionError(f"fetch_failed: {str(e)}")

    html = response.text
    result = _extract_trafilatura(html, mirror_url)
    if result and len(result.get("clean_text", "").split()) >= 30:
        # Twitter threads can be short — lower threshold to 30 words
        result["source"] = url.split("//")[-1].split("/")[0]  # keep original domain as source
        return result

    # Fallback: try newspaper3k on the mirror URL
    result = _extract_newspaper(mirror_url)
    if result and len(result.get("clean_text", "").split()) >= 30:
        result["source"] = url.split("//")[-1].split("/")[0]
        return result

    raise ExtractionError("extraction_failed: could not extract Twitter thread content")


def _extract_pdf(url: str) -> dict:
    """Extract text from PDF URL using pdfplumber."""
    import os
    import tempfile
    import pdfplumber

    try:
        response = httpx.get(url, timeout=60, follow_redirects=True)
        response.raise_for_status()

        # Check size (max 20MB)
        if len(response.content) > 20 * 1024 * 1024:
            raise ExtractionError("pdf_too_large: PDF exceeds 20MB limit")

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(response.content)
                f.flush()
                tmp_path = f.name

            with pdfplumber.open(tmp_path) as pdf:
                texts = []
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        texts.append(text)
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        full_text = "\n\n".join(texts)
        words = full_text.split()

        if len(words) < 100:
            raise ExtractionError("extraction_failed: PDF has too little text")

        source = url.split("//")[-1].split("/")[0]
        return {
            "clean_text": full_text,
            "title": "",
            "author": "",
            "source": source,
            "word_count": len(words),
        }
    except ExtractionError:
        raise
    except Exception as e:
        raise ExtractionError(f"fetch_failed: {str(e)}")


class ExtractionError(Exception):
    """Raised when content extraction fails."""
    pass
