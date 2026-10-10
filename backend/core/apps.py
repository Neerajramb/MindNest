from typing import Any

from django.apps import AppConfig
from django.db.backends.signals import connection_created


def _configure_sqlite(sender: Any, connection: Any, **kwargs: Any) -> None:
    # WAL lets the API and the Huey consumer read/write SQLite concurrently.
    if connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")


class CoreConfig(AppConfig):
    name = "core"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        connection_created.connect(_configure_sqlite, dispatch_uid="core.sqlite_config")
