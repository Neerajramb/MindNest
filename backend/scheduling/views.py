from datetime import date
from uuid import UUID
from zoneinfo import ZoneInfo

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from audit.models import LogCategory
from audit.service import log_event
from care.models import Patient
from core.permissions import IsCaregiver, IsPatientOrCaregiver, user_of
from core.scope import resolve_owned, resolve_patient
from notifications.models import AlertType, Severity
from notifications.service import create_alert
from reminders.service import refresh_source
from scheduling.agenda import build_agenda
from scheduling.models import Appointment, Medication, MedicationSchedule, Routine
from scheduling.serializers import (
    AppointmentSerializer,
    MedicationScheduleSerializer,
    MedicationSerializer,
    RoutineSerializer,
)


def _audit(request: Request, event: str, patient: Patient, **data: object) -> None:
    log_event(event, actor=user_of(request), patient=patient, category=LogCategory.AUDIT, **data)


def describe_routine(routine: Routine) -> str:
    """'Go to the park at 4:00 pm on Sun 11 Oct' or '... every day', for caregiver alerts."""
    hour = routine.scheduled_time.hour % 12 or 12
    clock = f"{hour}:{routine.scheduled_time:%M} {'pm' if routine.scheduled_time.hour >= 12 else 'am'}"
    if routine.end_date == routine.start_date:
        when = f"on {routine.start_date:%a} {routine.start_date.day} {routine.start_date:%b}"
    elif routine.recurrence_rule == "FREQ=DAILY":
        when = "every day"
    else:
        when = "repeating"
    return f"{routine.title} at {clock} {when}"


# ---------- Routines (daily schedule) ----------


