from django.urls import path

from memory import views

urlpatterns = [
    path("conversations/record", views.RecordConversationView.as_view(), name="conversation-record"),
    path("conversations/note", views.NoteView.as_view(), name="conversation-note"),
    path("conversations/<uuid:conversation_id>", views.ConversationDeleteView.as_view(), name="conversation-delete"),
    path("patients/<uuid:patient_id>/conversations", views.ConversationListView.as_view(), name="conversations"),
    path("memory/search", views.MemorySearchView.as_view(), name="memory-search"),
]
