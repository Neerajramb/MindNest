from django.urls import path

from safety import views

urlpatterns = [
    path("patients/<uuid:patient_id>/geofences", views.GeofenceListView.as_view(), name="geofences"),
    path("geofences/<uuid:geofence_id>", views.GeofenceDetailView.as_view(), name="geofence-detail"),
    path("patients/<uuid:patient_id>/locations", views.LocationIngestView.as_view(), name="locations"),
    path("patients/<uuid:patient_id>/locations/latest", views.SafetyStatusView.as_view(), name="location-latest"),
    path("patients/<uuid:patient_id>/safety", views.SafetyStatusView.as_view(), name="safety"),
    path("sos", views.SosView.as_view(), name="sos"),
]
