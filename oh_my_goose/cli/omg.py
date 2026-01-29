"""Main CLI entrypoint for oh-my-goose."""

import click
import yaml
import os
from oh_my_goose.orchestrator import delegate_mode, execute_skill, load_agent


DEFAULT_CONFIG = {
    "routing": {
        "simple": ["grok-4.1-fast", "gemini-2.5-flash", "gpt-4o-mini"],
        "medium": ["claude-4-sonnet", "gpt-4o", "gemini-2.5-pro"],
        "complex": ["claude-4.5-sonnet", "gpt-4o", "grok-4.1-full"],
        "explain": ["grok-4.1-fast"]
    },
    "goose": {
        "api_keys": {
            "anthropic": "YOUR_ANTHROPIC_KEY",
            "openai": "YOUR_OPENAI_KEY",
            "google": "YOUR_GOOGLE_KEY",
            "xai": "YOUR_XAI_KEY",
        },
        "mcp_defaults": {
            "temperature": 0.7,
            "max_tokens": 2000,
        }
    }
}


@click.group()
def omg():
    """oh-my-goose CLI: Orchestration for Goose."""
    pass


def main():
    """Entry point for the CLI."""
    omg()


@omg.command()
def setup():
    """One-time setup: Create config.yaml with defaults."""
    config_path = "config.yaml"
    if os.path.exists(config_path):
        click.echo("config.yaml already exists.")
        return
    
    with open(config_path, "w") as f:
        yaml.dump(DEFAULT_CONFIG, f, default_flow_style=False)
    
    click.echo(f"Created {config_path} with default configuration.")


@omg.command()
@click.argument("query")
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose output.")
@click.option("--recipe", default=None, help="Recipe YAML name (e.g., 4-agent-pipeline)")
def run(query, verbose, recipe):
    """Run a query with magic keyword detection."""
    modes_keywords = {
        "autopilot:": "autopilot",
        "eco:": "eco",
        "ulw:": "ulw",
        "swarm:": "swarm",
        "pipeline:": "pipeline",
        "ralph:": "ralph",
    }
    
    mode_str = "autopilot"
    query_lower = query.lower()
    for keyword, m in modes_keywords.items():
        if query_lower.startswith(keyword):
            query = query[len(keyword):].strip()
            mode_str = m
            break
    
    result = delegate_mode(mode_str, query, verbose, recipe=recipe)
    print(result)


@omg.command()
@click.argument("skill_name")
def skill(skill_name):
    """Execute a skill by name."""
    try:
        result = execute_skill(skill_name)
        click.echo(f"Skill '{skill_name}' result: {result}")
    except Exception as e:
        click.echo(f"Error executing skill '{skill_name}': {e}", err=True)


@omg.command()
@click.argument("agent_name")
def agent(agent_name):
    """Load and display agent configuration."""
    try:
        agent_config = load_agent(agent_name)
        click.echo(f"Agent: {agent_name}")
        click.echo(f"Role: {agent_config.get('role_prompt', 'N/A')}")
        click.echo(f"Model: {agent_config.get('recommended_model', 'N/A')}")
        click.echo(f"Tools: {', '.join(agent_config.get('tools', []))}")
    except Exception as e:
        click.echo(f"Error loading agent '{agent_name}': {e}", err=True)


if __name__ == "__main__":
    omg()
