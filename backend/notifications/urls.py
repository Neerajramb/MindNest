from django.urls import path

from notifications import views

urlpatterns = [
    path("alerts", views.MyAlertsView.as_view(), name="my-alerts"),
    path("patients/<uuid:patient_id>/alerts", views.PatientAlertsView.as_view(), name="patient-alerts"),
    path("alerts/<uuid:alert_id>/acknowledge", views.AlertAcknowledgeView.as_view(), name="alert-ack"),
    path("devices", views.DeviceRegisterView.as_view(), name="devices"),
]
