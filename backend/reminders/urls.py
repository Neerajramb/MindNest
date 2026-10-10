from django.urls import path

from reminders import views

urlpatterns = [
    path("patients/<uuid:patient_id>/reminders", views.ReminderListView.as_view(), name="reminders"),
    path("reminders/<uuid:reminder_id>/acknowledge", views.ReminderAcknowledgeView.as_view(), name="reminder-ack"),
    path("reminders/<uuid:reminder_id>/snooze", views.ReminderSnoozeView.as_view(), name="reminder-snooze"),
]
