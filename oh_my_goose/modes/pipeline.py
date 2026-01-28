"""Pipeline mode with sequential step-by-step processing."""

from oh_my_goose.orchestrator import select_model
from oh_my_goose.utils.caching import get_cached, cache_result
from oh_my_goose.utils.cost_tracker import track_cost, get_total_cost
from oh_my_goose.hud import render_status


def pipeline(query: str, verbose: bool) -> str:
    """Run query in pipeline mode with sequential processing chain.
    
    Args:
        query: The input query.
        verbose: Whether to print detailed HUD information.
    
    Returns:
        The final result after all pipeline stages.
    """
    cached = get_cached(query)
    if cached:
        if verbose:
            render_status(mode="Pipeline", status="Cache hit - No cost added", progress=100, cost=0.0)
        return cached
    
    complexity = "medium"
    model = select_model(complexity)
    
    if verbose:
        render_status(mode="Pipeline", status=f"Starting chain with {model}", progress=0.0, cost=0.0)
    
    # Define pipeline steps
    steps = ["Plan", "Execute", "Review", "Explain"]
    result = query
    
    # Process through each step sequentially
    for idx, step in enumerate(steps):
        result = f"{step}: {result}"
        track_cost(0.01)
        
        if verbose:
            progress = ((idx + 1) / len(steps)) * 100
            render_status(mode="Pipeline", status=f"Step {step} complete", progress=progress, cost=get_total_cost())
    
    cache_result(query, result)
    
    if verbose:
        render_status(mode="Pipeline", status="Chain complete", progress=100, cost=get_total_cost())
    
    return result
