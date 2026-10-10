from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ai.gemini import AIUnavailable
from ai.speech import transcribe_query
from assistant.answers import answer
from assistant.models import AssistantSession
from assistant.router import classify
from audit.service import log_event
from care.models import Patient
from core.exceptions import ServiceUnavailable
from core.media import read_audio
from core.permissions import IsPatient, user_of
from core.request_data import field
from core.scope import own_patient
from people.models import Person


class SessionSerializer(serializers.Serializer):
    context_person_id = serializers.UUIDField(required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=["TEXT", "VOICE"], default="TEXT")


class QuerySerializer(serializers.Serializer):
    query = serializers.CharField(max_length=500)
    session_id = serializers.UUIDField(required=False, allow_null=True)
    context_person_id = serializers.UUIDField(required=False, allow_null=True)


def _person(patient: Patient, person_id: Any) -> Person | None:
    if not person_id:
        return None
    return get_object_or_404(Person, pk=person_id, patient=patient, is_active=True)


def _session(patient: Patient, session_id: Any) -> AssistantSession | None:
    if not session_id:
        return None
    return get_object_or_404(AssistantSession, pk=session_id, patient=patient)


def _run(request: Request, patient: Patient, question: str, session_id: Any, person_id: Any) -> dict[str, Any]:
    session = _session(patient, session_id)
    person = _person(patient, person_id) or (session.context_person if session else None)
    if session and person and session.context_person_id != person.id:
        session.context_person = person
        session.save(update_fields=["context_person"])
    intent = classify(patient, question)
    result = answer(patient, question, intent, context_person=person)
    # Log the kind of question, not its content (API spec section 17: no unnecessary sensitive content).
    log_event("assistant.query", actor=user_of(request), patient=patient, intent=intent, used_llm=result.used_llm)
    return {"question": question, **result.as_dict()}


@extend_schema(tags=["assistant"])
class SessionCreateView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(request=SessionSerializer)
    def post(self, request: Request) -> Response:
        patient = own_patient(user_of(request))
        serializer = SessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = AssistantSession.objects.create(
            patient=patient,
            mode=serializer.validated_data["mode"],
            context_person=_person(patient, serializer.validated_data.get("context_person_id")),
        )
        return Response(
            {"id": str(session.id), "started_at": session.started_at.isoformat()}, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["assistant"])
class SessionDetailView(APIView):
    permission_classes = [IsPatient]

    def get(self, request: Request, session_id: UUID) -> Response:
        session = get_object_or_404(AssistantSession, pk=session_id, patient=own_patient(user_of(request)))
        return Response(
            {
                "id": str(session.id),
                "started_at": session.started_at.isoformat(),
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "mode": session.mode,
                "context_person": (
                    {"id": str(session.context_person.id), "name": session.context_person.name}
                    if session.context_person
                    else None
                ),
            }
        )


@extend_schema(tags=["assistant"])
class SessionEndView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request, session_id: UUID) -> Response:
        session = get_object_or_404(AssistantSession, pk=session_id, patient=own_patient(user_of(request)))
        session.ended_at = session.ended_at or timezone.now()
        session.save(update_fields=["ended_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["assistant"])
class QueryView(APIView):
    """P-03: typed or voice-derived question (FR-007, FR-019)."""

    permission_classes = [IsPatient]
    parser_classes = [JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    @extend_schema(request=QuerySerializer)
    def post(self, request: Request) -> Response:
        patient = own_patient(user_of(request))
        serializer = QuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.validated_data["query"].strip()
        if not question:
            raise ValidationError({"query": "Ask a question."})
        data = serializer.validated_data
        return Response(_run(request, patient, question, data.get("session_id"), data.get("context_person_id")))


@extend_schema(tags=["assistant"])
class VoiceQueryView(APIView):
    """Spoken question: transcribed (audio discarded), then answered like a typed one (RAG-02)."""

    permission_classes = [IsPatient]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    def post(self, request: Request) -> Response:
        patient = own_patient(user_of(request))
        audio, extension = read_audio(request.FILES.get("audio"))
        try:
            question = transcribe_query(audio, extension)
        except AIUnavailable as exc:
            raise ServiceUnavailable("I couldn't hear that right now. Please type your question instead.") from exc
        if not question:
            raise ValidationError({"audio": "I didn't catch that. Please try again or type your question."})
        return Response(
            _run(request, patient, question, field(request, "session_id"), field(request, "context_person_id"))
        )
