"""HUD (Heads-Up Display) for oh-my-goose."""

from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress

console = Console()


def render_status(mode: str, status: str, progress: float = 0.0, cost: float = 0.0):
    """Render a status panel for the given mode.
    
    Args:
        mode: The mode name (e.g., "Autopilot", "Ecomode").
        status: Current status message.
        progress: Progress percentage (0-100).
        cost: Current cost in dollars.
    """
    content = f"[bold]{mode.upper()}[/bold]\nStatus: {status}\nProgress: {progress:.1f}%\nCost: ${cost:.2f}"
    border_style = "green" if progress == 100 else "yellow"
    panel = Panel(content, expand=False, border_style=border_style)
    console.print(panel)
    
    if progress < 100 and progress > 0:
        with Progress() as prog:
            task = prog.add_task("Processing...", total=100)
            prog.update(task, completed=progress)
