"""Caching utilities for oh-my-goose with disk persistence."""

import json
import os

_cache: dict[str, str] = {}
_cache_file = "cache.json"


def _load_cache_from_disk():
    """Load cache from disk if it exists."""
    global _cache
    if os.path.exists(_cache_file):
        try:
            with open(_cache_file, "r") as f:
                _cache = json.load(f)
        except Exception:
            _cache = {}


def _save_cache_to_disk():
    """Save cache to disk."""
    with open(_cache_file, "w") as f:
        json.dump(_cache, f, indent=2)


# Load cache on module import
_load_cache_from_disk()


def cache_result(query: str, result: str) -> None:
    """Cache a query result and persist to disk.
    
    Args:
        query: The input query.
        result: The result to cache.
    """
    _cache[query] = result
    _save_cache_to_disk()


def get_cached(query: str) -> str | None:
    """Get a cached result for a query.
    
    Args:
        query: The input query.
    
    Returns:
        The cached result or None if not found.
    """
    return _cache.get(query)


def clear_cache():
    """Clear all cached results."""
    global _cache
    _cache = {}
    if os.path.exists(_cache_file):
        os.remove(_cache_file)

