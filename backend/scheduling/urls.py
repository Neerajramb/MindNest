from django.urls import path

from scheduling import views

urlpatterns = [
    path("patients/<uuid:patient_id>/schedule", views.RoutineListView.as_view(), name="routines"),
    path("schedule/<uuid:routine_id>", views.RoutineDetailView.as_view(), name="routine-detail"),
    path("patients/<uuid:patient_id>/agenda", views.AgendaView.as_view(), name="agenda"),
    path("patients/<uuid:patient_id>/appointments", views.AppointmentListView.as_view(), name="appointments"),
    path("appointments/<uuid:appointment_id>", views.AppointmentDetailView.as_view(), name="appointment-detail"),
    path("patients/<uuid:patient_id>/medications", views.MedicationListView.as_view(), name="medications"),
    path("medications/<uuid:medication_id>", views.MedicationDetailView.as_view(), name="medication-detail"),
    path(
        "medications/<uuid:medication_id>/schedules",
        views.MedicationScheduleCreateView.as_view(),
        name="medication-schedules",
    ),
    path(
        "medication-schedules/<uuid:schedule_id>",
        views.MedicationScheduleDetailView.as_view(),
        name="medication-schedule-detail",
    ),
]
