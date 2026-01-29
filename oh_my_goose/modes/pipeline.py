"""Pipeline mode with sequential step-by-step processing and recipe chaining."""

import goose  # Import Goose lib; configure providers/APIs as needed
from oh_my_goose.orchestrator import load_recipe, load_agent_with_mcp
from oh_my_goose.utils.caching import get_cached, cache_result
from oh_my_goose.utils.cost_tracker import track_cost, get_total_cost
from oh_my_goose.hud import render_status


def pipeline(query: str, verbose: bool, recipe_name: str = None) -> str:
    """Run pipeline with optional recipe chaining using Goose MCP.
    
    Args:
        query: The input query.
        verbose: Whether to print detailed HUD information.
        recipe_name: Optional recipe name for chaining agents (e.g., '4-agent-pipeline').
    
    Returns:
        The final result after all pipeline stages.
    """
    # Cache check
    cached = get_cached(query)
    if cached:
        render_status("Pipeline", "Cache hit - No cost added", progress=100, cost=0.0)
        return cached
    
    if not recipe_name:
        # Default simple chain (fallback)
        render_status("Pipeline", "Starting default chain", progress=0, cost=0)
        # Stub default steps...
        result = "Default pipeline result"
    else:
        recipe = load_recipe(recipe_name)
        max_loops = recipe.get('options', {}).get('max_loops', 3)
        shared_context = {}  # For outputs between agents
        loop_count = 0
        
        render_status("Pipeline", f"Starting {recipe['name']} with lead {recipe['lead_model']}", progress=0, cost=0)
        
        current_output = query
        steps = recipe['workflow']['steps']
        progress_step = 100 / (len(steps) * (max_loops + 1))  # Approx for loops
        current_progress = 0
        
        i = 0
        while i < len(steps):
            step = steps[i]
            agent_config = next(a for a in recipe['subagents'] if a['name'] == step['agent'])
            
            # Load agent with MCP
            try:
                agent = load_agent_with_mcp(agent_config['name'].lower())
            except Exception as e:
                if verbose:
                    print(f"Warning: Could not load agent {agent_config['name']}: {e}")
                agent = {"mcp_chain": None, "role_prompt": ""}
            
            # Format prompt with context
            prompt = agent_config['prompt'].replace('{{user_task}}', query)
            # Replace agent context variables
            for agent_name in shared_context:
                prompt = prompt.replace(f'@{agent_name}', shared_context.get(agent_name, ''))
            
            # Real Goose MCP call (use mcp_chain if available, else fallback)
            try:
                if goose is not None and agent.get('mcp_chain'):
                    # Use Goose MCP chain if available
                    output = goose.mcp.run(
                        chain=agent['mcp_chain'],
                        input=prompt,
                        provider=agent_config['provider'],
                        model=agent_config['model']
                    )
                elif goose is not None and hasattr(goose, 'run_agent'):
                    # Fallback to direct goose.run_agent if MCP not available
                    output = goose.run_agent(
                        prompt=prompt,
                        model=agent_config['model'],
                        provider=agent_config['provider']
                    )
                else:
                    # Goose not available, use stub
                    output = f"{step['agent']}: Processing {prompt[:50]}..."
            except Exception as e:
                if verbose:
                    print(f"Warning: Goose call failed for {step['agent']}: {e}")
                output = f"{step['agent']}: Stub response (Goose error: {e})"
            
            shared_context[step['agent']] = output
            track_cost(0.01)  # Per agent call
            current_progress += progress_step
            render_status("Pipeline", f"Agent {step['agent']}: Completed", progress=current_progress, cost=0.01)
            
            # Handle loop_if (e.g., if Reviewer flags issues)
            if 'loop_if' in step and "issues found" in output.lower() and loop_count < max_loops:
                loop_count += 1
                render_status("Pipeline", f"Issues found - Looping back (loop {loop_count}/{max_loops})", progress=current_progress, cost=0)
                # Find Executor step and jump back to it
                try:
                    executor_idx = steps.index(next(s for s in steps if s['agent'] == 'Executor'))
                    i = executor_idx
                    continue
                except StopIteration:
                    # No Executor step found, continue normally
                    pass
            
            i += 1
        
        result = shared_context.get('Explainer', shared_context.get(steps[-1]['agent'] if steps else '', 'Final result'))  # Final from Explainer or last agent
    
    cache_result(query, result)
    render_status("Pipeline", "Chain complete", progress=100, cost=get_total_cost())
    return result
