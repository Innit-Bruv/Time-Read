"""LLM query parser — converts natural language to structured params.

Uses gemini-2.0-flash-lite with regex fallback per PRD Section 12.
"""
import os
import re
import json
import logging
from typing import Optional
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

SYSTEM_PROMPT = """You are a query parser for a reading app.
Extract time_budget (minutes), topic, and content_type from the user's message.
content_type must be one of: twitter_thread, substack, article, pdf_report, or null.
Return ONLY valid JSON. No explanation.

Example:
Input: "20 minutes of AI Substack"
Output: {"time_budget": 20, "topic": "AI", "content_type": "substack"}"""


def parse_query(query: str) -> dict:
    """Parse a natural language query into structured parameters.

    Tries LLM first, falls back to regex on failure.

    Returns:
        dict with keys: time_budget, topic, content_type (any can be None)
    """
    # Try LLM first
    if GEMINI_API_KEY:
        try:
            result = _llm_parse(query)
            if result:
                return result
        except Exception as e:
            logger.warning(f"LLM parse failed, falling back to regex: {e}")

    # Regex fallback
    return regex_parse(query)


def _llm_parse(query: str) -> Optional[dict]:
    """Parse using Gemini."""
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")

    prompt = f"{SYSTEM_PROMPT}\n\nUser: {query}"
    response = model.generate_content(prompt)
    raw = response.text.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    # Try to parse JSON
    try:
        parsed = json.loads(raw)
        return {
            "time_budget": parsed.get("time_budget"),
            "topic": parsed.get("topic"),
            "content_type": parsed.get("content_type"),
        }
    except json.JSONDecodeError:
        logger.warning(f"LLM returned invalid JSON: {raw}")
        return None


def regex_parse(query: str) -> dict:
    """Regex-based fallback parser per PRD Section 12."""
    # Extract time
    time_match = re.search(r'(\d+)\s*(min|minute|minutes|m\b)', query, re.IGNORECASE)
    time_budget = int(time_match.group(1)) if time_match else None

    # Extract content type
    content_type = None
    if re.search(r'thread|twitter|tweet', query, re.IGNORECASE):
        content_type = 'twitter_thread'
    elif re.search(r'substack', query, re.IGNORECASE):
        content_type = 'substack'
    elif re.search(r'pdf|paper|report', query, re.IGNORECASE):
        content_type = 'pdf_report'

    return {
        "time_budget": time_budget,
        "topic": None,
        "content_type": content_type,
    }
