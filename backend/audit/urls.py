from django.urls import path

from audit import views

urlpatterns = [
    path("patients/<uuid:patient_id>/activity", views.PatientActivityView.as_view(), name="patient-activity"),
    path("patients/<uuid:patient_id>/audit", views.PatientAuditView.as_view(), name="patient-audit"),
]
