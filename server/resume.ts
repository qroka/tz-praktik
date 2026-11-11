// Личные коды попыток: выдача и перенос на уже сохранённые попытки.
import { randomInt } from 'node:crypto';
import { generateCode } from '../src/shared/resumeCode.ts';
import type { Db } from './db.ts';

/** Новый код, которого ещё нет в базе. */
export function uniqueCode(db: Db): string {
  for (let i = 0; i < 20; i++) {
    const code = generateCode((max) => randomInt(max));
    if (!db.prepare('SELECT 1 FROM attempts WHERE resume_code = ?').get(code)) return code;
  }
  throw new Error('Не удалось подобрать свободный код попытки.');
}

/** Миграция: старым попыткам выдаются коды, чтобы студенты могли к ним вернуться. */
export function backfillResumeCodes(db: Db): void {
  const rows = db.prepare('SELECT id, attempt_json FROM attempts WHERE resume_code IS NULL').all() as { id: number; attempt_json: string }[];
  for (const row of rows) {
    const code = uniqueCode(db);
    let json = row.attempt_json;
    try {
      json = JSON.stringify({ ...(JSON.parse(row.attempt_json) as object), resumeCode: code });
    } catch {
      // Повреждённый JSON оставляем как есть: код всё равно записывается в колонку.
    }
    db.prepare('UPDATE attempts SET resume_code = ?, attempt_json = ? WHERE id = ?').run(code, json, row.id);
  }
}
