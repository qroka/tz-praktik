// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createUser } from './auth.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { backfillResumeCodes, uniqueCode } from './resume.ts';
import { normalizeCode } from '../src/shared/resumeCode.ts';

let base = '';
let close = () => {};
let adminCookie = '';
const JSON_H = { 'Content-Type': 'application/json' };

const CODE = 'лиса-мост-река-замок';

const attempt = (over: Record<string, unknown> = {}) => ({
  version: 1,
  scenarioId: 'hot-water-unit',
  studentName: 'Анна Резюме',
  difficulty: 'learning',
  seed: 7,
  startedAt: '2026-11-05T10:00:00.000Z',
  finishedAt: null,
  messages: [{ id: 'm1', role: 'student', text: 'Привет', at: '2026-11-05T10:00:01.000Z' }],
  engine: { disclosed: ['a'] },
  requirements: [],
  tz: {},
  screen: 'dialog',
  activeSection: 1,
  result: null,
  resumeCode: CODE,
  ...over,
});

const post = (body: Record<string, unknown>) => fetch(`${base}/api/public/attempts`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ scenarioId: 'hot-water-unit', ...body }) });
const get = (code: string) => fetch(`${base}/api/public/attempts/${encodeURIComponent(code)}`);

beforeAll(async () => {
  const db = openDb(':memory:');
  createUser(db, 'teacher', 'correct-horse-1');
  const app = createApp(db, { ...loadConfig({}), staticDir: '/nonexistent' });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.server.close();
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...JSON_H, 'X-Requested-With': 'tzp' }, body: JSON.stringify({ username: 'teacher', password: 'correct-horse-1' }) });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
});
afterAll(() => close());

describe('Личный код попытки', () => {
  it('новая попытка сохраняется под своим кодом с версией 1', async () => {
    const response = await post({ attempt: attempt() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rev: 1, code: CODE });
  });

  it('по коду попытку можно получить в любой записи: регистр, пробелы, «е» вместо «ё»', async () => {
    for (const written of [CODE, 'ЛИСА МОСТ РЕКА ЗАМОК', 'Лиса, мост, река, замок']) {
      const response = await get(written);
      expect(response.status, written).toBe(200);
      const data = await response.json();
      expect(data.attempt.studentName).toBe('Анна Резюме');
      expect(data.attempt.resumeCode).toBe(CODE);
      expect(data.rev).toBe(1);
      expect(data.scenario).toMatchObject({ id: 'hot-water-unit', kind: 'builtin' });
    }
  });

  it('неверный, чужой и несуществующий код дают один и тот же ответ', async () => {
    const a = await get('лиса-мост-река-абракадабра');
    const b = await get('лиса-мост-река-сад');
    const c = await get('сад-мост-лиса-река');
    expect([a.status, b.status, c.status]).toEqual([404, 404, 404]);
    expect(await a.json()).toEqual(await c.json());
  });

  it('обновление с верной версией увеличивает её, с устаревшей — конфликт', async () => {
    const ok = await post({ attempt: attempt({ messages: [{ id: 'm1', role: 'student', text: 'Привет', at: 'x' }, { id: 'm2', role: 'student', text: 'Ещё', at: 'x' }] }), baseRev: 1 });
    expect(await ok.json()).toMatchObject({ rev: 2 });

    // Второе устройство всё ещё думает, что версия 1.
    const stale = await post({ attempt: attempt({ tz: { 1: 'моя версия' } }), baseRev: 1 });
    expect(stale.status).toBe(409);
    const conflict = await stale.json();
    expect(conflict.error).toBe('conflict');
    expect(conflict.rev).toBe(2);
    expect(conflict.attempt.messages).toHaveLength(2);

    // Сервер версию не поменял.
    expect((await (await get(CODE)).json()).attempt.tz).toEqual({});
  });

  it('«оставить мою версию» (force) перезаписывает и поднимает версию', async () => {
    const forced = await post({ attempt: attempt({ tz: { 1: 'моя версия' } }), baseRev: 1, force: true });
    expect(await forced.json()).toMatchObject({ ok: true, rev: 3 });
    expect((await (await get(CODE)).json()).attempt.tz).toEqual({ 1: 'моя версия' });
  });

  it('завершённая попытка не откатывается незавершённой', async () => {
    const done = attempt({ finishedAt: '2026-11-05T11:00:00.000Z', result: { total: 77, grade: 'Хорошо', parts: [], penalties: [], etalon: [] } });
    expect((await (await post({ attempt: done, baseRev: 3 })).json()).rev).toBe(4);
    const late = await (await post({ attempt: attempt(), baseRev: 4 })).json();
    expect(late.ignored).toBe(true);
    expect((await (await get(CODE)).json()).attempt.result.total).toBe(77);
  });

  it('код нельзя использовать для попытки по другому сценарию', async () => {
    const response = await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt({ scenarioId: 'other' }) }) });
    expect(response.status).toBe(400);
  });

  it('искажённый код при отправке отклоняется', async () => {
    expect((await post({ attempt: attempt({ resumeCode: 'abc-123' }) })).status).toBe(400);
  });

  it('старый клиент без кода получает код от сервера и потом может по нему вернуться', async () => {
    const legacy = attempt({ studentName: 'Старый Клиент', seed: 99 });
    delete (legacy as { resumeCode?: string }).resumeCode;
    const data = await (await post({ attempt: legacy })).json();
    expect(normalizeCode(data.code)).toBe(data.code);
    expect((await get(data.code)).status).toBe(200);
    // Повторная отправка того же без кода находит ту же попытку и не создаёт дубль.
    const again = await (await post({ attempt: legacy })).json();
    expect(again.id).toBe(data.id);
    expect(again.code).toBe(data.code);
  });

  it('преподаватель видит код в списке попыток и находит попытку по коду', async () => {
    const find = async (q: string) => (await (await fetch(`${base}/api/admin/attempts?q=${encodeURIComponent(q)}`, { headers: { Cookie: adminCookie } })).json()).items;
    expect((await find('Резюме'))[0].resumeCode).toBe(CODE);
    expect((await find(CODE))[0].studentName).toBe('Анна Резюме');
    expect((await find('лиса мост река'))[0].studentName).toBe('Анна Резюме');
    expect(await find('сад-сад-сад')).toHaveLength(0);
  });
});

describe('Коды и миграция', () => {
  it('старые попытки без кода получают уникальные коды, в том числе внутри JSON', () => {
    const db = openDb(':memory:');
    const now = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO attempts (client_key, scenario_id, student_name, started_at, updated_at, attempt_json) VALUES (?, ?, ?, ?, ?, ?)').run(`k${i}`, 'hot-water-unit', `С${i}`, now, now, JSON.stringify({ studentName: `С${i}` }));
    }
    db.prepare('INSERT INTO attempts (client_key, scenario_id, student_name, started_at, updated_at, attempt_json) VALUES (?, ?, ?, ?, ?, ?)').run('bad', 'hot-water-unit', 'Битый', now, now, '{не json');
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

describe('Защита от подбора кода', () => {
  it('после 40 запросов с одного адреса подбор блокируется', async () => {
    const db = openDb(':memory:');
    const app = createApp(db, { ...loadConfig({}), staticDir: '/nonexistent' });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/public/attempts/`;
    let last = 0;
    for (let i = 0; i < 45; i++) last = (await fetch(url + encodeURIComponent('лиса-мост-река-сад'))).status;
    expect(last).toBe(429);
    app.server.close();
    db.close();
  });
});
