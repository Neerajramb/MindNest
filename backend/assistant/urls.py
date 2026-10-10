from django.urls import path

from assistant import views

urlpatterns = [
    path("assistant/sessions", views.SessionCreateView.as_view(), name="assistant-sessions"),
    path("assistant/sessions/<uuid:session_id>", views.SessionDetailView.as_view(), name="assistant-session"),
    path("assistant/sessions/<uuid:session_id>/end", views.SessionEndView.as_view(), name="assistant-session-end"),
    path("assistant/query", views.QueryView.as_view(), name="assistant-query"),
    path("assistant/voice-query", views.VoiceQueryView.as_view(), name="assistant-voice-query"),
]
