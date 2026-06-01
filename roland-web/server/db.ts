import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) _db = openDb();
  return _db;
}

export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      path          TEXT NOT NULL,
      github_owner  TEXT,
      github_repo   TEXT,
      encrypted_pat TEXT,
      created_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      goal        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      output      TEXT NOT NULL DEFAULT '',
      branch      TEXT NOT NULL DEFAULT '',
      started_at  INTEGER DEFAULT (unixepoch()),
      finished_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add branch column for DBs created before this column existed
  try { db.exec('ALTER TABLE runs ADD COLUMN branch TEXT NOT NULL DEFAULT ""'); } catch { /* already exists */ }
  // Migration: add pr_url column for storing the auto-created pull request URL
  try { db.exec('ALTER TABLE runs ADD COLUMN pr_url TEXT'); } catch { /* already exists */ }

  // Migration: add ON DELETE CASCADE to existing runs FK
  // (SQLite requires recreating the table to change a FK constraint)
  const schemaRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='runs'")
    .get() as { sql: string } | undefined;
  if (schemaRow && !schemaRow.sql.includes('ON DELETE CASCADE')) {
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE runs_new (
          id          TEXT PRIMARY KEY,
          project_id  TEXT NOT NULL,
          goal        TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'running',
          output      TEXT NOT NULL DEFAULT '',
          branch      TEXT NOT NULL DEFAULT '',
          started_at  INTEGER DEFAULT (unixepoch()),
          finished_at INTEGER,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      db.exec(`
        INSERT INTO runs_new
          SELECT id, project_id, goal, status, output, COALESCE(branch, ''), started_at, finished_at
          FROM runs
      `);
      db.exec('DROP TABLE runs');
      db.exec('ALTER TABLE runs_new RENAME TO runs');
      db.exec('COMMIT');
      console.log('[DB] Migrated runs table → ON DELETE CASCADE');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration failed (runs cascade):', e);
    }
  }
}

function openDb(): DatabaseSync {
  const defaultPath = process.env.NODE_ENV === 'production'
    ? '/data/roland-web.db'
    : resolve(process.cwd(), 'roland-web.db');
  const dbPath = process.env.DATABASE_PATH ?? defaultPath;
  mkdirSync(dirname(dbPath), { recursive: true });
  console.log(`[DB] Opening database: ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  // Enforce FK constraints on every connection (node:sqlite enables them by default,
  // but setting explicitly makes the intent clear and guards against library changes)
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
