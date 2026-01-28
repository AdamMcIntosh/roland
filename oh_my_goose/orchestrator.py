"""Config loading and model routing for oh-my-goose."""

from pydantic import BaseModel
import yaml
import os
from functools import lru_cache


class RoutingConfig(BaseModel):
    """Pydantic model for routing configuration."""
    simple: list[str]
    medium: list[str]
    complex: list[str]
    explain: list[str]


DEFAULT_ROUTING = {
    "simple": ["grok-4.1-fast", "gemini-2.5-flash", "gpt-4o-mini"],
    "medium": ["claude-4-sonnet", "gpt-4o", "gemini-2.5-pro"],
    "complex": ["claude-4.5-sonnet", "gpt-4o", "grok-4.1-full"],
    "explain": ["grok-4.1-fast"]
}


@lru_cache(maxsize=128)
def load_config() -> RoutingConfig:
    """Load routing config from config.yaml or use defaults.
    
    Returns:
        RoutingConfig: The loaded or default routing configuration.
    """
    config_path = "config.yaml"
    
    if not os.path.exists(config_path):
        print("config.yaml not found. Using defaults.")
        return RoutingConfig(**DEFAULT_ROUTING)
    
    try:
        with open(config_path, "r") as f:
            data = yaml.safe_load(f)
        
        if data is None or "routing" not in data:
            print("Error loading config: Missing 'routing' key. Using defaults.")
            return RoutingConfig(**DEFAULT_ROUTING)
        
        return RoutingConfig(**data["routing"])
    except Exception as e:
        print(f"Error loading config: {e}. Using defaults.")
        return RoutingConfig(**DEFAULT_ROUTING)


@lru_cache(maxsize=32)
def select_model(complexity: str) -> str:
    """Select a model based on complexity level.
    
    Args:
        complexity: The complexity level (simple, medium, complex, explain).
    
    Returns:
        str: The first model from the routing list for the given complexity.
    
    Raises:
        ValueError: If no models are defined for the complexity level.
    """
    config = load_config()
    routing = {
        "simple": config.simple,
        "medium": config.medium,
        "complex": config.complex,
        "explain": config.explain,
    }
    
    complexity_lower = complexity.lower()
    models = routing.get(complexity_lower, routing["simple"])
    
    if not models:
        raise ValueError(f"No models defined for complexity: {complexity}")
    
    return models[0]


def delegate_mode(mode: str, query: str, verbose: bool) -> str:
    """Delegate to the appropriate mode function.
    
    Args:
        mode: The mode name (autopilot, eco, ulw, swarm, pipeline).
        query: The input query.
        verbose: Whether to print detailed HUD information.
    
    Returns:
        The result from the selected mode function.
    """
    from oh_my_goose.modes.autopilot import autopilot
    from oh_my_goose.modes.ecomode import ecomode
    from oh_my_goose.modes.ultrapilot import ultrapilot
    from oh_my_goose.modes.swarm import swarm
    from oh_my_goose.modes.pipeline import pipeline
    
    def ralph(query: str, verbose: bool) -> str:
        """Ralph-style persistence loop mode."""
        from oh_my_goose.utils.persistence import ralph_loop
        
        watch_dir = query if query else "."
        print(f"HUD: Ralph loop watching '{watch_dir}' for changes...")
        
        def callback(path):
            if verbose:
                print(f"HUD: File changed: {path}")
            else:
                print(f"File changed: {path}")
        
        try:
            ralph_loop(watch_dir, callback)
        except Exception as e:
            print(f"HUD: Ralph loop error: {e}")
            return f"Ralph loop stopped with error: {e}"
        
        return "Ralph loop completed."
    
    modes_dict = {
        "autopilot": autopilot,
        "eco": ecomode,
        "ulw": ultrapilot,
        "swarm": swarm,
        "pipeline": pipeline,
        "ralph": ralph,
    }
    
    mode_func = modes_dict.get(mode.lower(), autopilot)
    return mode_func(query, verbose)


def load_agent(name: str) -> dict:
    """Load an agent configuration from YAML and initialize skills.
    
    Args:
        name: The agent name (e.g., 'architect', 'researcher').
    
    Returns:
        A dictionary containing the agent configuration with initialized skills.
    """
    from oh_my_goose.skills.registry import get_skill
    
    with open(f"agents/{name}.yaml", "r") as f:
        agent_config = yaml.safe_load(f)
    
    # Initialize skills for the agent if tools are defined
    if "tools" in agent_config:
        agent_config["initialized_skills"] = {}
        for tool in agent_config["tools"]:
            try:
                agent_config["initialized_skills"][tool] = get_skill(tool)
            except Exception:
                agent_config["initialized_skills"][tool] = None
    
    return agent_config


def execute_skill(skill_name: str) -> str:
    """Execute a skill by name.
    
    Args:
        skill_name: The name of the skill to execute.
    
    Returns:
        The result from the skill function.
    """
    from oh_my_goose.skills.registry import get_skill
    
    skill_func = get_skill(skill_name)
    return skill_func()
