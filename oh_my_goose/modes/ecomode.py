"""Ecomode implementation for oh-my-goose."""

from oh_my_goose.orchestrator import select_model
from oh_my_goose.utils.caching import get_cached, cache_result
from oh_my_goose.utils.cost_tracker import track_cost, get_total_cost
from oh_my_goose.hud import render_status


def classify_complexity(query: str) -> str:
    """Classify query complexity based on length.
    
    Args:
        query: The input query.
    
    Returns:
        Complexity level: 'simple', 'medium', or 'complex'.
    """
    query_len = len(query)
    if query_len < 50:
        return "simple"
    elif query_len < 200:
        return "medium"
    else:
        return "complex"


def ecomode(query: str, verbose: bool) -> str:
    """Run query in ecomode with caching and cost tracking.
    
    Args:
        query: The input query.
        verbose: Whether to print detailed HUD information.
    
    Returns:
        The result of the query.
    """
    cached = get_cached(query)
    if cached:
        if verbose:
            render_status(mode="Ecomode", status="Cache hit - No cost added", progress=100, cost=0.0)
        return cached
    
    complexity = classify_complexity(query)
    model = select_model(complexity)
    
    if verbose:
        render_status(mode="Ecomode", status=f"Complexity: {complexity}, Model: {model}", progress=0.0, cost=0.0)
    
    result = f"Stub result for '{query}' using {model}"
    cache_result(query, result)
    track_cost(0.01)
    
    if verbose:
        render_status(mode="Ecomode", status="Completed", progress=100, cost=get_total_cost())
    
    return result
