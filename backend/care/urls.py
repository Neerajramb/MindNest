from django.urls import path

from care import views

urlpatterns = [
    path("patients", views.PatientListCreateView.as_view(), name="patients"),
    path("patients/me", views.PatientMeView.as_view(), name="patient-me"),
    path("patients/me/settings", views.PatientMeSettingsView.as_view(), name="patient-me-settings"),
    path("patients/<uuid:patient_id>", views.PatientDetailView.as_view(), name="patient-detail"),
    path("patients/<uuid:patient_id>/link-codes", views.LinkCodeCreateView.as_view(), name="patient-link-codes"),
    path("patients/<uuid:patient_id>/caregivers", views.PatientCaregiversView.as_view(), name="patient-caregivers"),
    path(
        "patients/<uuid:patient_id>/caregivers/<uuid:caregiver_id>",
        views.PatientCaregiverRevokeView.as_view(),
        name="patient-caregiver-revoke",
    ),
    path(
        "patients/<uuid:patient_id>/emergency-contacts",
        views.EmergencyContactListView.as_view(),
        name="emergency-contacts",
    ),
    path("emergency-contacts/<uuid:contact_id>", views.EmergencyContactDetailView.as_view(), name="emergency-contact"),
    path("caregivers/me", views.CaregiverMeView.as_view(), name="caregiver-me"),
]
