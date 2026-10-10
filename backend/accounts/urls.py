from django.urls import path

from accounts import views

urlpatterns = [
    path("auth/register/caregiver", views.RegisterCaregiverView.as_view(), name="register-caregiver"),
    path("auth/register/patient", views.RegisterPatientView.as_view(), name="register-patient"),
    path("auth/login", views.LoginView.as_view(), name="login"),
    path("auth/refresh", views.RefreshView.as_view(), name="token-refresh"),
    path("auth/logout", views.LogoutView.as_view(), name="logout"),
    path("auth/me", views.MeView.as_view(), name="me"),
    path("auth/password/change", views.PasswordChangeView.as_view(), name="password-change"),
]
