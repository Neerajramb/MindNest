from django.urls import path

from objects_ai import views

urlpatterns = [
    path("patients/<uuid:patient_id>/places", views.PlaceListView.as_view(), name="places"),
    path("places/<uuid:place_id>", views.PlaceDetailView.as_view(), name="place-detail"),
    path("patients/<uuid:patient_id>/objects", views.TrackedObjectListView.as_view(), name="objects"),
    path("patients/<uuid:patient_id>/objects/scan", views.ScanView.as_view(), name="objects-scan"),
    path("objects/query", views.ObjectQueryView.as_view(), name="objects-query"),
    path("objects/<uuid:object_id>", views.TrackedObjectDetailView.as_view(), name="object-detail"),
    path("objects/<uuid:object_id>/observations", views.ObservationListView.as_view(), name="object-observations"),
    path("objects/<uuid:object_id>/last-seen", views.LastSeenView.as_view(), name="object-last-seen"),
]
