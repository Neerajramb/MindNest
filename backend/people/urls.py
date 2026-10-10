from django.urls import path

from people import views

urlpatterns = [
    path("patients/<uuid:patient_id>/people", views.PersonListView.as_view(), name="people"),
    path("people/<uuid:person_id>", views.PersonDetailView.as_view(), name="person-detail"),
    path("people/<uuid:person_id>/face-embeddings", views.FaceEnrolView.as_view(), name="face-enrol"),
    path("face/recognize", views.FaceRecognizeView.as_view(), name="face-recognize"),
]
