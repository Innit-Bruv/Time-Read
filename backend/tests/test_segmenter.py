"""Unit tests for services/segmenter.py.

Key invariants under test:
- Never splits mid-sentence (always on paragraph boundary)
- Produces at least one segment for non-empty text
- Segment indices are 0-based and contiguous
- Estimated time = word_count / 200 (fixed DISPLAY_WPM)
- Oversized single paragraphs still produce one segment (not split further)
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.segmenter import segment_content, SEGMENT_MINUTES, DISPLAY_WPM


def _make_text(word_count: int, paragraphs: int = 1) -> str:
    """Build text with the given word count distributed across paragraphs."""
    words_per_para = max(1, word_count // paragraphs)
    paras = [" ".join(["word"] * words_per_para) for _ in range(paragraphs)]
    return "\n\n".join(paras)


class TestSegmentContent:
    def test_empty_text_returns_empty_list(self):
        assert segment_content("") == []

    def test_whitespace_only_returns_empty_list(self):
        assert segment_content("   \n\n   ") == []

    def test_single_short_paragraph_produces_one_segment(self):
        text = "This is a short paragraph with very few words."
        result = segment_content(text)
        assert len(result) == 1
        assert result[0]["segment_index"] == 0
        assert result[0]["text"] == text.strip()

    def test_segment_indices_are_contiguous(self):
        """Indices must be 0, 1, 2, ... regardless of how many segments are created."""
        text = _make_text(word_count=10_000, paragraphs=100)
        result = segment_content(text)
        assert len(result) > 1
        for i, seg in enumerate(result):
            assert seg["segment_index"] == i

    def test_does_not_split_within_paragraph(self):
        """A single paragraph that exceeds the segment size must not be split.
        The segmenter only breaks on double-newlines (paragraph boundaries).
        """
        words_per_segment = DISPLAY_WPM * SEGMENT_MINUTES
        huge_paragraph = " ".join(["word"] * (words_per_segment * 3))
        result = segment_content(huge_paragraph)
        # One giant paragraph → exactly one segment (no mid-paragraph break)
        assert len(result) == 1
        assert result[0]["segment_index"] == 0

    def test_paragraph_boundary_respected(self):
        """Text is split only at double newlines, never within a paragraph."""
        words_per_segment = DISPLAY_WPM * SEGMENT_MINUTES
        # Two paragraphs, each slightly under the limit — should produce 1 segment
        para = " ".join(["word"] * (words_per_segment // 3))
        text = f"{para}\n\n{para}\n\n{para}"
        result = segment_content(text)
        # Three small paragraphs (each 1/3 of limit) → should all fit in one segment
        assert len(result) == 1

    def test_estimated_time_calculation(self):
        """estimated_time = word_count / reading_speed, rounded to 2 decimal places."""
        text = " ".join(["word"] * 200)  # 200 words
        result = segment_content(text, reading_speed=200)
        assert result[0]["word_count"] == 200
        assert result[0]["estimated_time"] == round(200 / 200, 2)

    def test_reading_speed_param_is_ignored(self):
        """reading_speed parameter is kept for API compat but always uses DISPLAY_WPM."""
        text = _make_text(word_count=DISPLAY_WPM * SEGMENT_MINUTES * 3, paragraphs=60)

        result_400 = segment_content(text, reading_speed=400)
        result_100 = segment_content(text, reading_speed=100)

        # Both produce identical segments — reading_speed is ignored
        assert len(result_400) == len(result_100)
        for a, b in zip(result_400, result_100):
            assert a["estimated_time"] == b["estimated_time"]

    def test_all_text_is_preserved(self):
        """No words should be lost between paragraphs."""
        paras = ["word " * 100 for _ in range(10)]
        text = "\n\n".join(paras)
        result = segment_content(text)
        total_words = sum(seg["word_count"] for seg in result)
        # Allow for small variance due to join/split word counting
        original_words = len(text.split())
        assert abs(total_words - original_words) <= 10

    def test_returns_required_keys(self):
        """Each segment must have text, word_count, estimated_time, segment_index."""
        result = segment_content("Hello world this is a test paragraph.")
        assert len(result) > 0
        for seg in result:
            assert "text" in seg
            assert "word_count" in seg
            assert "estimated_time" in seg
            assert "segment_index" in seg

    def test_large_text_multiple_segments(self):
        """A long article produces multiple segments."""
        text = _make_text(word_count=DISPLAY_WPM * SEGMENT_MINUTES * 5, paragraphs=50)
        result = segment_content(text)
        assert len(result) >= 3

    def test_empty_paragraphs_skipped(self):
        """Double newlines with nothing between them should not create empty segments."""
        text = "First paragraph.\n\n\n\nSecond paragraph."
        result = segment_content(text)
        assert all(seg["word_count"] > 0 for seg in result)
