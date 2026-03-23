# Roland Beta Program

Thank you for testing Roland before general availability. Roland is an MCP server that pairs with Goose to create a full autonomous coding agent with smart model routing, budget control, and multi-agent recipe workflows.

## How to join

1. **Install Roland** — follow the [installation guide](../INSTALLATION.md).
2. **Run it on a real project** — use it for actual coding tasks, not just hello-world.
3. **Share feedback**:
   - **GitHub Issues**: [Bug report](https://github.com/AdamMcIntosh/roland/issues/new?template=bug_report.md) | [Feature request](https://github.com/AdamMcIntosh/roland/issues/new?template=feature_request.md)
   - **GitHub Discussions**: Use the **Beta feedback** category (see [GitHub Discussions setup](github-discussions-setup.md))
   - **Discord** (optional): *[Link TBD — add your Discord server invite when ready]*
4. **Opt-in telemetry** (optional): set `ROLAND_TELEMETRY=1` in your environment to send anonymous error reports via Sentry. Unset at any time to opt out.

## What we're looking for

- **Goose integration issues** — tool call failures, session continuity problems, model routing errors
- **Recipe runner issues** — steps failing, loop/retry not working, wrong model selected
- **Permission policy edge cases** — supervised mode approving/denying incorrectly
- **Screenshot analysis** — vision model returning wrong results or failing to capture
- **Git tool failures** — `git_commit`, `git_diff` errors on specific repo states
- **Cost tracking accuracy** — budget not degrading at the right threshold
- **Documentation gaps** — unclear setup steps, missing examples, wrong commands
- **Performance** — slow session startup, excessive token usage, memory issues

## What you get

- Early access to new builds and features
- Your feedback directly shapes the roadmap (see [ROADMAP.md](../ROADMAP.md))
- Credit in release notes (if you're comfortable being named)

## Useful commands for testing

```bash
# Verify the build
npm run build

# Test Goose integration
goose session  # then: Use the health_check tool

# Test recipe runner (dry run — no Goose required)
npx tsx scripts/run-recipe.ts --recipe BugFix --task "test" --dry-run

# Test git tools (in any git repo)
# In a Goose session: Use git_status, git_diff, git_log

# Test screenshot analysis
# In a Goose session: Use analyze_screenshot with prompt "What's on screen?"

# Check budget tracking
# In a Goose session: Use manage_budget with action "get_status"
```

## Contact

- Open an issue or discussion at [github.com/AdamMcIntosh/roland](https://github.com/AdamMcIntosh/roland)
- For private or sensitive feedback, use GitHub's contact option for the repo maintainer

Thank you for helping make Roland better.
