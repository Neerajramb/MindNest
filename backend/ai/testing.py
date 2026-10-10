"""Deterministic stand-ins for AI providers, used by tests (no network, no model downloads)."""

import re

import numpy as np

from ai.embeddings import DIMENSION


class WordOverlapEmbedder:
    """Bag-of-words with a collision-free word index: texts sharing words get similar vectors.

    Enough to test retrieval logic deterministically; real semantic matching is MiniLM's job.
    """

    STOP = {"the", "a", "an", "i", "my", "me", "you", "your", "to", "of", "and", "is", "was", "did", "what", "about"}

    def __init__(self) -> None:
        self._index: dict[str, int] = {}

    def embed(self, texts: list[str]) -> np.ndarray:
        vectors = np.zeros((len(texts), DIMENSION), dtype=np.float32)
        for row, text in enumerate(texts):
            for word in re.findall(r"[a-z]+", text.lower()):
                if word in self.STOP:
                    continue
                slot = self._index.setdefault(word.rstrip("s"), len(self._index) % DIMENSION)
                vectors[row, slot] += 1.0
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        return vectors / np.where(norms == 0, 1, norms)
