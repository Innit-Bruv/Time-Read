"""Shared text utilities for paragraph splitting.

All paragraph-aware code (recommender, session router, segmenter) should use
split_paragraphs() instead of raw text.split("\\n\\n") so that content stored
with single-newline separators is handled correctly.
"""


def split_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs, handling both \\n\\n and \\n separators.

    Strategy:
    1. Try splitting on double-newlines (standard Markdown paragraph boundary).
    2. If that yields only 1 chunk AND the text contains single newlines,
       fall back to splitting on single newlines.
    3. Filter out empty/whitespace-only entries.
    """
    parts = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(parts) > 1:
        return parts

    # Fallback: single-newline split
    parts = [p.strip() for p in text.split("\n") if p.strip()]
    if len(parts) > 1:
        return parts

    # No newlines at all — return as single paragraph
    stripped = text.strip()
    return [stripped] if stripped else []
