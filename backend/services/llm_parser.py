"""LLM query parser — converts natural language to structured params.

Uses gpt-4o-mini with regex fallback per PRD Section 12.
"""
import os
import re
import json
import logging
from typing import Optional
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

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
    if OPENAI_API_KEY:
        try:
            result = _llm_parse(query)
            if result:
                return result
        except Exception as e:
            logger.warning(f"LLM parse failed, falling back to regex: {e}")

    # Regex fallback
    return regex_parse(query)


def _llm_parse(query: str) -> Optional[dict]:
    """Parse using GPT-4o-mini."""
    client = OpenAI(api_key=OPENAI_API_KEY)

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        temperature=0,
        max_tokens=100,
    )

    raw = response.choices[0].message.content.strip()

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
