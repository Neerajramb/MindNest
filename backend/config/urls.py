from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.views import HealthView

api_v1: list[URLPattern | URLResolver] = [
    path("health", HealthView.as_view(), name="health"),
    path("", include("accounts.urls")),
    path("", include("care.urls")),
    path("", include("audit.urls")),
    path("", include("scheduling.urls")),
    path("", include("reminders.urls")),
    path("", include("notifications.urls")),
    path("", include("safety.urls")),
    path("", include("people.urls")),
    path("", include("objects_ai.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
