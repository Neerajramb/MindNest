from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User
from care.models import Caregiver, LinkCode, Patient


class UserSerializer(serializers.ModelSerializer):
    patient_id = serializers.SerializerMethodField()
    caregiver_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "name", "email", "phone", "role", "patient_id", "caregiver_id"]
        read_only_fields = fields

    def get_patient_id(self, user: User) -> str | None:
        patient = Patient.objects.filter(user=user).only("id").first()
        return str(patient.id) if patient else None

    def get_caregiver_id(self, user: User) -> str | None:
        caregiver = Caregiver.objects.filter(user=user).only("id").first()
        return str(caregiver.id) if caregiver else None


def token_payload(user: User) -> dict[str, Any]:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data}


class _AccountFieldsMixin(serializers.Serializer):
    username = serializers.RegexField(r"^[\w.@+-]{3,150}$", max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value


class CaregiverRegisterSerializer(_AccountFieldsMixin):
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        candidate = User(username=attrs["username"], name=attrs["name"], email=attrs.get("email", ""))
        validate_password(attrs["password"], user=candidate)
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> User:
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            name=validated_data["name"],
            email=validated_data.get("email", ""),
            phone=validated_data.get("phone", ""),
            role=Role.CAREGIVER,
        )
        Caregiver.objects.create(user=user)
        return user


class PatientRegisterSerializer(_AccountFieldsMixin):
    link_code = serializers.CharField(max_length=12)

    def validate_link_code(self, value: str) -> LinkCode:
        code = LinkCode.objects.select_related("patient").filter(code=value.strip().upper()).first()
        if code is None or code.used_at is not None or code.expires_at <= timezone.now():
            raise serializers.ValidationError("This link code is not valid. Ask your caregiver for a new one.")
        if code.patient.user_id is not None:
            raise serializers.ValidationError("This patient already has an account.")
        return code

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        candidate = User(username=attrs["username"], name=attrs["link_code"].patient.display_name)
        validate_password(attrs["password"], user=candidate)
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> User:
        code: LinkCode = validated_data["link_code"]
        # Lock the code row so two simultaneous registrations cannot both use it.
        code = LinkCode.objects.select_for_update().select_related("patient").get(pk=code.pk)
        if code.used_at is not None or code.patient.user_id is not None:
            raise serializers.ValidationError({"link_code": "This link code has already been used."})
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            name=code.patient.display_name,
            role=Role.PATIENT,
        )
        code.patient.user = user
        code.patient.save(update_fields=["user", "updated_at"])
        code.used_at = timezone.now()
        code.save(update_fields=["used_at"])
        return user


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        data: dict[str, Any] = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        user: User = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Your current password is not correct."})
        validate_password(attrs["new_password"], user=user)
        return attrs
