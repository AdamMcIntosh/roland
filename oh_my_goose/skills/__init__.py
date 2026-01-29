"""Registry for reusable skills. Extend with Goose hooks."""

try:
    import goose  # Import Goose lib
except ImportError:
    goose = None

_skills: dict[str, callable] = {}


def register_skill(name: str, func: callable) -> None:
    """Register a skill function as a Goose MCP tool if available.
    
    Args:
        name: The skill name.
        func: The callable skill function.
    """
    # Wrap as Goose MCP tool if available
    if goose is not None and hasattr(goose, 'mcp') and hasattr(goose.mcp, 'Tool'):
        try:
            mcp_tool = goose.mcp.Tool(name=name, func=func)
            _skills[name] = mcp_tool
        except Exception:
            # Fall back to raw function if wrapping fails
            _skills[name] = func
    else:
        # Use raw function if Goose MCP not available
        _skills[name] = func


def get_skill(name: str) -> callable:
    """Get a skill function (or Goose MCP Tool) by name.
    
    Args:
        name: The skill name.
    
    Returns:
        The skill function or Goose MCP Tool, or a default "not found" function.
    """
    return _skills.get(name, lambda: "Skill not found")


def auth():
    """Implement authentication."""
    return "Implement authentication"


def database():
    """Handle database operations."""
    return "Handle database operations"


def testing():
    """Run tests."""
    return "Run tests"


def deployment():
    """Deploy application."""
    return "Deploy application"


def refactoring():
    """Refactor code."""
    return "Refactor code"


def migration():
    """Migrate data."""
    return "Migrate data"


def security_scan():
    """Scan for security issues."""
    return "Scan for security issues"


def git_flow():
    """Manage git workflow."""
    return "Manage git workflow"


def documentation():
    """Generate documentation."""
    return "Generate docs"


def visual_review():
    """Review visuals."""
    return "Review visuals"


# Register all skills as Goose MCP tools
register_skill("auth", auth)
register_skill("database", database)
register_skill("testing", testing)
register_skill("deployment", deployment)
register_skill("refactoring", refactoring)
register_skill("migration", migration)
register_skill("security_scan", security_scan)
register_skill("git_flow", git_flow)
register_skill("documentation", documentation)
register_skill("visual_review", visual_review)
