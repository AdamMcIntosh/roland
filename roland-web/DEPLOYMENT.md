# Roland Web — Deployment Guide

See [SELF-HOST.md](./SELF-HOST.md) for systemd, Tailscale, logging, and `scripts/update.sh`.

---

## Variables reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AUTH_USERNAME` | no | `admin` | Login username |
| `AUTH_PASSWORD` | **yes** | — | Login password (min 8 chars) |
| `CURSOR_API_KEY` | **yes** | — | Cursor / AI provider API key for agent runs |
| `SESSION_SECRET` | **yes** | — | JWT signing key (min 32 chars) |
| `PAT_ENCRYPTION_KEY` | **yes** | — | GitHub PAT encryption key (64 hex chars = 32 bytes) |
| `DATABASE_PATH` | no | `./roland-web.db` (dev) / `$DATA_DIR/roland-web.db` (prod) | SQLite database file path |
| `DATA_DIR` | no | `./data` (dev) / `/var/lib/roland-web` (prod) | Base directory for DB, projects, state |
| `PROJECTS_DIR` | no | `$DATA_DIR/projects` | Directory where Roland clones and manages repos |
| `ROLAND_STATE_DIR` | no | `$DATA_DIR/state` | Per-project Roland run state |
| `LOG_DIR` | no | `./logs` (dev) / `/var/log/roland-web` (prod) | Access and error log files |
| `LOG_LEVEL` | no | `info` | Minimum log level: debug, info, warn, error |
| `HOST` | no | `0.0.0.0` | HTTP bind address |
| `PORT` | no | `3000` | HTTP port the server listens on |
| `NODE_ENV` | no | `development` | Node environment |

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

## Local development (plain Node.js)

### 1. Build the Roland core

```sh
# from repo root
npm ci
npm run build
```

### 2. Set up the web app

```sh
cd roland-web
node scripts/setup-core.mjs   # syncs compiled Roland core into @roland-core/
npm ci
```

### 3. Configure environment

```sh
cp .env.example .env
# Edit .env — fill in AUTH_PASSWORD, CURSOR_API_KEY,
# SESSION_SECRET, and PAT_ENCRYPTION_KEY with real values.
```

### 4. Run in dev mode

```sh
npm run dev    # tsx watch — no build step needed, reloads on change
```

Or run the production build locally:

```sh
npm run build
npm start      # node --experimental-sqlite dist/server/index.js
```

`server/index.ts` calls `dotenv.config()` at startup, so any `.env` file in
`roland-web/` is loaded automatically — no extra tooling required.

---

## Railway deployment (native Node.js)

Railway builds and runs the app directly with Node.js using **Railpack**
(Railway's current default builder) — no Docker required.

### Build pipeline

`railway.json` sets `buildCommand` to a single `npm run build:railway`.
That script (`scripts/build-railway.mjs`) orchestrates the full pipeline using
explicit Node.js `cwd` options — no shell `cd` required:

1. `npm ci && npm run build` — compile Roland core TypeScript → `dist/` (repo root)
2. `node scripts/setup-core.mjs` — sync `dist/` + `agents/` + `recipes/` into `@roland-core/`
3. `npm ci` — reinstall roland-web deps so the `roland` binary resolves correctly
4. `npm run build` — `next build` + `tsc -p tsconfig.server.json`

The start command is `npm start` (`node --experimental-sqlite dist/server/index.js`).

Railpack detects the Node.js project automatically and runs its own install
phase before `buildCommand`. The explicit `npm ci` in step 3 above is
intentional — it reinstalls after `@roland-core/dist/` is populated so the
`roland` binary at `@roland-core/dist/index.js` resolves correctly at runtime.

### Setup checklist

1. **Root directory** (Railway dashboard → Settings → Build):
   - Root Directory: `roland-web`

2. **Volume** (Railway dashboard → Volumes tab):
   - Mount Path: `/data`
   - Set `DATABASE_PATH=/data/roland-web.db` and `PROJECTS_DIR=/data/projects`
     in service variables so the app writes to the persistent volume.

3. **Service variables** (Settings → Variables) — set all required secrets:

   | Variable | Value |
   |---|---|
   | `AUTH_PASSWORD` | Strong password |
   | `CURSOR_API_KEY` | Your Cursor API key |
   | `SESSION_SECRET` | Output of the `randomBytes(48)` command above |
   | `PAT_ENCRYPTION_KEY` | Output of the `randomBytes(32)` command above |
   | `DATABASE_PATH` | `/data/roland-web.db` |
   | `PROJECTS_DIR` | `/data/projects` |
   | `NODE_ENV` | `production` |

   `AUTH_USERNAME` defaults to `admin`; override here if desired.

4. **Deploy** — Railway picks up `roland-web/railway.json` automatically once
   the root directory is set to `roland-web`.

### Variable precedence on Railway

Railway service variables are injected directly into the container environment
before the process starts. There is no `.env` file on Railway — `dotenv.config()`
finds nothing and falls through cleanly, leaving all vars as Railway set them.

```
Railway service variables   ← highest (set in dashboard)
        ↓
NODE_ENV / PORT defaults    ← baked into railway.json deploy defaults
```

### Health check

`GET /health` returns `{"status":"ok"}` with no authentication required.
Railway uses this endpoint (configured in `railway.json`) to determine
when the deployment is healthy.
