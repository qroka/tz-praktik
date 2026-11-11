// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createUser } from './auth.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { RateLimiter } from './http.ts';
import { csvCell } from './reports.ts';
import sample from '../src/data/fixtures/sample-pack.json' with { type: 'json' };

let base = '';
let close = () => {};
let cookie = '';

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'tzp' };

async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...H, ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : await response.text();
  return { status: response.status, data, headers: response.headers };
}

const attempt = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  scenarioId: 'hot-water-unit',
  studentName: 'Иван Петров',
  difficulty: 'learning',
  seed: 42,
  startedAt: '2026-11-01T10:00:00.000Z',
  finishedAt: null,
  messages: [
    { id: 'm1', role: 'student', text: 'Здравствуйте', at: '2026-11-01T10:00:05.000Z' },
    { id: 'm2', role: 'customer', text: 'Добрый день', at: '2026-11-01T10:00:06.000Z' },
  ],
  engine: { disclosed: ['a', 'b'] },
  requirements: [],
  tz: {},
  screen: 'dialog',
  activeSection: 1,
  result: null,
  ...overrides,
});

const finished = (score: number, name = 'Иван Петров', seed = 42) =>
  attempt({
    studentName: name,
    seed,
    finishedAt: '2026-11-01T10:40:00.000Z',
    result: {
      total: score,
      grade: score >= 70 ? 'Хорошо' : 'Нужно доработать',
      parts: [{ id: 'registry', label: 'Требования в реестре', score: 6, max: 12, note: '' }],
      penalties: [{ id: 'repeat', label: 'Повторные вопросы', points: 2, detail: '' }],
      etalon: [
        { factId: 'f1', section: 3, category: 'purpose', label: 'Цель', value: 'x', requirementType: 'mandatory', customerConfidence: 'certain', disclosed: true, inRegistry: true, inTz: false },
        { factId: 'f2', section: 4, category: 'object', label: 'Состав', value: 'y', requirementType: 'mandatory', customerConfidence: 'certain', disclosed: false, inRegistry: false, inTz: false },
      ],
      missedCategories: ['modes'],
      generalQuestions: [{ messageId: 'm1', text: 'Расскажите всё' }],
      recommendations: ['Больше конкретики'],
      emptySections: [],
    },
  });

beforeAll(async () => {
  const db = openDb(':memory:');
  createUser(db, 'teacher', 'correct-horse-1');
  const app = createApp(db, { ...loadConfig({}), staticDir: '/nonexistent', publicOrigin: '*' });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.server.close();
});

afterAll(() => close());

