from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """
    The page every list endpoint returns unless it names its own: {count, next, previous, results},
    PAGE_SIZE rows by default and up to max_page_size with ?page_size=.
    """
    page_size_query_param = 'page_size'
    max_page_size = 200


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
