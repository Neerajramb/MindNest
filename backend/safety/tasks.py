from huey import crontab
from huey.contrib.djhuey import db_periodic_task

from safety.service import check_stale_locations, purge_old_locations


@db_periodic_task(crontab(minute="*/10"))
def stale_location_task() -> int:
    return check_stale_locations()


@db_periodic_task(crontab(minute="15", hour="3"))
def purge_locations_task() -> int:
    return purge_old_locations()
