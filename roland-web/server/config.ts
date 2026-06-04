import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  version: string;
  nodeEnv: string;
  port: number;
  host: string;
  logDir: string;
  logLevel: LogLevel;
  dataDir: string;
  databasePath: string;
  projectsDir: string;
  rolandStateDir: string;
  authUsername: string;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function readVersion(): string {
  const pkgPath = resolve(process.cwd(), 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function envPath(key: string): string | undefined {
  const val = process.env[key]?.trim();
  return val || undefined;
}

function defaultDataDir(): string {
  const explicit = envPath('DATA_DIR');
  if (explicit) return explicit;
  const dbPath = envPath('DATABASE_PATH');
  if (dbPath) return dirname(dbPath);
  return process.env.NODE_ENV === 'production'
    ? '/var/lib/roland-web'
    : resolve(process.cwd(), 'data');
}

function resolveDataPaths(dataDir: string) {
  return {
    databasePath: envPath('DATABASE_PATH') ?? resolve(dataDir, 'roland-web.db'),
    projectsDir: envPath('PROJECTS_DIR') ?? resolve(dataDir, 'projects'),
    rolandStateDir: envPath('ROLAND_STATE_DIR') ?? resolve(dataDir, 'state'),
  };
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const level = (raw ?? 'info').toLowerCase() as LogLevel;
  return LOG_LEVELS.includes(level) ? level : 'info';
}

/** Load and validate non-secret configuration. Call once at startup. */
export function loadConfig(): AppConfig {
  const dataDir = defaultDataDir();
  const paths = resolveDataPaths(dataDir);

  const logDir = envPath('LOG_DIR') ?? (
    process.env.NODE_ENV === 'production'
      ? '/var/log/roland-web'
      : resolve(process.cwd(), 'logs')
  );

  return {
    version: readVersion(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    logDir,
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    dataDir,
    databasePath: paths.databasePath,
    projectsDir: paths.projectsDir,
    rolandStateDir: paths.rolandStateDir,
    authUsername: process.env.AUTH_USERNAME ?? 'admin',
  };
}

const INSECURE: Record<string, string[]> = {
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

function isInsecurePlaceholder(key: string, val: string): boolean {
  const badValues = INSECURE[key] ?? [];
  return badValues.some((bad) => val === bad || val.startsWith('change-this'));
}

export interface SecretValidationError {
  key: string;
  message: string;
  hint?: string;
}

/** Validate required secrets. Returns errors; empty array means OK. */
export function validateSecrets(): SecretValidationError[] {
  if (process.env.NODE_ENV === 'test') return [];

  const errors: SecretValidationError[] = [];

  for (const key of Object.keys(INSECURE)) {
    const val = process.env[key] ?? '';
    if (isInsecurePlaceholder(key, val)) {
      errors.push({
        key,
        message: `${key} is still set to an insecure placeholder`,
        hint: key === 'PAT_ENCRYPTION_KEY'
          ? 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
          : 'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
      });
    }
  }

  const patKey = process.env.PAT_ENCRYPTION_KEY ?? '';
  if (patKey && patKey.length !== 64) {
    errors.push({
      key: 'PAT_ENCRYPTION_KEY',
      message: `PAT_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes). Got length ${patKey.length}`,
    });
  }

  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (sessionSecret && sessionSecret.length < 32) {
    errors.push({
      key: 'SESSION_SECRET',
      message: `SESSION_SECRET must be at least 32 characters. Got length ${sessionSecret.length}`,
    });
  }

  const authPass = process.env.AUTH_PASSWORD ?? '';
  if (authPass && authPass.length < 8) {
    errors.push({
      key: 'AUTH_PASSWORD',
      message: `AUTH_PASSWORD must be at least 8 characters. Got length ${authPass.length}`,
    });
  }

  return errors;
}

/** Ensure data and log directories exist (creates parents as needed). */
export function ensureRuntimeDirs(config: AppConfig): void {
  for (const dir of [
    config.dataDir,
    config.projectsDir,
    config.rolandStateDir,
    dirname(config.databasePath),
    config.logDir,
  ]) {
    if (!existsSync(dir)) {
      mkdirSyncSafe(dir);
    }
  }
}

function mkdirSyncSafe(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

/** Reset cached config (tests only). */
export function resetConfigForTests(): void {
  _config = null;
}
