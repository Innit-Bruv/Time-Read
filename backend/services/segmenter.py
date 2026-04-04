"""Content segmenter — splits articles into timed reading segments.

Constraint: Never split mid-sentence. Always break on paragraph boundaries.
"""
import re

DISPLAY_WPM = 200  # fixed — all time calculations use this, never user_stats
SEGMENT_MINUTES = 6  # target segment length in minutes


def _strip_markdown(text: str) -> int:
    """Strip Markdown syntax characters before counting words.

    Prevents bold/italic markers, headers, image syntax, etc. from inflating
    word counts when segments contain Markdown-formatted text.
    """
    clean = re.sub(r'[#*_!>`\[\]()\-]', '', text)
    return len(clean.split())


def segment_content(text: str, reading_speed: int = DISPLAY_WPM) -> list[dict]:
    """Split text into segments of roughly DISPLAY_WPM * SEGMENT_MINUTES words.

    Always breaks on paragraph boundaries (double newline).
    reading_speed parameter is kept for API compat but ignored — we always
    use DISPLAY_WPM (200) so stored estimated_time matches display time.

    Args:
        text: Clean text to segment.
        reading_speed: Ignored. Always uses DISPLAY_WPM (200).

    Returns:
        List of dicts with keys: text, word_count, estimated_time, segment_index
    """
    words_per_segment = DISPLAY_WPM * SEGMENT_MINUTES
    paragraphs = text.split("\n\n")
    segments = []
    current_chunk: list[str] = []
    current_words = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        para_words = _strip_markdown(para)

        if current_words + para_words > words_per_segment and current_chunk:
            # Close current segment
            segments.append(_build_segment(current_chunk, reading_speed, len(segments)))
            current_chunk = [para]
            current_words = para_words
        else:
            current_chunk.append(para)
            current_words += para_words

    # Don't forget the last chunk
    if current_chunk:
        segments.append(_build_segment(current_chunk, reading_speed, len(segments)))

    return segments


def _build_segment(paragraphs: list[str], _reading_speed: int, index: int) -> dict:
    """Build a segment dict from a list of paragraphs."""
    text = "\n\n".join(paragraphs)
    word_count = _strip_markdown(text)
    estimated_time = round(word_count / DISPLAY_WPM, 2)

    return {
        "text": text,
        "word_count": word_count,
        "estimated_time": estimated_time,
        "segment_index": index,
    }
