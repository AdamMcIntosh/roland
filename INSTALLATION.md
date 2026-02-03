# Installation Guide - samwise

Complete installation and setup guide for samwise standalone CLI.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Getting API Keys](#getting-your-api-keys)
4. [Testing Installation](#testing-your-installation)
5. [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Operating System**: Windows, macOS, or Linux
- **API Keys**: At least one AI provider API key (xAI, Anthropic, OpenAI, or Google)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/samwise.git
cd samwise
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- TypeScript compiler and type definitions
- Commander.js for CLI
- Chalk for colored output
- Ora for loading spinners
- Zod for validation
- @modelcontextprotocol/sdk for MCP integration

### 3. Configure API Keys

Create a `.env` file in the project root:

```bash
# Create .env file
touch .env  # On Windows: New-Item .env -ItemType File
```

Add your API keys:

```bash
# xAI (recommended for Ecomode - cheapest models)
SAMWISE_API_KEYS_XAI=your_xai_api_key_here

# Anthropic (Claude models)
SAMWISE_API_KEYS_ANTHROPIC=your_anthropic_api_key_here

# OpenAI (GPT models)
SAMWISE_API_KEYS_OPENAI=your_openai_api_key_here

# Google (Gemini models)
SAMWISE_API_KEYS_GOOGLE=your_google_api_key_here
```

**Note**: For Ecomode MVP, only **xAI API key** is required as it provides the cheapest models (grok-code-fast-1 and grok-4-1-fast-reasoning).

### 4. Build the Project

```bash
npm run build
```

This compiles TypeScript source files from `src/` to JavaScript in `dist/`.

Expected output:
```
> samwise@1.0.0 build
> tsc

(no errors)
```

### 5. Verify Installation

```bash
# Check that CLI runs
npm run cli

# You should see the CLI prompt
samwise>
```

Type `help` to see available commands.

## Getting Your API Keys

### xAI (Grok - Recommended for Ecomode)

1. Visit [https://x.ai](https://x.ai)
2. Sign up for an account
3. Navigate to API section
4. Generate a new API key
5. Copy the key to your `.env` file

**Cost**: Grok models are among the cheapest available:
- grok-code-fast-1: ~$0.0001 per query
- grok-4-1-fast-reasoning: ~$0.0002 per query

### Anthropic (Claude)

1. Visit [https://console.anthropic.com](https://console.anthropic.com)
2. Sign up for an account
3. Go to API Keys section
4. Create a new API key
5. Copy the key to your `.env` file

### OpenAI (GPT)

1. Visit [https://platform.openai.com](https://platform.openai.com)
2. Sign up for an account
3. Navigate to API Keys
4. Create a new secret key
5. Copy the key to your `.env` file

### Google (Gemini)

1. Visit [https://ai.google.dev](https://ai.google.dev)
2. Sign up for an account
3. Get an API key
4. Copy the key to your `.env` file

## Configuration

### config.yaml

The project includes a `config.yaml` file for model routing configuration. Default settings work out-of-the-box, but you can customize:

```yaml
routing:
  simple:
    - grok-code-fast-1      # Cheapest for simple tasks
    - gemini-2.5-flash
    - gpt-4o-mini
  medium:
    - grok-4-1-fast-reasoning      # Cheapest for medium tasks
    - claude-4-sonnet
    - gpt-4o
  complex:
    - claude-4.5-sonnet  # Best for complex tasks
    - gpt-4o
    - grok-4.1-full
  explain:
    - grok-4-1-fast-reasoning      # Good for explanations

cache:
  enabled: true
  ttl: 3600              # Cache TTL in seconds (1 hour)
  directory: ".cache"    # Cache storage directory
```

### Environment Variables

All API keys can be configured via environment variables:

```bash
# Provider API keys
SAMWISE_API_KEYS_XAI=...
SAMWISE_API_KEYS_ANTHROPIC=...
SAMWISE_API_KEYS_OPENAI=...
SAMWISE_API_KEYS_GOOGLE=...

# Optional: Override config file location
OMG_CONFIG_PATH=/path/to/config.yaml
```

## Testing Your Installation

### 1. Run a Simple Query

```bash
npm run cli

# At the prompt
> run "eco: add a comment to this line: const x = 5"
```

You should see:
- Model selection (grok-code-fast-1 for simple tasks)
- Cost estimate (~$0.0001)
- Result output
- Duration and caching status

### 2. Check Session Statistics

```bash
> stats
```

You should see:
- Total queries: 1
- Cache hits: 0
- Total cost: ~$0.0001
- Models used: grok-code-fast-1

### 3. List Available Skills

```bash
> skills
```

You should see 3 core skills:
- RefactoringSkill
- DocumentationSkill
- TestingSkill

### 4. List Available Agents

```bash
> agents
```

You should see 10 loaded agents:
- architect, researcher, designer, writer, vision
- critic, analyst, executor, planner, qa-tester

## Troubleshooting

### Error: "Missing API key for xAI provider"

**Solution**: Ensure you have set `SAMWISE_API_KEYS_XAI` in your `.env` file.

```bash
# Check if .env exists
cat .env  # or: Get-Content .env on Windows

# Add the key if missing
echo "SAMWISE_API_KEYS_XAI=your_key_here" >> .env
```

### Error: "Cannot find module 'dist/cli/cli-main.js'"

**Solution**: Build the project first.

```bash
npm run build
```

### Error: "Config file not found"

**Solution**: Ensure `config.yaml` exists in the project root.

```bash
# Check if config.yaml exists
ls config.yaml  # or: Test-Path config.yaml on Windows

# If missing, the project should include a default one
# Restore from git:
git checkout config.yaml
```

### TypeScript Compilation Errors

**Solution**: Ensure you're using Node.js v18+ and TypeScript is installed.

```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Cache Not Working

**Solution**: Check that the `.cache` directory is writable.

```bash
# Create cache directory if missing
mkdir .cache  # or: New-Item -ItemType Directory .cache on Windows

# Check permissions
ls -la .cache  # Ensure it's writable
```

### Slow Response Times

**Solution**: This is usually due to API latency, not the tool.

- Check your internet connection
- Verify API provider status
- Use `--verbose` flag to see detailed execution logs

```bash
> run --verbose "eco: your query"
```

## Running Tests

```bash
# Install dev dependencies (if not already installed)
npm install

# Run the full test suite
npm test
```

Expected output:
```
Test Files  1 passed (1)
     Tests  40+ passed (40+)
```

## Development Setup

If you want to contribute or modify the code:

```bash
# Run in watch mode (auto-rebuild on changes)
npm run dev

# Run linting
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

## Next Steps

After successful installation:

1. **Read the usage guide**: [EXAMPLE_USAGE.md](EXAMPLE_USAGE.md)
2. **Try example scripts**: Check the `examples/` directory
3. **Explore skills**: See what each skill can do with `skills` command
4. **Monitor costs**: Use `stats` command to track your spending

## Uninstallation

To remove samwise:

```bash
# Navigate to project directory
cd samwise

# Remove dependencies
rm -rf node_modules

# Remove cache (optional)
rm -rf .cache

# Remove the entire project (optional)
cd ..
rm -rf samwise
```

## Support

If you encounter issues during installation:

1. Check this troubleshooting guide
2. Review [EXAMPLE_USAGE.md](EXAMPLE_USAGE.md) for usage patterns
3. Open an issue on GitHub with:
   - Your Node.js version (`node --version`)
   - Your npm version (`npm --version`)
   - Error messages and logs
   - Steps to reproduce

---

**Installation Complete!** 🎉

Start using samwise with:
```bash
npm run cli
```