@extend_schema(tags=["schedule"])
class RoutineListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=RoutineSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        return Response(RoutineSerializer(Routine.objects.filter(patient=patient, is_active=True), many=True).data)

    @extend_schema(request=RoutineSerializer, responses={201: RoutineSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        """Caregivers (editor or above) add routines; patients may add their own, and their caregivers are told."""
        user = user_of(request)
        by_patient = user.role == Role.PATIENT
        patient = resolve_patient(user, patient_id, write=not by_patient)
        serializer = RoutineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        routine = serializer.save(patient=patient, created_by=user)
        refresh_source(patient, routine.id)
        _audit(request, "routine.created", patient, routine_id=str(routine.id))
        if by_patient:
            create_alert(
                patient,
                AlertType.PATIENT_REMINDER,
                Severity.INFO,
                f"{patient.preferred_name or patient.display_name} added a reminder: {describe_routine(routine)}.",
                data={"routine_id": str(routine.id)},
                actor=user,
            )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["schedule"])
class RoutineDetailView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=RoutineSerializer, responses=RoutineSerializer)
    def patch(self, request: Request, routine_id: UUID) -> Response:
        routine = get_object_or_404(Routine, pk=routine_id)
        patient = resolve_owned(user_of(request), routine.patient_id, write=True)
        serializer = RoutineSerializer(routine, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        refresh_source(patient, routine.id)
        _audit(request, "routine.updated", patient, routine_id=str(routine.id))
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, routine_id: UUID) -> Response:
        routine = get_object_or_404(Routine, pk=routine_id)
        patient = resolve_owned(user_of(request), routine.patient_id, write=True)
        routine.is_active = False
        routine.save(update_fields=["is_active", "updated_at"])
        refresh_source(patient, routine.id)
        _audit(request, "routine.deactivated", patient, routine_id=str(routine.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Appointments (calendar) ----------


@extend_schema(tags=["schedule"])
class AppointmentListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(
        parameters=[OpenApiParameter("upcoming", bool, description="Only appointments that have not started")],
        responses=AppointmentSerializer(many=True),
    )
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        appointments = Appointment.objects.filter(patient=patient)
        if request.query_params.get("upcoming") in {"1", "true"}:
            appointments = appointments.filter(start_at__gte=timezone.now())
        return Response(AppointmentSerializer(appointments, many=True).data)

    @extend_schema(request=AppointmentSerializer, responses={201: AppointmentSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, write=True)
        serializer = AppointmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save(patient=patient, created_by=user_of(request))
        refresh_source(patient, appointment.id)
        _audit(request, "appointment.created", patient, appointment_id=str(appointment.id))
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["schedule"])
class AppointmentDetailView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=AppointmentSerializer)
    def get(self, request: Request, appointment_id: UUID) -> Response:
        appointment = get_object_or_404(Appointment, pk=appointment_id)
        resolve_owned(user_of(request), appointment.patient_id)
        return Response(AppointmentSerializer(appointment).data)

    @extend_schema(request=AppointmentSerializer, responses=AppointmentSerializer)
    def patch(self, request: Request, appointment_id: UUID) -> Response:
        appointment = get_object_or_404(Appointment, pk=appointment_id)
        patient = resolve_owned(user_of(request), appointment.patient_id, write=True)
        serializer = AppointmentSerializer(appointment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        refresh_source(patient, appointment.id)
        _audit(request, "appointment.updated", patient, appointment_id=str(appointment.id))
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, appointment_id: UUID) -> Response:
        appointment = get_object_or_404(Appointment, pk=appointment_id)
        patient = resolve_owned(user_of(request), appointment.patient_id, write=True)
        appointment_pk = appointment.id
        appointment.delete()
        refresh_source(patient, appointment_pk)
        _audit(request, "appointment.deleted", patient, appointment_id=str(appointment_pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Medications ----------


@extend_schema(tags=["medication"])
class MedicationListView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=MedicationSerializer(many=True))
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        medications = Medication.objects.filter(patient=patient, is_active=True).prefetch_related("schedules")
        return Response(MedicationSerializer(medications, many=True).data)

    @extend_schema(request=MedicationSerializer, responses={201: MedicationSerializer})
    def post(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id, write=True)
        serializer = MedicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        medication = serializer.save(patient=patient, created_by=user_of(request))
        for schedule in medication.schedules.all():
            refresh_source(patient, schedule.id)
        _audit(request, "medication.created", patient, medication_id=str(medication.id))
        return Response(MedicationSerializer(medication).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["medication"])
class MedicationDetailView(APIView):
    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(responses=MedicationSerializer)
    def get(self, request: Request, medication_id: UUID) -> Response:
        medication = get_object_or_404(Medication, pk=medication_id)
        resolve_owned(user_of(request), medication.patient_id)
        return Response(MedicationSerializer(medication).data)

    @extend_schema(request=MedicationSerializer, responses=MedicationSerializer)
    def patch(self, request: Request, medication_id: UUID) -> Response:
        medication = get_object_or_404(Medication, pk=medication_id)
        patient = resolve_owned(user_of(request), medication.patient_id, write=True)
        serializer = MedicationSerializer(medication, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        for schedule in medication.schedules.all():
            refresh_source(patient, schedule.id)
        _audit(request, "medication.updated", patient, medication_id=str(medication.id), fields=sorted(request.data))
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, medication_id: UUID) -> Response:
        medication = get_object_or_404(Medication, pk=medication_id)
        patient = resolve_owned(user_of(request), medication.patient_id, write=True)
        medication.is_active = False
        medication.save(update_fields=["is_active", "updated_at"])
        for schedule in medication.schedules.all():
            refresh_source(patient, schedule.id)
        _audit(request, "medication.deactivated", patient, medication_id=str(medication.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["medication"])
class MedicationScheduleCreateView(APIView):
    permission_classes = [IsCaregiver]

    @extend_schema(request=MedicationScheduleSerializer, responses={201: MedicationScheduleSerializer})
    def post(self, request: Request, medication_id: UUID) -> Response:
        medication = get_object_or_404(Medication, pk=medication_id)
        patient = resolve_owned(user_of(request), medication.patient_id, write=True)
        serializer = MedicationScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save(medication=medication)
        refresh_source(patient, schedule.id)
        _audit(request, "medication_schedule.created", patient, medication_id=str(medication.id))
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["medication"])
class MedicationScheduleDetailView(APIView):
    permission_classes = [IsCaregiver]

    def _get(self, request: Request, schedule_id: UUID) -> tuple[MedicationSchedule, Patient]:
        schedule = get_object_or_404(MedicationSchedule.objects.select_related("medication"), pk=schedule_id)
        return schedule, resolve_owned(user_of(request), schedule.medication.patient_id, write=True)

    @extend_schema(request=MedicationScheduleSerializer, responses=MedicationScheduleSerializer)
    def patch(self, request: Request, schedule_id: UUID) -> Response:
        schedule, patient = self._get(request, schedule_id)
        serializer = MedicationScheduleSerializer(schedule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        refresh_source(patient, schedule.id)
        _audit(request, "medication_schedule.updated", patient, schedule_id=str(schedule.id))
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, schedule_id: UUID) -> Response:
        schedule, patient = self._get(request, schedule_id)
        schedule.is_active = False
        schedule.save(update_fields=["is_active", "updated_at"])
        refresh_source(patient, schedule.id)
        _audit(request, "medication_schedule.deactivated", patient, schedule_id=str(schedule.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Day agenda ----------


@extend_schema(tags=["schedule"])
class AgendaView(APIView):
    """Merged routines, medication doses and appointments for one day, with reminder status (SCH-02)."""

    permission_classes = [IsPatientOrCaregiver]

    @extend_schema(parameters=[OpenApiParameter("date", date, description="Local date; defaults to today")])
    def get(self, request: Request, patient_id: UUID) -> Response:
        patient = resolve_patient(user_of(request), patient_id)
        tz = ZoneInfo(patient.timezone)
        raw = request.query_params.get("date")
        try:
            day = date.fromisoformat(raw) if raw else timezone.now().astimezone(tz).date()
        except ValueError as exc:
            raise ValidationError({"date": "Use the format YYYY-MM-DD."}) from exc
        items = build_agenda(patient, day)
        return Response(
            {"date": day.isoformat(), "timezone": patient.timezone, "items": [item.as_dict(tz) for item in items]}
        )
