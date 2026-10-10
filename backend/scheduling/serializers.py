from typing import Any

from django.db import transaction
from rest_framework import serializers

from scheduling.models import Appointment, Medication, MedicationSchedule, Routine
from scheduling.recurrence import InvalidRecurrence, normalize_rule


def _validate_rule(value: str) -> str:
    try:
        return normalize_rule(value)
    except InvalidRecurrence as exc:
        raise serializers.ValidationError(str(exc)) from exc


def _validate_date_range(attrs: dict[str, Any], instance: Any, start: str, end: str) -> None:
    start_value = attrs.get(start, getattr(instance, start, None))
    end_value = attrs.get(end, getattr(instance, end, None))
    if start_value and end_value and end_value < start_value:
        raise serializers.ValidationError({end: "The end must be after the start."})


class RoutineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Routine
        fields = [
            "id",
            "title",
            "notes",
            "scheduled_time",
            "recurrence_rule",
            "start_date",
            "end_date",
            "priority",
            "reminder_enabled",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_recurrence_rule(self, value: str) -> str:
        return _validate_rule(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _validate_date_range(attrs, self.instance, "start_date", "end_date")
        return attrs


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ["id", "title", "start_at", "end_at", "location", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _validate_date_range(attrs, self.instance, "start_at", "end_at")
        return attrs


class MedicationScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicationSchedule
        fields = ["id", "time_of_day", "recurrence_rule", "start_date", "end_date", "is_active"]
        read_only_fields = ["id"]

    def validate_recurrence_rule(self, value: str) -> str:
        return _validate_rule(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _validate_date_range(attrs, self.instance, "start_date", "end_date")
        return attrs


class MedicationSerializer(serializers.ModelSerializer):
    """Medication with its schedules. On create, schedules may be supplied in the same request."""

    schedules = MedicationScheduleSerializer(many=True, required=False)

    class Meta:
        model = Medication
        fields = ["id", "name", "dosage_text", "instructions", "is_active", "schedules", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance: Medication) -> dict[str, Any]:
        data = super().to_representation(instance)
        data["schedules"] = [s for s in data["schedules"] if s["is_active"]]
        return data

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Medication:
        schedules = validated_data.pop("schedules", [])
        medication = Medication.objects.create(**validated_data)
        for schedule in schedules:
            MedicationSchedule.objects.create(medication=medication, **schedule)
        return medication

    def update(self, instance: Medication, validated_data: dict[str, Any]) -> Medication:
        if "schedules" in validated_data:
            raise serializers.ValidationError({"schedules": "Edit schedules through their own endpoints."})
        return super().update(instance, validated_data)
