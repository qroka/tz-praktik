// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { backfillResumeCodes, uniqueCode } from './resume.ts';
import { normalizeCode } from '../src/shared/resumeCode.ts';

// Номер попытки (четыре слова) выдаёт сайт; сервер хранит его и сам выдаёт только старым попыткам без номера.
describe('Номера попыток и миграция', () => {
  it('старые попытки без номера получают уникальные, в том числе внутри JSON', () => {
    const db = openDb(':memory:');
    const now = new Date().toISOString();
    const insert = db.prepare('INSERT INTO attempts (client_key, scenario_id, student_name, started_at, updated_at, attempt_json) VALUES (?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < 5; i++) insert.run(`k${i}`, 'hot-water-unit', `С${i}`, now, now, JSON.stringify({ studentName: `С${i}` }));
    insert.run('bad', 'hot-water-unit', 'Битый', now, now, '{не json');
    backfillResumeCodes(db);
    const rows = db.prepare('SELECT resume_code, attempt_json FROM attempts').all() as { resume_code: string; attempt_json: string }[];
    expect(new Set(rows.map((r) => r.resume_code)).size).toBe(6);
    for (const row of rows.slice(0, 5)) {
      expect(normalizeCode(row.resume_code)).toBe(row.resume_code);
      expect(JSON.parse(row.attempt_json).resumeCode).toBe(row.resume_code);
    }
    db.close();
  });

  it('uniqueCode не повторяет уже выданные', () => {
    const db = openDb(':memory:');
    const seen = new Set<string>();
    const now = new Date().toISOString();
    for (let i = 0; i < 50; i++) {
      const code = uniqueCode(db);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
      db.prepare('INSERT INTO attempts (client_key, scenario_id, student_name, started_at, updated_at, attempt_json, resume_code) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`k${i}`, 'x', 'x', now, now, '{}', code);
    }
    db.close();
  });
});
