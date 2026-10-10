from django.contrib import admin

from care.models import Caregiver, CaregiverPatient, EmergencyContact, Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ["display_name", "user", "timezone", "created_at"]
    search_fields = ["display_name"]


@admin.register(Caregiver)
class CaregiverAdmin(admin.ModelAdmin):
    list_display = ["user", "created_at"]


@admin.register(CaregiverPatient)
class CaregiverPatientAdmin(admin.ModelAdmin):
    list_display = ["caregiver", "patient", "permission_level", "is_active"]
    list_filter = ["permission_level", "is_active"]


admin.site.register(EmergencyContact)
