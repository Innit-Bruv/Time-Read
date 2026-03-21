"""Content segmenter — splits articles into timed reading segments.

Constraint: Never split mid-sentence. Always break on paragraph boundaries.
"""

DEFAULT_READING_SPEED = 200  # wpm, overridden by user_stats
SEGMENT_MINUTES = 6  # target segment length in minutes


def segment_content(text: str, reading_speed: int = DEFAULT_READING_SPEED) -> list[dict]:
    """Split text into segments of roughly `reading_speed * SEGMENT_MINUTES` words.
    
    Always breaks on paragraph boundaries (double newline).
    
    Args:
        text: Clean text to segment.
        reading_speed: Words per minute (from user_stats).
    
    Returns:
        List of dicts with keys: text, word_count, estimated_time, segment_index
    """
    words_per_segment = reading_speed * SEGMENT_MINUTES
    paragraphs = text.split("\n\n")
    segments = []
    current_chunk: list[str] = []
    current_words = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        para_words = len(para.split())

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


def _build_segment(paragraphs: list[str], reading_speed: int, index: int) -> dict:
    """Build a segment dict from a list of paragraphs."""
    text = "\n\n".join(paragraphs)
    word_count = len(text.split())
    estimated_time = round(word_count / reading_speed, 2)

    return {
        "text": text,
        "word_count": word_count,
        "estimated_time": estimated_time,
        "segment_index": index,
    }
