"""OpenAI embeddings service — generates 1536-dim vectors for content."""
import os
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Lazy client init
_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def generate_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    """Generate a 1536-dimensional embedding from text.
    
    Args:
        text: Input text (title + first 1500 words typically).
        model: OpenAI embedding model.
    
    Returns:
        List of 1536 floats.
    
    Raises:
        Exception on API failure.
    """
    client = _get_client()
    
    # Truncate to ~8000 tokens (~6000 words) to stay within model limits
    words = text.split()
    if len(words) > 6000:
        text = " ".join(words[:6000])

    response = client.embeddings.create(
        input=text,
        model=model,
    )

    embedding = response.data[0].embedding
    logger.info(f"Generated embedding: {len(embedding)} dimensions")
    return embedding
