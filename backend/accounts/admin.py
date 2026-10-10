from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from accounts.models import User


@admin.register(User)
class MindNestUserAdmin(UserAdmin):
    list_display = ["username", "name", "role", "is_active", "date_joined"]
    list_filter = ["role", "is_active", "is_staff"]
    search_fields = ["username", "name", "email"]
    fieldsets = (
        *UserAdmin.fieldsets,  # type: ignore[misc]
        ("MindNest", {"fields": ("name", "phone", "role")}),
    )
    add_fieldsets = (
        *UserAdmin.add_fieldsets,
        ("MindNest", {"fields": ("name", "role")}),
    )
