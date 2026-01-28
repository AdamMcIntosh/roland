"""Autopilot mode implementation for oh-my-goose."""

from oh_my_goose.orchestrator import select_model
from oh_my_goose.utils.caching import get_cached, cache_result
from oh_my_goose.utils.cost_tracker import track_cost, get_total_cost
from oh_my_goose.hud import render_status


def autopilot(query: str, verbose: bool) -> str:
    """Run query in autopilot mode with lead agent and subagents.
    
    Args:
        query: The input query.
        verbose: Whether to print detailed HUD information.
    
    Returns:
        The orchestrated result from lead and subagents.
    """
    cached = get_cached(query)
    if cached:
        if verbose:
            render_status(mode="Autopilot", status="Cache hit - No cost added", progress=100, cost=0.0)
        return cached
    
    complexity = "medium"
    model = select_model(complexity)
    
    if verbose:
        render_status(mode="Autopilot", status=f"Complexity: {complexity}, Model: {model}", progress=0.0, cost=0.0)
    
    plan = f"Lead agent plan for '{query}' using {model}"
    track_cost(0.01)
    
    if verbose:
        render_status(mode="Autopilot", status="Lead agent executing", progress=33.3, cost=get_total_cost())
    
    sub1 = f"Subagent 1 execute: part1"
    sub2 = f"Subagent 2 execute: part2"
    track_cost(0.01 * 2)
    
    if verbose:
        render_status(mode="Autopilot", status="Completed", progress=100, cost=get_total_cost())
    
    result = f"{plan}\n{sub1}\n{sub2}"
    cache_result(query, result)
    
    return result
