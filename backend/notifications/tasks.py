from huey import crontab
from huey.contrib.djhuey import db_periodic_task, db_task

from notifications.service import deliver_pending


@db_task()
def deliver_notifications_task() -> int:
    return deliver_pending()


@db_periodic_task(crontab(minute="*"))
def retry_notifications_task() -> int:
    return deliver_pending()
