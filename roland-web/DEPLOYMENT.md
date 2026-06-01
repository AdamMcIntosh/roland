# Roland Web — Deployment Guide

## Variables reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AUTH_USERNAME` | no | `admin` | Login username |
| `AUTH_PASSWORD` | **yes** | — | Login password (min 8 chars) |
| `CURSOR_API_KEY` | **yes** | — | Cursor / AI provider API key for agent runs |
| `SESSION_SECRET` | **yes** | — | JWT signing key (min 32 chars) |
| `PAT_ENCRYPTION_KEY` | **yes** | — | GitHub PAT encryption key (64 hex chars = 32 bytes) |
| `DATABASE_PATH` | no | `/data/roland-web.db` | SQLite database file path |
| `PROJECTS_DIR` | no | `/data/projects` | Directory where Roland clones and manages repos |
| `PORT` | no | `3000` | HTTP port the server listens on |
| `NODE_ENV` | no | `production` | Node environment |

Generate the required secrets:

```sh
# SESSION_SECRET (48 random bytes → base64url)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# PAT_ENCRYPTION_KEY (32 random bytes → hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server will **refuse to start** if `AUTH_PASSWORD`, `SESSION_SECRET`, or `PAT_ENCRYPTION_KEY`
are missing, too short, or still set to the placeholder values from `.env.example`.

---

## Local Docker development

### 1. Create your `.env`

```sh
cp roland-web/.env.example roland-web/.env
# Edit roland-web/.env — fill in AUTH_PASSWORD, CURSOR_API_KEY,
# SESSION_SECRET, and PAT_ENCRYPTION_KEY with real values.
```

### 2. Build the image (build context = repo root)

```sh
docker build -f roland-web/Dockerfile -t roland-web .
```

### 3. Run with `.env` mounted

```sh
docker run --rm -p 3000:3000 \
  -v "$(pwd)/roland-web/.env:/app/.env:ro" \
  -v roland-web-data:/data \
  roland-web
```

The container entrypoint (`docker-entrypoint.sh`) detects `/app/.env` and
sources it before starting the server. Variables already present in the
container environment (from `docker run -e` or the image `ENV` defaults)
are overridden by the `.env` file when both are supplied.

### 4. docker compose (recommended for local dev)

```yaml
# docker-compose.yml (place alongside roland-web/)
services:
  roland-web:
    build:
      context: .
      dockerfile: roland-web/Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - ./roland-web/.env      # sourced by docker compose before container start
    volumes:
      - roland-web-data:/data

volumes:
  roland-web-data:
```

```sh
docker compose up --build
```

With `env_file:`, docker compose injects the variables directly into the
container environment — the entrypoint skips the `/app/.env` source block
because the file is not mounted. Both approaches work; `env_file:` is
slightly cleaner (no file mount, no shell sourcing).

---

## Railway deployment

Railway injects service variables directly into the container environment
before the process starts. There is no `.env` file in the production image
(it is excluded by `.dockerignore`), so the entrypoint skips the source
block and the server uses the Railway-injected values.

### Setup checklist

1. **Build settings** (Settings → Build):
   - Build Context: `/`
   - Dockerfile Path: `roland-web/Dockerfile`

2. **Volume** (Railway dashboard → Volumes tab):
   - Mount Path: `/data`

3. **Service variables** (Settings → Variables) — set all required secrets:

   | Variable | Value |
   |---|---|
   | `AUTH_PASSWORD` | Strong password |
   | `CURSOR_API_KEY` | Your Cursor API key |
   | `SESSION_SECRET` | Output of the `randomBytes(48)` command above |
   | `PAT_ENCRYPTION_KEY` | Output of the `randomBytes(32)` command above |
   | `DATABASE_PATH` | `/data/roland-web.db` |
   | `PROJECTS_DIR` | `/data/projects` (default, can omit) |

   `AUTH_USERNAME` defaults to `admin`; override here if desired.

4. **Deploy** — Railway picks up the `railway.json` at repo root automatically.

### Variable precedence on Railway

```
Railway service variables   ← highest (set in dashboard)
        ↓ override
Image ENV defaults          ← baked into Dockerfile (PORT, AUTH_USERNAME, paths)
```

No `.env` file is ever present in the Railway container, so there is no
third tier to reason about.
