import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import dotenv from 'dotenv';
import { initDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { runRouter } from './routes/run.js';
import { githubRouter } from './routes/github.js';

dotenv.config();

// ── Startup secret guard ──────────────────────────────────────────────────────
// Refuse to start if insecure placeholder values are still set.
// All variables are configurable via Railway / .env:
//   AUTH_USERNAME  — login username (default: "admin")
//   AUTH_PASSWORD  — login password (required, min 8 chars)
//   SESSION_SECRET — JWT signing secret (required, min 32 chars)
//   PAT_ENCRYPTION_KEY — GitHub PAT encryption key (required, 64 hex chars)
const INSECURE = {
  PAT_ENCRYPTION_KEY: [
    '0000000000000000000000000000000000000000000000000000000000000000',
    'change-this',
    '',
  ],
  SESSION_SECRET: [
    'change-this-to-a-random-string-at-least-32-chars',
    'change-this',
    '',
  ],
  AUTH_PASSWORD: ['changeme', 'change-this', '', 'password', 'admin', '123', '1234', '12345'],
};

for (const [key, badValues] of Object.entries(INSECURE)) {
  const val = process.env[key] ?? '';
  if (badValues.some((bad) => val === bad || val.startsWith('change-this'))) {
    console.error(`\n[Roland Web] FATAL: ${key} is still set to an insecure placeholder.`);
    console.error(`  Generate a real value:\n`);
    if (key === 'PAT_ENCRYPTION_KEY') {
      console.error(`    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n`);
    } else {
      console.error(`    node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"\n`);
    }
    console.error(`  Then set it in your .env file before starting.\n`);
    process.exit(1);
  }
}

// Skip the guard in test environments where real secrets aren't needed.
if (process.env.NODE_ENV !== 'test') {
  const patKey = process.env.PAT_ENCRYPTION_KEY ?? '';
  if (patKey.length !== 64) {
    console.error(`\n[Roland Web] FATAL: PAT_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes). Got length ${patKey.length}.\n`);
    process.exit(1);
  }
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    console.error(`\n[Roland Web] FATAL: SESSION_SECRET must be at least 32 characters. Got length ${sessionSecret.length}.\n`);
    process.exit(1);
  }
  const authPass = process.env.AUTH_PASSWORD ?? '';
  if (authPass.length < 8) {
    console.error(`\n[Roland Web] FATAL: AUTH_PASSWORD must be at least 8 characters. Got length ${authPass.length}.`);
    console.error(`  Set AUTH_PASSWORD to a strong password in your .env file or Railway variables.\n`);
    process.exit(1);
  }
}

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cursor-Api-Key', 'X-Pm-Model', 'X-Engineer-Model'],
}));
app.use(express.json());
app.use(cookieParser());

// /health is registered first and the server starts listening before any heavy
// async init so Railway's probe succeeds as soon as the process is up.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Listen immediately — Express allows more routes to be added after listen().
createServer(app).listen(port, () => {
  console.log(`> Roland Web starting on port ${port}`);
});

// Heavy async init — happens after the server is already accepting connections.
// Errors are caught so the server stays up (and /health keeps responding) even
// if a single init step fails; fatal errors still exit after a short window.
try {
  const nextApp = next({ dev, dir: process.cwd() });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();
  initDb();

  app.use('/api/auth', authRouter);
  app.use('/api/github', githubRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', runRouter);

  // All other routes → Next.js (registered last so API routes take priority)
  app.all('*', (req, res) => {
    handle(req, res, parse(req.url, true));
  });

  console.log(`> Roland Web ready on port ${port}`);
} catch (err) {
  console.error('[Roland Web] Fatal startup error:', err);
  // Give Railway's healthcheck a moment to record success before the process exits.
  setTimeout(() => process.exit(1), 2000);
}
