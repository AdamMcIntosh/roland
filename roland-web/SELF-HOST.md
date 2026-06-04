# Roland Web — Self-Hosting Guide

Run Roland Web on a home server or VPS, reachable over **Tailscale** (recommended) or a private network. No Docker required — a systemd service, structured logs, and a one-command update script.

---

## Quick start

```bash
# On your server (Ubuntu/Debian, Node 22+)
git clone https://github.com/AdamMcIntosh/roland.git /opt/roland/src
cd /opt/roland/src
sudo chmod +x roland-web/scripts/install.sh roland-web/scripts/update.sh
sudo ./roland-web/scripts/install.sh

# Set secrets, then start
sudo nano /opt/roland/roland-web/.env   # AUTH_PASSWORD, CURSOR_API_KEY
sudo systemctl start roland-web
sudo systemctl status roland-web
```

Open `http://<tailscale-ip>:3000` from a device on your tailnet.

---

## Folder structure (self-host layout)

```
/opt/roland/
└── roland-web/                 # Application (WorkingDirectory)
    ├── dist/server/            # Compiled Express + Next handler
    ├── .next/                  # Next.js production build
    ├── @roland-core/           # Bundled Roland CLI
    ├── .env                    # Secrets + paths (chmod 600)
    ├── systemd/
    │   └── roland-web.service  # Unit file template
    ├── deploy/
    │   └── logrotate.conf      # Log rotation config
    └── scripts/
        ├── install.sh          # First-time setup
        └── update.sh           # Pull, rebuild, restart

/var/lib/roland-web/            # Persistent data (DATA_DIR)
├── roland-web.db               # SQLite database
├── projects/                   # Cloned GitHub repos
└── state/                      # Per-project Roland run state

/var/log/roland-web/            # File logs (LOG_DIR)
├── access.log                  # HTTP access (JSON lines)
└── error.log                   # Application errors (JSON lines)
```

Journald also captures stdout/stderr (`journalctl -u roland-web`).

---

## Configuration (`.env`)

Copy from `.env.example`. The install script generates `SESSION_SECRET` and `PAT_ENCRYPTION_KEY` automatically.

| Variable | Required | Default (production) | Purpose |
|---|---|---|---|
| `AUTH_USERNAME` | no | `admin` | Login username |
| `AUTH_PASSWORD` | **yes** | — | Login password (min 8 chars) |
| `CURSOR_API_KEY` | **yes** | — | Cursor API key for agent runs |
| `SESSION_SECRET` | **yes** | — | JWT signing key (min 32 chars) |
| `PAT_ENCRYPTION_KEY` | **yes** | — | GitHub PAT encryption (64 hex chars) |
| `DATA_DIR` | no | `/var/lib/roland-web` | Base path for DB, projects, state |
| `DATABASE_PATH` | no | `$DATA_DIR/roland-web.db` | SQLite file |
| `PROJECTS_DIR` | no | `$DATA_DIR/projects` | Cloned repos |
| `ROLAND_STATE_DIR` | no | `$DATA_DIR/state` | Per-run `.roland` state |
| `LOG_DIR` | no | `/var/log/roland-web` | Access + error log files |
| `LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error` |
| `HOST` | no | `0.0.0.0` | Bind address |
| `PORT` | no | `3000` | HTTP port |
| `NODE_ENV` | no | `production` | Environment |

The server **refuses to start** with placeholder secrets. Validation runs at boot with clear JSON error logs.

Generate secrets manually:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # PAT_ENCRYPTION_KEY
```

---

## Systemd service

Installed to `/etc/systemd/system/roland-web.service` from `systemd/roland-web.service`:

- Starts on boot (`systemctl enable roland-web`)
- Restarts on failure (`Restart=on-failure`, 5 s delay)
- Runs as non-root `roland` user
- Loads env from `/opt/roland/roland-web/.env`
- Graceful shutdown on `SIGTERM` (20 s timeout)

```bash
sudo systemctl start roland-web
sudo systemctl stop roland-web
sudo systemctl restart roland-web
sudo systemctl status roland-web
```

---

## Logging & observability

All application logs are **JSON lines** with `time`, `level`, `msg`, `service`, `version`, and structured fields.

| Destination | Contents |
|---|---|
| `journalctl -u roland-web` | App logs (stdout/stderr) |
| `/var/log/roland-web/access.log` | HTTP requests (method, path, status, duration) |
| `/var/log/roland-web/error.log` | Errors only |

Health and version endpoints (no auth):

```bash
curl http://127.0.0.1:3000/health        # {"status":"ok","version":"1.1.0"}
curl http://127.0.0.1:3000/api/version   # {"version":"1.1.0","nodeEnv":"production"}
```

Log rotation: `/etc/logrotate.d/roland-web` (14 daily rotations, compressed).

---

## Updates

```bash
sudo /opt/roland/roland-web/scripts/update.sh
```

The script:

1. `git pull --ff-only` at repo root
2. Rebuilds Roland core + roland-web
3. Restarts `roland-web.service`
4. Verifies `/health`

Override paths:

```bash
sudo ROLAND_REPO_DIR=/opt/roland/src ROLAND_WEB_DIR=/opt/roland/roland-web ./scripts/update.sh
```

Version is read from `package.json` and exposed via `/health` and `/api/version`.

---

## Tailscale access

1. Install [Tailscale](https://tailscale.com/download) on the server and your clients.
2. Keep `HOST=0.0.0.0` and `PORT=3000` in `.env`.
3. Open `http://100.x.y.z:3000` using the server's Tailscale IP (`tailscale ip -4`).
4. Optional: restrict the port with `ufw allow in on tailscale0 to any port 3000`.

No public internet exposure required — your tailnet is the VPN.

---

## Requirements

- **OS:** Linux with systemd (Ubuntu 22.04+, Debian 12+)
- **Node.js:** 22+ with `--experimental-sqlite` (used in start command)
- **Git** and **tar** (for GitHub clone)
- **rsync** (install/update scripts)
- **Cursor API key** for agent runs

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Service won't start | `journalctl -u roland-web -n 50` — look for secret validation errors |
| 401 on API calls | Set `CURSOR_API_KEY` in `.env` or pass `X-Cursor-Api-Key` header |
| Permission errors | `chown -R roland:roland /var/lib/roland-web /var/log/roland-web` |
| Roland binary missing | `cd roland-web && npm run build:core` |
| Update failed | Ensure repo is clean; `git status` before `update.sh` |

---

## Environment reference

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full variables table and local development setup.
