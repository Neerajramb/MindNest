from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import Role
from ai.embeddings import get_embedder
from ai.gemini import AIUnavailable
from ai.speech import transcribe_conversation
from care.models import MemoryAccess, Patient
from core.exceptions import ServiceUnavailable
from core.media import read_audio
from core.permissions import IsPatient, IsPatientOrCaregiver, user_of
from core.request_data import field
from core.scope import own_patient, resolve_patient
from memory.models import Conversation, ConversationSource, Retention
from memory.plans import suggest_reminders
from memory.service import ingest, retire, search, text_note_segments
from people.models import Person


def _person(patient: Patient, person_id: Any) -> Person | None:
    if not person_id:
        return None
    return get_object_or_404(Person, pk=person_id, patient=patient, is_active=True)


def _require_consent(value: Any) -> None:
    if str(value).lower() not in {"true", "1", "yes"}:
        raise ValidationError({"consent_confirmed": "Everyone in the conversation must agree to it being saved."})


class RecordSerializer(serializers.Serializer):
    audio = serializers.FileField()
    person_id = serializers.UUIDField(required=False, allow_null=True)
    consent_confirmed = serializers.BooleanField()


class NoteSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=4000)
    person_id = serializers.UUIDField(required=False, allow_null=True)
    consent_confirmed = serializers.BooleanField(default=True)


class SearchSerializer(serializers.Serializer):
    query = serializers.CharField(max_length=300)
    person_id = serializers.UUIDField(required=False, allow_null=True)


def conversation_summary(conversation: Conversation, *, include_text: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": str(conversation.id),
        "started_at": conversation.started_at.isoformat(),
        "source": conversation.source,
        "person": (
            {"id": str(conversation.recognized_person.id), "name": conversation.recognized_person.name}
            if conversation.recognized_person
            else None
        ),
        "turns": conversation.messages.count(),
    }
    if include_text:
        data["messages"] = [{"speaker": m.speaker_type, "text": m.content} for m in conversation.messages.all()]
    return data


@extend_schema(tags=["memory"])
class RecordConversationView(APIView):
    """Save a recorded conversation: transcribe, segment, embed; the audio is discarded (FR-015, FR-016)."""

    permission_classes = [IsPatient]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    @extend_schema(request={"multipart/form-data": RecordSerializer})
    def post(self, request: Request) -> Response:
        user = user_of(request)
        patient = own_patient(user)
        _require_consent(field(request, "consent_confirmed"))
        person = _person(patient, field(request, "person_id"))
        audio, extension = read_audio(request.FILES.get("audio"))
        try:
            segments = transcribe_conversation(audio, extension)
        except AIUnavailable as exc:
            raise ServiceUnavailable("I couldn't understand the recording right now. Please try again later.") from exc
        if not segments:
            raise ValidationError({"audio": "I couldn't hear any words in that recording."})
        conversation = ingest(
            get_embedder(), patient, segments, source=ConversationSource.VOICE, person=person, user=user
        )
        data = conversation_summary(conversation, include_text=True)
        data["suggested_reminders"] = suggest_reminders(patient, segments, person)
        return Response(data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["memory"])
class NoteView(APIView):
    """Typed memory, for when the microphone is unavailable (SRS section 7, RAG-01)."""

    permission_classes = [IsPatient]
    parser_classes = [JSONParser]

    @extend_schema(request=NoteSerializer)
    def post(self, request: Request) -> Response:
        user = user_of(request)
        patient = own_patient(user)
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _require_consent(serializer.validated_data["consent_confirmed"])
        person = _person(patient, serializer.validated_data.get("person_id"))
        segments = text_note_segments(serializer.validated_data["text"])
        if not segments:
            raise ValidationError({"text": "Write something to remember."})
        conversation = ingest(
            get_embedder(), patient, segments, source=ConversationSource.TEXT, person=person, user=user
        )
        data = conversation_summary(conversation, include_text=True)
        data["suggested_reminders"] = suggest_reminders(patient, segments, person)
        return Response(data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["memory"])
class ConversationListView(APIView):
    """Patients see their own conversations. Caregivers see what the patient's privacy setting allows (C-12)."""

    permission_classes = [IsPatientOrCaregiver]

    def get(self, request: Request, patient_id: UUID) -> Response:
        user = user_of(request)
        patient = resolve_patient(user, patient_id)
        access = MemoryAccess.FULL if user.role == Role.PATIENT else patient.caregiver_memory_access
        if access == MemoryAccess.NONE:
            raise PermissionDenied(f"{patient.display_name} has chosen to keep conversations private.")
        conversations = (
            Conversation.objects.filter(patient=patient, retention_status=Retention.ACTIVE)
            .select_related("recognized_person")
            .prefetch_related("messages")[:50]
        )
        return Response(
            {
                "access": access,
                "conversations": [
                    conversation_summary(c, include_text=access == MemoryAccess.FULL) for c in conversations
                ],
            }
        )


@extend_schema(tags=["memory"])
class ConversationDeleteView(APIView):
    """The patient can delete any of their conversations; the transcript and vectors are removed."""

    permission_classes = [IsPatient]

    @extend_schema(responses={204: None})
    def delete(self, request: Request, conversation_id: UUID) -> Response:
        user = user_of(request)
        conversation = get_object_or_404(
            Conversation, pk=conversation_id, patient=own_patient(user), retention_status=Retention.ACTIVE
        )
        retire(conversation, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["memory"])
class MemorySearchView(APIView):
    """Semantic search over the signed-in patient's memories (RAG-04/05)."""

    permission_classes = [IsPatient]
    parser_classes = [JSONParser]

    @extend_schema(request=SearchSerializer)
    def post(self, request: Request) -> Response:
        patient = own_patient(user_of(request))
        serializer = SearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        person = _person(patient, serializer.validated_data.get("person_id"))
        hits = search(get_embedder(), patient, serializer.validated_data["query"], person=person)
        return Response(
            [
                {
                    "id": str(h.memory.id),
                    "text": h.memory.content,
                    "event_time": h.memory.event_time.isoformat(),
                    "person": h.memory.recognized_person.name if h.memory.recognized_person else None,
                    "score": round(h.score, 3),
                }
                for h in hits
            ]
        )
