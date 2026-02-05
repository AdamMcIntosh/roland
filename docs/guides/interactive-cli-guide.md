# Interactive CLI Guide

## GitHub Copilot-Style Interface

samwise now includes an interactive CLI interface similar to GitHub Copilot CLI.

### Starting the Interactive CLI

```bash
npm run build
npm run samwise
```

### Features

✨ **Beautiful Welcome Screen**
- ASCII art banner
- Connection status
- Budget display
- Current directory and git branch

🎯 **Interactive Prompt**
- Type naturally to execute tasks
- Auto-detect execution mode (eco:, autopilot:, etc.)
- Real-time feedback

💬 **Slash Commands**
- `/help` - Show help menu
- `/status` - Connection and session info
- `/budget` - Budget status with visual bar
- `/skills` - List available skills
- `/agents` - List available agents
- `/cache` - Cache statistics
- `/clear` - Clear screen

📝 **Special Syntax**
- `@file.ts` - Mention files in context
- `eco: your task` - Specify execution mode
- Use Tab for autocomplete (coming soon)

### Example Session

```
 ____    _    __  ____        _____ ____  _____ 
/ ___|  / \  |  \/  \ \      / /_ _/ ___|| ____|
\___ \ / _ \ | |\/| |\ \ /\ / / | |\___ \|  _|  
 ___) / ___ \| |  | | \ V  V /  | | ___) | |___ 
|____/_/   \_\_|  |_|  \_/\_/  |___|____/|_____|


    Samwise can write, test and debug code right from your terminal.
    Describe a task to get started or enter ? for help.

    ● Connected to samwise
    ● Logged in as user: YourName
    ● Budget: $9.50 / $10.00

    ~/projects/samwise [main]

    ─────────────────────────────────────────────────────────────────
    Quick Tips:
      • Use @ to mention files: @file.ts
      • Use / for commands: /help, /status, /budget
      • Prefix with mode: eco: your task
    ─────────────────────────────────────────────────────────────────

    > █
```

### Commands

```bash
# Regular execution
> eco: refactor the auth function

# View budget
> /budget

# Check status
> /status

# Get help
> /help or ?

# Exit
> exit
> quit
> Ctrl+D
```

### Keyboard Shortcuts

- **Ctrl+C** - Interrupt (shows exit hint)
- **Ctrl+D** - Exit CLI
- **Enter** - Execute command
- **↑/↓** - Command history (native readline)

### Integration with Your Code

The interactive CLI is a separate entry point from the traditional CLI. It:

1. Loads the same config
2. Initializes the same agents and skills
3. Uses the same execution engine
4. Tracks the same budget

But provides a more engaging user experience!

### Cost Considerations

Since this is an interactive session:
- Each command counts toward your budget
- Budget is checked before each execution
- Type `/budget` anytime to see remaining funds
- Visual progress bar shows usage percentage

### Comparison

**Old CLI** (`npm run cli`):
```bash
npm run cli
> run "eco: your task"
✓ Done
```

**New Interactive CLI** (`npm run samwise`):
```
> eco: your task

Mode: eco
Skill: Refactoring

✓ Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Output here]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost: $0.0002 | Cached: No | Duration: 1.2s

> █
```

The interactive CLI is perfect for:
- 🔄 Iterative development workflows
- 🎯 Multiple related tasks in one session
- 👀 Real-time feedback and monitoring
- 💰 Budget-conscious testing

Try it now: `npm run samwise`
