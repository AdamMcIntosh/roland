"""Caching utilities for oh-my-goose."""

_cache: dict[str, str] = {}


def cache_result(query: str, result: str) -> None:
    """Cache a query result.
    
    Args:
        query: The input query.
        result: The result to cache.
    """
    _cache[query] = result


def get_cached(query: str) -> str | None:
    """Get a cached result for a query.
    
    Args:
        query: The input query.
    
    Returns:
        The cached result or None if not found.
    """
    return _cache.get(query)
