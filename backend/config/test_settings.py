"""Settings for pytest and mypy: enables test mode before the base settings load."""

import os

os.environ.setdefault("MINDNEST_TESTING", "true")
os.environ.setdefault("LLM_PROVIDER", "none")

from config.settings import *  # noqa: F403
