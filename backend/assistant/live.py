"""Live companion: one camera frame answers "where am I, what is around me and who is with me?".

Faces are checked locally on every frame (cheap). The room and belongings go to the vision model only when the app
asks for a full look, so the phone can poll for faces every few seconds without using the AI quota. The photo is
never stored; tracked items seen are saved as ordinary observations, so "Where are my keys?" can use them later.
"""

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ai.face import FaceModelsMissing, get_face_engine
from ai.gemini import AIUnavailable
from ai.objects import get_object_detector
from audit.service import log_event
from core.media import read_image, to_jpeg_bytes
from core.permissions import IsPatient, user_of
from core.scope import own_patient
from objects_ai.service import SceneResult, record_scene
from people.service import Recognition, recognize


class LookSerializer(serializers.Serializer):
    image = serializers.FileField()
    scene = serializers.BooleanField(default=False)


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def compose_message(scene: SceneResult | None, scene_failed: bool, face: Recognition | None) -> str:
    parts: list[str] = []
    if scene is not None:
        if scene.place:
            parts.append(f"You are in the {scene.place.name.lower()}.")
        elif scene.location_label:
            parts.append(f"This looks like {scene.location_label}.")
        found = sorted(o.tracked_object.name for o in scene.observations)
        if found:
            parts.append(f"I can see your {_join(found)}. I'll remember they were here.")
        elif scene.others:
            parts.append(f"I can see {_join(scene.others)}.")
    elif scene_failed:
        parts.append("I couldn't look around the room just now.")
    if face is not None and face.status in ("RECOGNIZED", "UNKNOWN"):
        parts.append(str(face.as_dict()["message"]))
    return " ".join(parts)


@extend_schema(tags=["assistant"])
class LiveLookView(APIView):
    permission_classes = [IsPatient]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    @extend_schema(request={"multipart/form-data": LookSerializer})
    def post(self, request: Request) -> Response:
        user = user_of(request)
        patient = own_patient(user)
        serializer = LookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rgb = read_image(serializer.validated_data["image"])

        face: Recognition | None = None
        try:
            face = recognize(get_face_engine(), patient, rgb)
        except FaceModelsMissing:
            face = None
        if face is not None and face.status in ("RECOGNIZED", "UNKNOWN"):
            log_event(
                "face.recognition",
                actor=user,
                patient=patient,
                result=face.status,
                person=face.person.name if face.person else None,
                live=True,
            )

        scene: SceneResult | None = None
        scene_failed = False
        if serializer.validated_data["scene"]:
            try:
                scene = record_scene(get_object_detector(), patient, to_jpeg_bytes(rgb), user=user)
            except AIUnavailable:
                scene_failed = True

        data: dict[str, Any] = {
            "message": compose_message(scene, scene_failed, face),
            "face": face.as_dict() if face is not None else None,
            "scene": scene.as_dict() if scene is not None else None,
            "scene_failed": scene_failed,
        }
        return Response(data)