describe('Авторизация', () => {
  it('админский API закрыт без входа', async () => {
    for (const path of ['/api/admin/scenarios', '/api/admin/attempts', '/api/admin/stats', '/api/admin/users', '/api/admin/reports/attempts.csv']) {
      expect((await call('GET', path)).status, path).toBe(401);
    }
  });
  it('неверный пароль и неизвестный логин дают одинаковую ошибку', async () => {
    const a = await call('POST', '/api/auth/login', { username: 'teacher', password: 'wrong-password' });
    const b = await call('POST', '/api/auth/login', { username: 'nobody', password: 'wrong-password' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.data).toEqual(b.data);
  });
  it('вход выдаёт HttpOnly-cookie и открывает API', async () => {
    const response = await call('POST', '/api/auth/login', { username: 'teacher', password: 'correct-horse-1' });
    expect(response.status).toBe(200);
    const set = response.headers.get('set-cookie') ?? '';
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Lax');
    cookie = set.split(';')[0];
    expect((await call('GET', '/api/auth/me')).data.user.username).toBe('teacher');
    expect((await call('GET', '/api/admin/scenarios')).status).toBe(200);
  });
  it('изменение без заголовка X-Requested-With отклоняется (CSRF)', async () => {
    const response = await fetch(`${base}/api/admin/scenarios/hot-water-unit`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{"settings":{}}' });
    expect(response.status).toBe(403);
  });
  it('публичный API отдаёт CORS, админский нет', async () => {
    const pub = await fetch(`${base}/api/public/scenario`);
    expect(pub.headers.get('access-control-allow-origin')).toBe('*');
    const admin = await fetch(`${base}/api/admin/scenarios`, { headers: { Cookie: cookie } });
    expect(admin.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('короткий пароль не принимается', async () => {
    const response = await call('POST', '/api/admin/users', { username: 'second', password: '123' });
    expect(response.status).toBe(400);
  });
});

describe('Попытки студентов', () => {
  it('сценарий для студентов доступен без входа', async () => {
    const response = await fetch(`${base}/api/public/scenario`);
    const data = await response.json();
    expect(data.id).toBe('hot-water-unit');
    expect(data.kind).toBe('builtin');
  });
  it('попытка сохраняется и обновляется по ключу, а не дублируется', async () => {
    const first = await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt() }) });
    expect(first.status).toBe(200);
    await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: finished(80) }) });
    const list = await call('GET', '/api/admin/attempts');
    expect(list.data.total).toBe(1);
    expect(list.data.items[0].score).toBe(80);
  });
  it('запоздалая незавершённая отправка не затирает результат', async () => {
    await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt() }) });
    const list = await call('GET', '/api/admin/attempts');
    expect(list.data.items[0].score).toBe(80);
  });
  it('мусор и чужой сценарий отклоняются', async () => {
    const send = (body: unknown) => fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await send({ scenarioId: 'nope', attempt: attempt() })).status).toBe(404);
    expect((await send({ scenarioId: 'hot-water-unit', attempt: attempt({ scenarioId: 'other' }) })).status).toBe(400);
    expect((await send({ scenarioId: 'hot-water-unit', attempt: attempt({ studentName: '' }) })).status).toBe(400);
    expect((await send({ scenarioId: 'hot-water-unit', attempt: attempt({ startedAt: 'вчера' }) })).status).toBe(400);
    expect((await send('строка')).status).toBe(400);
  });
  it('слишком большое тело отклоняется', async () => {
    const big = await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt({ tz: { 1: 'x'.repeat(3_500_000) } }) }) }).catch(() => null);
    expect(big === null || big.status === 413).toBe(true);
  });
  it('поиск по имени не ломается на спецсимволах', async () => {
    expect((await call('GET', '/api/admin/attempts?q=%25%27_')).data.total).toBe(0);
    expect((await call('GET', '/api/admin/attempts?q=%D0%98%D0%B2%D0%B0%D0%BD')).data.total).toBe(1);
  });
  it('карточка попытки содержит переписку', async () => {
    const list = await call('GET', '/api/admin/attempts');
    const detail = await call('GET', `/api/admin/attempts/${list.data.items[0].id}`);
    expect(detail.data.attempt.messages).toHaveLength(2);
    const report = await call('GET', `/api/admin/attempts/${list.data.items[0].id}/report.md`);
    expect(report.status).toBe(200);
    expect(report.data).toContain('Иван Петров');
  });
});

