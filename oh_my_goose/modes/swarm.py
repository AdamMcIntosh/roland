"""Swarm mode with dynamic agent coordination and shared memory."""

from oh_my_goose.orchestrator import select_model
from oh_my_goose.utils.caching import get_cached, cache_result
from oh_my_goose.utils.cost_tracker import track_cost, get_total_cost
from oh_my_goose.hud import render_status


def swarm(query: str, verbose: bool) -> str:
    """Run query in swarm mode with dynamic agent coordination.
    
    Args:
        query: The input query.
        verbose: Whether to print detailed HUD information.
    
    Returns:
        The aggregated result from all swarm agents.
    """
    cached = get_cached(query)
    if cached:
        if verbose:
            render_status(mode="Swarm", status="Cache hit - No cost added", progress=100, cost=0.0)
        return cached
    
    complexity = "complex"
    model = select_model(complexity)
    
    if verbose:
        render_status(mode="Swarm", status=f"Flocking agents with {model}", progress=0.0, cost=0.0)
    
    # Shared memory for coordination
    shared_memory = {}
    num_agents = 8
    results = []
    
    # Each agent processes and updates shared memory
    for i in range(num_agents):
        result = f"Agent {i}: processed '{query}' with memory {shared_memory}"
        shared_memory[i] = result
        results.append(result)
        track_cost(0.01)
        
        if verbose and i % 2 == 0:
            progress = ((i + 1) / num_agents) * 100
            render_status(mode="Swarm", status=f"Agent {i} complete", progress=progress, cost=get_total_cost())
    
    # Aggregate final result
    final_result = "Swarm result: " + " | ".join(results)
    cache_result(query, final_result)
    
    if verbose:
        render_status(mode="Swarm", status="Coordination complete", progress=100, cost=get_total_cost())
    
    return final_result
