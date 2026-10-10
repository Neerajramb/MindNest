from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import Role
from ai.gemini import AIUnavailable
from ai.objects import get_object_detector
from audit.models import LogCategory
from audit.service import log_event
from core.exceptions import ServiceUnavailable
from core.media import read_image, to_jpeg_bytes
from core.permissions import IsCaregiver, IsPatient, IsPatientOrCaregiver, user_of
from core.scope import own_patient, resolve_owned, resolve_patient
from objects_ai.models import ObjectObservation, Place, TrackedObject
from objects_ai.service import find_object, last_seen_answer, latest_observation, record_scan


class PlaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Place
        fields = ["id", "name"]
        read_only_fields = ["id"]


class TrackedObjectSerializer(serializers.ModelSerializer):
    last_seen = serializers.SerializerMethodField()

    class Meta:
        model = TrackedObject
        fields = ["id", "name", "aliases", "category", "last_seen"]
        read_only_fields = ["id", "last_seen"]

    def validate_name(self, value: str) -> str:
        return value.strip().lower()

    def get_last_seen(self, obj: TrackedObject) -> dict[str, Any] | None:
        obs = latest_observation(obj)
        if obs is None:
            return None
        return {
            "place": obs.place.name if obs.place else obs.location_label or None,
            "observed_at": obs.observed_at.isoformat(),
            "confidence": float(obs.confidence) if obs.confidence is not None else None,
        }


class ObservationSerializer(serializers.ModelSerializer):
    place_name = serializers.CharField(source="place.name", default=None, read_only=True)

    class Meta:
        model = ObjectObservation
        fields = ["id", "place_name", "location_label", "observed_at", "confidence", "source"]
        read_only_fields = fields


class ScanSerializer(serializers.Serializer):
    image = serializers.FileField()
    place_id = serializers.UUIDField(required=False)
    location_label = serializers.CharField(required=False, allow_blank=True, max_length=160)


class QuerySerializer(serializers.Serializer):
    query = serializers.CharField(max_length=300)


@extend_schema(tags=["objects"])
class PlaceListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=PlaceSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(PlaceSerializer(Place.objects.filter(patient=patient, is_active=True), many=True).data)

    @extend_schema(request=PlaceSerializer, responses={201: PlaceSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, write=True)
        serializer = PlaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(patient=patient)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["objects"])
class PlaceDetailView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(responses={204: None})
    def delete(self, request: Request, place_id: UUID) -> Response:
        place = get_object_or_404(Place, pk=place_id, is_active=True)
        resolve_owned(user_of(request), place.patient_id, write=True)
        place.is_active = False
        place.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["objects"])
class TrackedObjectListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=TrackedObjectSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        objects = TrackedObject.objects.filter(patient=patient, is_active=True)
        return Response(TrackedObjectSerializer(objects, many=True).data)

    @extend_schema(request=TrackedObjectSerializer, responses={201: TrackedObjectSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        user = user_of(request)
        # API spec: patients and caregivers may register objects; caregivers need edit rights.
        patient = resolve_patient(user, patient_id, write=user.role == Role.CAREGIVER)
        serializer = TrackedObjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if TrackedObject.objects.filter(
            patient=patient, is_active=True, name=serializer.validated_data["name"]
        ).exists():
            raise ValidationError({"name": "This item is already on the list."})
        obj = serializer.save(patient=patient)
        log_event("object.tracked", actor=user, patient=patient, category=LogCategory.AUDIT, object=obj.name)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["objects"])
class TrackedObjectDetailView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=TrackedObjectSerializer, responses=TrackedObjectSerializer)
    def patch(self, request: Request, object_id: UUID) -> Response:
        obj = get_object_or_404(TrackedObject, pk=object_id, is_active=True)
        resolve_owned(user_of(request), obj.patient_id, write=True)
        serializer = TrackedObjectSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, object_id: UUID) -> Response:
        obj = get_object_or_404(TrackedObject, pk=object_id, is_active=True)
        resolve_owned(user_of(request), obj.patient_id, write=True)
        obj.is_active = False
        obj.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["objects"])
class ObservationListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=ObservationSerializer(many=True))
    def get(self, request: Request, object_id: UUID) -> Response:
        obj = get_object_or_404(TrackedObject, pk=object_id)
        resolve_owned(user_of(request), obj.patient_id)
        return Response(ObservationSerializer(obj.observations.select_related("place")[:50], many=True).data)


@extend_schema(tags=["objects"])
class LastSeenView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    def get(self, request: Request, object_id: UUID) -> Response:
        obj = get_object_or_404(TrackedObject, pk=object_id, is_active=True)
        patient = resolve_owned(user_of(request), obj.patient_id)
        return Response(last_seen_answer(patient, obj).as_dict())


@extend_schema(tags=["objects"])
class ObjectQueryView(APIView):
    """P-05: "Where are my keys?" answered from stored observations, without an LLM (BR-03, BR-05)."""

    permission_classes = [IsPatient]
    parser_classes = [JSONParser]

    @extend_schema(request=QuerySerializer)
    def post(self, request: Request) -> Response:
        serializer = QuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient = own_patient(user_of(request))
        obj = find_object(patient, serializer.validated_data["query"])
        return Response(last_seen_answer(patient, obj).as_dict())


@extend_schema(tags=["objects"])
class ScanView(APIView):
    """Room scan: one camera frame, analysed for the patient's tracked items, then discarded (OBJ-01..05)."""

    permission_classes = [IsPatientOrCaregiver]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    @extend_schema(request={"multipart/form-data": ScanSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        user = user_of(request)
        patient = resolve_patient(user, patient_id, write=user.role == Role.CAREGIVER)
        serializer = ScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        place = None
        if serializer.validated_data.get("place_id"):
            place = get_object_or_404(Place, pk=serializer.validated_data["place_id"], patient=patient, is_active=True)
        jpeg = to_jpeg_bytes(read_image(serializer.validated_data["image"]))
        try:
            observations = record_scan(
                get_object_detector(),
                patient,
                jpeg,
                place=place,
                location_label=serializer.validated_data.get("location_label", ""),
                user=user,
            )
        except AIUnavailable as exc:
            raise ServiceUnavailable("Object scanning is not available right now. Please try again later.") from exc
        found = sorted(o.tracked_object.name for o in observations)
        label = serializer.validated_data.get("location_label")
        where = f"the {place.name.lower()}" if place else label or "this place"
        message = (
            f"I saw your {', '.join(found)} in {where}. I'll remember that."
            if found
            else "I didn't see any of your tracked items here."
        )
        return Response({"found": found, "message": message}, status=status.HTTP_201_CREATED)
