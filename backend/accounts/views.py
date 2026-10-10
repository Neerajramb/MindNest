from collections.abc import Sequence
from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.models import User
from accounts.serializers import (
    CaregiverRegisterSerializer,
    LoginSerializer,
    LogoutSerializer,
    PasswordChangeSerializer,
    PatientRegisterSerializer,
    UserSerializer,
    token_payload,
)
from audit.models import LogCategory
from audit.service import log_event
from care.models import Patient
from core.permissions import user_of


class _AuthThrottled:
    throttle_classes: Sequence[type[BaseThrottle]] = [ScopedRateThrottle]
    throttle_scope = "auth"


@extend_schema(tags=["auth"])
class RegisterCaregiverView(_AuthThrottled, APIView):
    permission_classes = [AllowAny]
    authentication_classes: list[type] = []

    @extend_schema(request=CaregiverRegisterSerializer)
    def post(self, request: Request) -> Response:
        serializer = CaregiverRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_event("auth.register", actor=user, category=LogCategory.AUDIT, role=user.role)
        return Response(token_payload(user), status=status.HTTP_201_CREATED)


@extend_schema(tags=["auth"])
class RegisterPatientView(_AuthThrottled, APIView):
    """Patient self-registration with a caregiver-issued link code."""

    permission_classes = [AllowAny]
    authentication_classes: list[type] = []

    @extend_schema(request=PatientRegisterSerializer)
    def post(self, request: Request) -> Response:
        serializer = PatientRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        patient = Patient.objects.get(user=user)
        log_event("auth.register", actor=user, patient=patient, category=LogCategory.AUDIT, role=user.role)
        return Response(token_payload(user), status=status.HTTP_201_CREATED)


@extend_schema(tags=["auth"])
class LoginView(_AuthThrottled, TokenObtainPairView):
    serializer_class = LoginSerializer

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user = User.objects.get(pk=response.data["user"]["id"])
            log_event("auth.login", actor=user, category=LogCategory.AUDIT)
        return response


@extend_schema(tags=["auth"])
class RefreshView(_AuthThrottled, TokenRefreshView):
    pass


@extend_schema(tags=["auth"])
class LogoutView(APIView):
    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            if str(token.get("user_id")) != str(user_of(request).pk):
                return Response(status=status.HTTP_204_NO_CONTENT)
            token.blacklist()
        except TokenError:
            pass  # Already invalid or expired: logging out is still successful from the user's view.
        log_event("auth.logout", actor=user_of(request), category=LogCategory.AUDIT)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["auth"])
class MeView(APIView):
    @extend_schema(responses=UserSerializer)
    def get(self, request: Request) -> Response:
        return Response(UserSerializer(user_of(request)).data)


@extend_schema(tags=["auth"])
class PasswordChangeView(_AuthThrottled, APIView):
    @extend_schema(request=PasswordChangeSerializer, responses={204: None})
    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user_of(request).set_password(serializer.validated_data["new_password"])
        user_of(request).save(update_fields=["password"])
        log_event("auth.password_changed", actor=user_of(request), category=LogCategory.AUDIT)
        return Response(status=status.HTTP_204_NO_CONTENT)
