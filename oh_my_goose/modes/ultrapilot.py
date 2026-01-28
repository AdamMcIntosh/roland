"""Ultrapilot mode with parallel subagent execution."""

from concurrent.futures import ThreadPoolExecutor
from oh_my_goose.orchestrator import select_model
from oh_my_goose.utils.caching import get_cached, cache_result
from oh_my_goose.utils.cost_tracker import track_cost, get_total_cost
from oh_my_goose.hud import render_status


def stub_subagent(i: int, query: str) -> str:
    """Stub subagent executor.
    
    Args:
        i: Agent index.
        query: The input query.
    
    Returns:
        Subagent result.
    """
    return f"Subagent {i}: part {i} for {query}"


def ultrapilot(query: str, verbose: bool) -> str:
    """Run query in ultrapilot mode with parallel subagents.
    
    Args:
        query: The input query.
        verbose: Whether to print detailed HUD information.
    
    Returns:
        The coordinated result from all subagents.
    """
    cached = get_cached(query)
    if cached:
        if verbose:
            render_status(mode="Ultrapilot", status="Cache hit - No cost added", progress=100, cost=0.0)
        return cached
    
    complexity = "complex"
    model = select_model(complexity)
    
    if verbose:
        render_status(mode="Ultrapilot", status=f"Launching parallel agents with {model}", progress=0.0, cost=0.0)
    
    # Execute 5 subagents in parallel
    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(stub_subagent, i, query) for i in range(5)]
        results = [f.result() for f in futures]
    
    track_cost(0.01 * len(results))
    
    # Coordinator aggregates results
    coordinator_result = f"Coordinated: {' '.join(results)}"
    track_cost(0.01)
    
    cache_result(query, coordinator_result)
    
    if verbose:
        render_status(mode="Ultrapilot", status="Completed", progress=100, cost=get_total_cost())
    
    return coordinator_result
