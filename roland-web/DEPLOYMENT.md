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

## Production self-host

For systemd, Tailscale, logging, and updates see [SELF-HOST.md](./SELF-HOST.md).

Build pipeline (`scripts/install.sh` / `scripts/update.sh`):

1. `npm ci && npm run build` — compile Roland core TypeScript → `dist/` (repo root)
2. `npm run build:core` — sync `dist/` + `agents/` + `recipes/` into `@roland-core/`
3. `npm run build` — `next build` + `tsc -p tsconfig.server.json`

Start command: `npm start` (`node --experimental-sqlite dist/server/index.js`).

### Health check

`GET /health` returns `{"status":"ok","version":"…"}` with no authentication required.
It is registered before any heavy async init so probes succeed as soon as the process is up.

```sh
curl -sf http://127.0.0.1:3000/health
```

`scripts/update.sh` runs this check after restarting the systemd service.
