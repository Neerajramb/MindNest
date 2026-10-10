"""Local text embeddings (fastembed, all-MiniLM-L6-v2, Apache-2.0).

Memories are embedded and searched on the server, so only the few retrieved excerpts ever reach the LLM.
"""

import threading
from pathlib import Path
from typing import Protocol

import numpy as np
from django.conf import settings

DIMENSION = 384


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> np.ndarray: ...


class FastEmbedder:
    def __init__(self) -> None:
        from fastembed import TextEmbedding

        self._model = TextEmbedding(settings.EMBEDDING_MODEL, cache_dir=str(Path(settings.AI_MODELS_DIR) / "fastembed"))
        self._lock = threading.Lock()

    def embed(self, texts: list[str]) -> np.ndarray:
        with self._lock:
            vectors = np.array(list(self._model.embed(texts)), dtype=np.float32)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        return vectors / np.where(norms == 0, 1, norms)


_embedder: Embedder | None = None
_lock = threading.Lock()


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _lock:
            if _embedder is None:
                _embedder = FastEmbedder()
    return _embedder
