// SQLite (встроенный node:sqlite): схема и миграции.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BUILTIN_SCENARIO } from './config.ts';
import { backfillFeedback } from './feedback.ts';
import { backfillResumeCodes } from './resume.ts';
import { backfillStudents } from './students.ts';

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
  // 2: обратная связь студентов (лайки и дизлайки на ответы заказчика).
  `
  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    message_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('like', 'dislike')),
    reason TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL,
    question TEXT NOT NULL DEFAULT '',
    answer TEXT NOT NULL DEFAULT '',
    intent_id TEXT,
    topic TEXT,
    UNIQUE (attempt_id, message_id)
  );
  CREATE INDEX idx_feedback_scenario ON feedback(scenario_id, rating);
  CREATE INDEX idx_feedback_at ON feedback(at);
  `,
  // 3: личный код попытки (русские слова) и номер версии: защита от затирания с двух устройств.
  `
  ALTER TABLE attempts ADD COLUMN resume_code TEXT;
  ALTER TABLE attempts ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX idx_attempts_resume_code ON attempts(resume_code);
  `,
  // 4: аккаунты студентов (ФИО, группа, личный код), их сессии и привязка попыток к студенту.
  // Поиск и сравнение идут по готовым ключам (регистр и «ё» не важны), потому что SQLite lower() не знает кириллицы.
  `
  CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '',
    group_key TEXT NOT NULL DEFAULT '',
    identity_key TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE INDEX idx_students_group ON students(group_key);
  CREATE TABLE student_sessions (
    token_hash TEXT PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_student_sessions_expires ON student_sessions(expires_at);
  ALTER TABLE attempts ADD COLUMN student_id INTEGER REFERENCES students(id) ON DELETE SET NULL;
  CREATE INDEX idx_attempts_student ON attempts(student_id);
  `,
  // 5: сценарии — это варианты. variant — номер варианта (по порядку создания), published — выложен ли он студентам.
  // Раньше студентам показывался один «текущий» сценарий: он остаётся выложенным, остальные нужно выложить вручную.
  `
  ALTER TABLE scenarios ADD COLUMN variant INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE scenarios ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
  UPDATE scenarios SET published = is_current;
  UPDATE scenarios SET variant = (
    SELECT COUNT(*) FROM scenarios s2 WHERE s2.created_at < scenarios.created_at OR (s2.created_at = scenarios.created_at AND s2.id <= scenarios.id)
  );
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
      if (version === 1) backfillFeedback(db);
      if (version === 2) backfillResumeCodes(db);
      if (version === 3) backfillStudents(db);
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
  const variant = (db.prepare('SELECT COALESCE(MAX(variant), 0) + 1 AS n FROM scenarios').get() as { n: number }).n;
  const published = db.prepare('SELECT 1 FROM scenarios WHERE published = 1').get() ? 0 : 1;
  db.prepare('INSERT INTO scenarios (id, title, kind, is_current, variant, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    BUILTIN_SCENARIO.id, BUILTIN_SCENARIO.title, 'builtin', published, variant, published, now, now,
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
