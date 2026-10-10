from typing import Any
from zoneinfo import available_timezones

from rest_framework import serializers

from accounts.models import User
from care.models import CaregiverPatient, EmergencyContact, LinkCode, Patient, PermissionLevel

_TIMEZONES = available_timezones()


def _validate_timezone(value: str) -> str:
    if value not in _TIMEZONES:
        raise serializers.ValidationError("Unknown timezone.")
    return value


class PatientSerializer(serializers.ModelSerializer):
    has_account = serializers.SerializerMethodField()
    my_permission_level = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "display_name",
            "preferred_name",
            "date_of_birth",
            "preferred_language",
            "timezone",
            "notes",
            "caregiver_memory_access",
            "location_sharing_enabled",
            "text_scale",
            "voice_responses_enabled",
            "has_account",
            "my_permission_level",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "has_account", "my_permission_level", "created_at", "updated_at"]

    def validate_timezone(self, value: str) -> str:
        return _validate_timezone(value)

    def validate_text_scale(self, value: Any) -> Any:
        if not 1 <= float(value) <= 2:
            raise serializers.ValidationError("Text size must be between 1.0 and 2.0.")
        return value

    def get_has_account(self, patient: Patient) -> bool:
        return patient.user_id is not None

    def get_my_permission_level(self, patient: Patient) -> str | None:
        levels: dict[Any, str] = self.context.get("levels", {})
        return levels.get(patient.id)


class PatientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["display_name", "preferred_name", "date_of_birth", "preferred_language", "timezone", "notes"]

    def validate_timezone(self, value: str) -> str:
        return _validate_timezone(value)


class PatientSelfSettingsSerializer(serializers.ModelSerializer):
    """Settings a patient may change themselves (P-14): text size, voice, language, memory privacy."""

    class Meta:
        model = Patient
        fields = ["preferred_language", "text_scale", "voice_responses_enabled", "caregiver_memory_access"]

    def validate_text_scale(self, value: Any) -> Any:
        if not 1 <= float(value) <= 2:
            raise serializers.ValidationError("Text size must be between 1.0 and 2.0.")
        return value


class LinkCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LinkCode
        fields = ["code", "expires_at"]
        read_only_fields = fields


class CaregiverLinkSerializer(serializers.ModelSerializer):
    caregiver_id = serializers.UUIDField(source="caregiver.id", read_only=True)
    name = serializers.CharField(source="caregiver.user.name", read_only=True)
    username = serializers.CharField(source="caregiver.user.username", read_only=True)

    class Meta:
        model = CaregiverPatient
        fields = ["caregiver_id", "name", "username", "permission_level", "is_active", "created_at"]
        read_only_fields = fields


class AddCaregiverSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    permission_level = serializers.ChoiceField(choices=[PermissionLevel.VIEWER, PermissionLevel.EDITOR])

    def validate_username(self, value: str) -> User:
        user = User.objects.filter(username__iexact=value, role="CAREGIVER", is_active=True).first()
        if user is None or not hasattr(user, "caregiver_profile"):
            raise serializers.ValidationError("No caregiver account with this username.")
        return user


class EmergencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyContact
        fields = ["id", "name", "phone", "relationship", "priority", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone(self, value: str) -> str:
        cleaned = value.replace(" ", "").replace("-", "")
        if not cleaned.lstrip("+").isdigit() or not 3 <= len(cleaned.lstrip("+")) <= 15:
            raise serializers.ValidationError("Enter a valid phone number.")
        return cleaned
