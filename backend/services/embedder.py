"""Gemini embeddings service — generates 768-dim vectors for content."""
import os
import logging
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

EMBEDDING_MODEL = "models/text-embedding-004"
EMBEDDING_DIMS = 768


def generate_embedding(text: str, model: str = EMBEDDING_MODEL) -> list[float]:
    """Generate a 768-dimensional embedding from text.

    Args:
        text: Input text (title + first 1500 words typically).
        model: Gemini embedding model.

    Returns:
        List of 768 floats.

    Raises:
        Exception on API failure.
    """
    genai.configure(api_key=GEMINI_API_KEY)

    # Truncate to ~6000 words to stay within model limits
    words = text.split()
    if len(words) > 6000:
        text = " ".join(words[:6000])

    result = genai.embed_content(model=model, content=text)
    embedding = result["embedding"]
    logger.info(f"Generated embedding: {len(embedding)} dimensions")
    return embedding
