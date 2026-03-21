"""Unit tests for services/llm_parser.py.

Tests cover:
- regex_parse (no external dependencies — always runs)
- parse_query fallback behavior when OpenAI key is absent
- LLM path with mocked OpenAI response
"""
import sys
import os
import json
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestRegexParse:
    """Tests for the pure regex_parse fallback — no external dependencies."""

    def setup_method(self):
        from services.llm_parser import regex_parse
        self.regex_parse = regex_parse

    def test_extracts_integer_minutes(self):
        result = self.regex_parse("I have 15 minutes")
        assert result["time_budget"] == 15

    def test_extracts_minutes_abbreviation(self):
        result = self.regex_parse("Give me 20 min of reading")
        assert result["time_budget"] == 20

    def test_extracts_time_with_word_minutes(self):
        result = self.regex_parse("30 minutes of tech news")
        assert result["time_budget"] == 30

    def test_no_time_returns_none(self):
        result = self.regex_parse("some articles about AI")
        assert result["time_budget"] is None

    def test_detects_substack_content_type(self):
        result = self.regex_parse("substack newsletters please")
        assert result["content_type"] == "substack"

    def test_detects_twitter_thread(self):
        result = self.regex_parse("show me twitter threads")
        assert result["content_type"] == "twitter_thread"

    def test_detects_twitter_tweet_keyword(self):
        result = self.regex_parse("I want tweets about Python")
        assert result["content_type"] == "twitter_thread"

    def test_detects_pdf_report(self):
        result = self.regex_parse("some PDF reports please")
        assert result["content_type"] == "pdf_report"

    def test_detects_paper_as_pdf(self):
        result = self.regex_parse("machine learning paper")
        assert result["content_type"] == "pdf_report"

    def test_no_content_type_returns_none(self):
        result = self.regex_parse("15 minutes")
        assert result["content_type"] is None

    def test_topic_always_none_in_regex(self):
        """Regex parser cannot extract topic — only LLM can."""
        result = self.regex_parse("15 minutes of AI articles")
        assert result["topic"] is None

    def test_returns_all_three_keys(self):
        result = self.regex_parse("20 min substack")
        assert "time_budget" in result
        assert "topic" in result
        assert "content_type" in result

    def test_case_insensitive_matching(self):
        result = self.regex_parse("SUBSTACK newsletter")
        assert result["content_type"] == "substack"

    def test_time_and_content_type_together(self):
        result = self.regex_parse("10 minutes of substack")
        assert result["time_budget"] == 10
        assert result["content_type"] == "substack"


class TestParseQuery:
    """Tests for the full parse_query function."""

    def test_falls_back_to_regex_when_no_api_key(self):
        """With OPENAI_API_KEY unset, must use regex fallback."""
        with patch.dict('os.environ', {'OPENAI_API_KEY': ''}):
            # Re-import after env change so module-level constant is cleared
            import importlib
            import services.llm_parser as mod
            with patch.object(mod, 'OPENAI_API_KEY', ''):
                result = mod.parse_query("15 minutes of substack")
        assert result["time_budget"] == 15
        assert result["content_type"] == "substack"

    def test_uses_llm_when_api_key_present(self):
        """With an API key, parse_query should call _llm_parse."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = json.dumps({
            "time_budget": 20,
            "topic": "artificial intelligence",
            "content_type": "article",
        })

        import services.llm_parser as mod
        with patch.object(mod, 'OPENAI_API_KEY', 'sk-fake'), \
             patch('services.llm_parser.OpenAI') as mock_openai:
            mock_openai.return_value.chat.completions.create.return_value = mock_response
            result = mod.parse_query("20 minutes of AI articles")

        assert result["time_budget"] == 20
        assert result["topic"] == "artificial intelligence"
        assert result["content_type"] == "article"

    def test_llm_json_parse_failure_falls_back_to_regex(self):
        """If LLM returns non-JSON, regex fallback is used."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "not valid json at all"

        import services.llm_parser as mod
        with patch.object(mod, 'OPENAI_API_KEY', 'sk-fake'), \
             patch('services.llm_parser.OpenAI') as mock_openai:
            mock_openai.return_value.chat.completions.create.return_value = mock_response
            result = mod.parse_query("30 minutes of substack")

        # Should fall back to regex
        assert result["time_budget"] == 30
        assert result["content_type"] == "substack"

    def test_llm_exception_falls_back_to_regex(self):
        """If LLM call raises, regex fallback is used."""
        import services.llm_parser as mod
        with patch.object(mod, 'OPENAI_API_KEY', 'sk-fake'), \
             patch('services.llm_parser.OpenAI') as mock_openai:
            mock_openai.return_value.chat.completions.create.side_effect = Exception("timeout")
            result = mod.parse_query("10 min")

        assert result["time_budget"] == 10