describe('Сценарии', () => {
  it('загрузка нового сценария, повтор без замены даёт 409', async () => {
    const added = await call('POST', '/api/admin/scenarios', sample);
    expect(added.status).toBe(200);
    expect((await call('POST', '/api/admin/scenarios', sample)).status).toBe(409);
    expect((await call('POST', '/api/admin/scenarios?replace=1', sample)).data.replaced).toBe(true);
  });
  it('неверный файл сценария отклоняется', async () => {
    expect((await call('POST', '/api/admin/scenarios', { format: 'x' })).status).toBe(400);
    expect((await call('POST', '/api/admin/scenarios', { ...sample, scenario: { ...sample.scenario, id: 'hot-water-unit' } })).status).toBe(409);
  });
  it('настройки сохраняются и проверяются', async () => {
    const ok = await call('PATCH', '/api/admin/scenarios/hot-water-unit', { settings: { title: 'Моя мойка', estimatedMinutes: 45, note: 'для группы А' } });
    expect(ok.data.settings.estimatedMinutes).toBe(45);
    expect((await call('PATCH', '/api/admin/scenarios/hot-water-unit', { settings: { estimatedMinutes: 1 } })).status).toBe(400);
  });
  it('текущий сценарий переключается, студентам отдаётся файл', async () => {
    await call('PATCH', '/api/admin/scenarios/sample-compressor', { isCurrent: true });
    const current = await (await fetch(`${base}/api/public/scenario`)).json();
    expect(current.id).toBe('sample-compressor');
    expect(current.pack.facts.length).toBeGreaterThan(0);
    expect((await call('PATCH', '/api/admin/scenarios/sample-compressor', { isCurrent: false })).status).toBe(400);
  });
  it('удалить нельзя встроенный и текущий, с попытками — только подтвердив', async () => {
    expect((await call('DELETE', '/api/admin/scenarios/hot-water-unit')).status).toBe(400);
    expect((await call('DELETE', '/api/admin/scenarios/sample-compressor')).status).toBe(400);
    await call('PATCH', '/api/admin/scenarios/hot-water-unit', { isCurrent: true });
    await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'sample-compressor', attempt: attempt({ scenarioId: 'sample-compressor', studentName: 'Анна' }) }) });
    expect((await call('DELETE', '/api/admin/scenarios/sample-compressor')).status).toBe(409);
    expect((await call('DELETE', '/api/admin/scenarios/sample-compressor?withAttempts=1')).data.deletedAttempts).toBe(1);
  });
});

describe('Статистика и отчёты', () => {
  it('считает итоги, оценки, сведения и штрафы', async () => {
    await fetch(`${base}/api/public/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: finished(40, 'Мария', 7) }) });
    const stats = (await call('GET', '/api/admin/stats?scenario=hot-water-unit')).data;
    expect(stats.totals.attempts).toBe(2);
    expect(stats.totals.finished).toBe(2);
    expect(stats.totals.avgScore).toBe(60);
    expect(stats.totals.students).toBe(2);
    expect(stats.grades.map((g: { grade: string }) => g.grade).sort()).toEqual(['Нужно доработать', 'Хорошо']);
    const fact2 = stats.facts.find((f: { factId: string }) => f.factId === 'f2');
    expect(fact2.disclosedPct).toBe(0);
    expect(stats.facts.find((f: { factId: string }) => f.factId === 'f1').disclosedPct).toBe(100);
    expect(stats.penalties[0].count).toBe(2);
    expect(stats.missedCategories[0]).toEqual({ category: 'modes', count: 2 });
  });
  it('CSV открывается в Excel и защищён от формул', async () => {
    const raw = await fetch(`${base}/api/admin/reports/attempts.csv`, { headers: { Cookie: cookie } });
    const bytes = new Uint8Array(await raw.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = { data: new TextDecoder().decode(bytes) };
    expect(csv.data).toContain('№;Сценарий');
    expect(csv.data).toContain('Мария');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('а;б')).toBe('"а;б"');
  });
  it('отчёт по сценарию содержит таблицы', async () => {
    const report = await call('GET', '/api/admin/reports/scenario/hot-water-unit');
    expect(report.data).toContain('## Итоги');
    expect(report.data).toContain('Мария');
  });
});

describe('Выход и ограничения', () => {
  it('ограничитель частоты блокирует после лимита и сбрасывается', () => {
    const limiter = new RateLimiter(2, 1000);
    expect([limiter.take('k', 0), limiter.take('k', 1), limiter.take('k', 2)]).toEqual([true, true, false]);
    expect(limiter.take('k', 2000)).toBe(true);
  });
  it('нельзя удалить себя и последнего администратора', async () => {
    const me = (await call('GET', '/api/auth/me')).data.user;
    expect((await call('DELETE', `/api/admin/users/${me.id}`)).status).toBe(400);
  });
  it('выход закрывает сессию', async () => {
    await call('POST', '/api/auth/logout');
    expect((await call('GET', '/api/admin/scenarios')).status).toBe(401);
  });
  it('защита от перебора пароля', async () => {
    cookie = '';
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call('POST', '/api/auth/login', { username: 'teacher', password: 'bad-password-' + i })).status;
    expect(last).toBe(429);
  });
});
