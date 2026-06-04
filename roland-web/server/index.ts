import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { runRouter } from './routes/run.js';
import { githubRouter } from './routes/github.js';
import { loadConfig, validateSecrets, ensureRuntimeDirs, getConfig } from './config.js';
import { logger, accessLogMiddleware } from './logger.js';

// ── Configuration & secrets ───────────────────────────────────────────────────
const config = loadConfig();
ensureRuntimeDirs(config);
logger.init();

const secretErrors = validateSecrets();

if (secretErrors.length > 0) {
  for (const err of secretErrors) {
    logger.error(err.message, { key: err.key, hint: err.hint });
  }
  logger.error('Refusing to start — fix the above in your .env file');
  process.exit(1);
}

logger.info('Starting Roland Web', {
  version: config.version,
  nodeEnv: config.nodeEnv,
  port: config.port,
  host: config.host,
  dataDir: config.dataDir,
  logDir: config.logDir,
});

const dev = config.nodeEnv !== 'production';
const { port, host } = config;

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cursor-Api-Key', 'X-Pm-Model', 'X-Engineer-Model'],
}));
app.use(express.json());
app.use(cookieParser());
app.use(accessLogMiddleware);

// /health is registered first and the server starts listening before any heavy
// async init so probes succeed as soon as the process is up.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: config.version });
});

app.get('/api/version', (_req, res) => {
  res.json({ version: config.version, nodeEnv: config.nodeEnv });
});

const httpServer = createServer(app);
// Long-running /run requests must not be cut off by default Node socket timeouts.
httpServer.timeout = 0;
httpServer.requestTimeout = 0;
httpServer.headersTimeout = 0;

httpServer.listen(port, host, () => {
  logger.info('HTTP server listening', { port, host, socketTimeout: 'disabled' });
});

// Graceful shutdown for systemd
function shutdown(signal: string): void {
  logger.info('Shutdown signal received', { signal });
  httpServer.close(() => {
    logger.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Heavy async init — happens after the server is already accepting connections.
try {
  const nextApp = next({ dev, dir: process.cwd() });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();
  initDb();

  app.use('/api/auth', authRouter);
  app.use('/api/github', githubRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', runRouter);

  app.all('*', (req, res) => {
    handle(req, res, parse(req.url, true));
  });

  logger.info('Roland Web ready', { port, host, version: getConfig().version });
} catch (err) {
  logger.error('Fatal startup error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  setTimeout(() => process.exit(1), 2000);
}
