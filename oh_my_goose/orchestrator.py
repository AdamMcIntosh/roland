"""Config loading and model routing for oh-my-goose."""

from pydantic import BaseModel
import yaml
import os
from functools import lru_cache

try:
    import goose  # Import Goose lib
except ImportError:
    goose = None


class RoutingConfig(BaseModel):
    """Pydantic model for routing configuration."""
    simple: list[str]
    medium: list[str]
    complex: list[str]
    explain: list[str]


class GooseConfig(BaseModel):
    """Pydantic model for Goose configuration."""
    api_keys: dict[str, str]
    mcp_defaults: dict[str, float | int]


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


def load_goose_config() -> GooseConfig:
    """Load Goose configuration from config.yaml.
    
    Returns:
        GooseConfig: The loaded Goose configuration.
    """
    config_path = "config.yaml"
    
    if not os.path.exists(config_path):
        print("config.yaml not found. Using default Goose config.")
        return GooseConfig(
            api_keys={},
            mcp_defaults={"temperature": 0.7, "max_tokens": 2000}
        )
    
    try:
        with open(config_path, "r") as f:
            data = yaml.safe_load(f)
        
        if data is None or "goose" not in data:
            print("Warning: 'goose' section not found in config.yaml")
            return GooseConfig(
                api_keys={},
                mcp_defaults={"temperature": 0.7, "max_tokens": 2000}
            )
        
        return GooseConfig(**data["goose"])
    except Exception as e:
        print(f"Error loading Goose config: {e}. Using defaults.")
        return GooseConfig(
            api_keys={},
            mcp_defaults={"temperature": 0.7, "max_tokens": 2000}
        )


# Initialize Goose globally if available
_goose_config = None
def init_goose():
    """Initialize Goose with configuration from config.yaml."""
    global _goose_config
    if goose is None:
        print("Warning: Goose library not installed. Install with: poetry add goose-ai")
        return
    
    _goose_config = load_goose_config()
    try:
        if _goose_config.api_keys:
            goose.init(api_keys=_goose_config.api_keys)
        else:
            print("Warning: No API keys configured for Goose. Update config.yaml.")
    except Exception as e:
        print(f"Warning: Failed to initialize Goose: {e}")


# Initialize on module import
init_goose()


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


def delegate_mode(mode: str, query: str, verbose: bool, recipe: str = None) -> str:
    """Delegate to the appropriate mode function.
    
    Args:
        mode: The mode name (autopilot, eco, ulw, swarm, pipeline).
        query: The input query.
        verbose: Whether to print detailed HUD information.
        recipe: Optional recipe name for pipeline mode.
    
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
    
    # Pass recipe to pipeline mode if provided
    if mode.lower() == "pipeline" and recipe:
        return mode_func(query, verbose, recipe_name=recipe)
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


def load_agent_with_mcp(name: str) -> dict:
    """Load agent YAML and hook to Goose MCP (if available).
    
    Args:
        name: The agent name (e.g., 'architect', 'researcher').
    
    Returns:
        A dictionary containing the agent configuration with MCP chain if Goose is available.
    """
    from oh_my_goose.skills.registry import get_skill
    
    agent = load_agent(name)
    
    if goose is None:
        print("Warning: Goose not available. Using basic agent config.")
        return agent
    
    try:
        # Hook tools to MCP
        mcp_tools = []
        if "tools" in agent:
            for tool_name in agent.get("tools", []):
                try:
                    skill_func = get_skill(tool_name)
                    # Wrap skill as Goose MCP tool if wrapper available
                    if hasattr(goose, 'mcp') and hasattr(goose.mcp, 'Tool'):
                        mcp_tool = goose.mcp.Tool(name=tool_name, func=skill_func)
                    else:
                        mcp_tool = skill_func
                    mcp_tools.append(mcp_tool)
                except Exception as e:
                    print(f"Warning: Failed to load tool {tool_name}: {e}")
        
        # Create MCP chain if goose.mcp.create_chain is available
        if hasattr(goose, 'mcp') and hasattr(goose.mcp, 'create_chain'):
            role_prompt = agent.get('role_prompt', '')
            model = agent.get('recommended_model', 'claude-4-sonnet')
            temperature = agent.get('temperature', 0.7)
            
            agent['mcp_chain'] = goose.mcp.create_chain(
                prompt=role_prompt,
                tools=mcp_tools,
                model=model,
                temperature=temperature
            )
        else:
            agent['mcp_chain'] = None
    except Exception as e:
        print(f"Warning: Failed to create MCP chain for {name}: {e}")
        agent['mcp_chain'] = None
    
    return agent


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


def load_recipe(name: str) -> dict:
    """Load recipe YAML with validation.
    
    Args:
        name: The recipe name (e.g., '4-agent-pipeline').
    
    Returns:
        A dictionary containing the validated recipe configuration.
    
    Raises:
        ValueError: If the recipe file is not found or has invalid format.
    """
    path = f"recipes/{name}.yaml"
    if not os.path.exists(path):
        raise ValueError(f"Recipe {name} not found")
    with open(path, "r") as f:
        recipe = yaml.safe_load(f)
    # Basic validation
    if 'workflow' not in recipe or 'subagents' not in recipe:
        raise ValueError("Invalid recipe format")
    return recipe
