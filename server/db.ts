// SQLite (встроенный node:sqlite): схема и миграции.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BUILTIN_SCENARIO } from './config.ts';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('builtin', 'pack')),
    pack_json TEXT,
    facts_total INTEGER,
    is_current INTEGER NOT NULL DEFAULT 0,
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_key TEXT NOT NULL UNIQUE,
    scenario_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT,
    score INTEGER,
    grade TEXT,
    messages_count INTEGER NOT NULL DEFAULT 0,
    disclosed_count INTEGER NOT NULL DEFAULT 0,
    attempt_json TEXT NOT NULL
  );
  CREATE INDEX idx_attempts_scenario ON attempts(scenario_id);
  CREATE INDEX idx_attempts_started ON attempts(started_at);
  CREATE INDEX idx_sessions_expires ON sessions(expires_at);
  `,
];

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  seedBuiltin(db);
  return db;
}

function migrate(db: Db) {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function seedBuiltin(db: Db) {
  const exists = db.prepare('SELECT 1 FROM scenarios WHERE id = ?').get(BUILTIN_SCENARIO.id);
  if (exists) return;
  const now = new Date().toISOString();
  const hasCurrent = db.prepare('SELECT 1 FROM scenarios WHERE is_current = 1').get();
  db.prepare('INSERT INTO scenarios (id, title, kind, is_current, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    BUILTIN_SCENARIO.id, BUILTIN_SCENARIO.title, 'builtin', hasCurrent ? 0 : 1, now, now,
  );
}

/** Выполняет действие в транзакции. */
export function transaction<T>(db: Db, action: () => T): T {
  db.exec('BEGIN');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
