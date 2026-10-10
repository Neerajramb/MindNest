from typing import Any

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 200

    def get_paginated_response(self, data: Any) -> Response:
        if self.page is None:  # pragma: no cover - DRF only calls this after paginating
            raise RuntimeError("get_paginated_response called before paginate_queryset")
        return Response(
            {
                "success": True,
                "data": data,
                "meta": {
                    "page": self.page.number,
                    "page_size": self.get_page_size(self.request) if self.request else None,
                    "total": self.page.paginator.count,
                    "has_next": self.page.has_next(),
                },
            }
        )
