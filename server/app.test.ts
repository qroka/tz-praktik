// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CODE_WORDS } from '../src/shared/resumeCode.ts';
import { createApp } from './app.ts';
import { createUser } from './auth.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { RateLimiter } from './http.ts';
import { backfillFeedback } from './feedback.ts';
import { unzip } from './testUtils.ts';
import sample from '../src/data/fixtures/sample-pack.json' with { type: 'json' };

let base = '';
let close = () => {};
let cookie = '';

// Попытки отправляет вошедший студент: для каждого имени из попытки заводим аккаунт и подставляем его токен.
const realFetch = globalThis.fetch;
const studentTokens = new Map<string, string>();
async function tokenFor(name: string): Promise<string> {
  const fullName = name.trim().split(/\s+/).length > 1 ? name : `${name || 'Аноним'} Тестов`;
  let token = studentTokens.get(fullName);
  if (!token) {
    const response = await realFetch(`${base}/api/student/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, group: 'ТЕСТ-1' }) });
    token = ((await response.json()) as { token: string }).token;
    studentTokens.set(fullName, token);
  }
  return token;
}
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).endsWith('/api/student/attempts') && init?.method === 'POST' && typeof init.body === 'string') {
    const name = (JSON.parse(init.body) as { attempt?: { studentName?: string } }).attempt?.studentName ?? '';
    return realFetch(input, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await tokenFor(name)}` } });
  }
  return realFetch(input, init);
}) as typeof fetch;

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

/** Номер попытки: четыре слова, разные для разных seed (его, как и на сайте, выдаёт клиент). */
const codeFor = (seed: number) => [0, 1, 2, 3].map((i) => CODE_WORDS[(seed * 7 + i * 31) % CODE_WORDS.length]).join('-');

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
  resumeCode: codeFor((overrides.seed as number | undefined) ?? 42),
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

afterAll(() => {
  globalThis.fetch = realFetch;
  close();
});

describe('Авторизация', () => {
  it('админский API закрыт без входа', async () => {
    for (const path of ['/api/admin/scenarios', '/api/admin/attempts', '/api/admin/stats', '/api/admin/users', '/api/admin/reports/attempts.xlsx']) {
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
    const first = await fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt() }) });
    expect(first.status).toBe(200);
    await fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: finished(80) }) });
    const list = await call('GET', '/api/admin/attempts');
    expect(list.data.total).toBe(1);
    expect(list.data.items[0].score).toBe(80);
  });
  it('запоздалая незавершённая отправка не затирает результат', async () => {
    await fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt() }) });
    const list = await call('GET', '/api/admin/attempts');
    expect(list.data.items[0].score).toBe(80);
  });
  it('мусор и чужой сценарий отклоняются', async () => {
    const send = (body: unknown) => fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await send({ scenarioId: 'nope', attempt: attempt() })).status).toBe(404);
    expect((await send({ scenarioId: 'hot-water-unit', attempt: attempt({ scenarioId: 'other' }) })).status).toBe(400);
    expect((await send({ scenarioId: 'hot-water-unit', attempt: attempt({ startedAt: 'вчера' }) })).status).toBe(400);
    expect((await send('строка')).status).toBe(400);
  });
  it('слишком большое тело отклоняется', async () => {
    const big = await fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: attempt({ tz: { 1: 'x'.repeat(3_500_000) } }) }) }).catch(() => null);
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
  it('имя и аватарка заказчика сохраняются, чужие данные отклоняются', async () => {
    const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const ok = await call('PATCH', '/api/admin/scenarios/hot-water-unit', { settings: { customerName: 'Пётр Иванович', customerAvatar: avatar } });
    expect(ok.data.settings.customerName).toBe('Пётр Иванович');
    expect(ok.data.settings.customerAvatar).toBe(avatar);
    expect((await call('PATCH', '/api/admin/scenarios/hot-water-unit', { settings: { customerAvatar: 'https://example.com/a.jpg' } })).status).toBe(400);
    expect((await call('PATCH', '/api/admin/scenarios/hot-water-unit', { settings: { customerAvatar: 'data:text/html;base64,PGI+' } })).status).toBe(400);
    const cleared = await call('PATCH', '/api/admin/scenarios/hot-water-unit', { settings: { customerAvatar: '' } });
    expect(cleared.data.settings.customerAvatar).toBeUndefined();
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
    await fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'sample-compressor', attempt: attempt({ scenarioId: 'sample-compressor', studentName: 'Анна Тестова', seed: 77 }) }) });
    expect((await call('DELETE', '/api/admin/scenarios/sample-compressor')).status).toBe(409);
    expect((await call('DELETE', '/api/admin/scenarios/sample-compressor?withAttempts=1')).data.deletedAttempts).toBe(1);
  });
});

describe('Статистика и отчёты', () => {
  it('считает итоги, оценки, сведения и штрафы', async () => {
    await fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: finished(40, 'Мария Тестова', 7) }) });
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
  it('таблица попыток скачивается как настоящий xlsx', async () => {
    const response = await fetch(`${base}/api/admin/reports/attempts.xlsx`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers.get('content-disposition')).toContain('attempts.xlsx');
    const parts = unzip(Buffer.from(await response.arrayBuffer()));
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('Сценарий');
    expect(sheet).toContain('Мария Тестова');
    expect(sheet).toContain('<v>40</v>');
    expect((await fetch(`${base}/api/admin/reports/attempts.csv`, { headers: { Cookie: cookie } })).status).toBe(404);
  });
  it('отчёт по сценарию содержит таблицы', async () => {
    const report = await call('GET', '/api/admin/reports/scenario/hot-water-unit');
    expect(report.data).toContain('## Итоги');
    expect(report.data).toContain('Мария Тестова');
  });
});

describe('Обратная связь', () => {
  const rated = (name: string, seed: number, ratings: Record<string, { rating: 'like' | 'dislike'; reason: string } | undefined>) =>
    attempt({
      studentName: name,
      seed,
      startedAt: `2026-11-02T10:0${seed % 10}:00.000Z`,
      messages: [
        { id: 's1', role: 'student', text: 'Какое давление после насоса?', at: '2026-11-02T10:00:01.000Z' },
        { id: 'c1', role: 'customer', text: 'Нужно 0,3 МПа.', at: '2026-11-02T10:00:02.000Z', intentId: 'press_out', topic: 'press', feedback: ratings.c1 && { ...ratings.c1, at: '2026-11-02T10:00:03.000Z' } },
        { id: 's2', role: 'student', text: 'А до насоса?', at: '2026-11-02T10:00:04.000Z' },
        { id: 'c2', role: 'customer', text: 'Не понял вопрос.', at: '2026-11-02T10:00:05.000Z', intentId: null, topic: null, feedback: ratings.c2 && { ...ratings.c2, at: '2026-11-02T10:00:06.000Z' } },
      ],
    });
  const post = (body: unknown) => fetch(`${base}/api/student/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'hot-water-unit', attempt: body }) });

  it('оценки сохраняются вместе с вопросом студента и ответом заказчика', async () => {
    await post(rated('Оля Тестова', 11, { c1: { rating: 'like', reason: '' }, c2: { rating: 'dislike', reason: 'ответили не на мой вопрос' } }));
    const data = (await call('GET', '/api/admin/feedback')).data;
    expect(data.total).toBe(2);
    const dislike = data.items.find((i: { rating: string }) => i.rating === 'dislike');
    expect(dislike.question).toBe('А до насоса?');
    expect(dislike.answer).toBe('Не понял вопрос.');
    expect(dislike.reason).toBe('ответили не на мой вопрос');
    expect(dislike.studentName).toBe('Оля Тестова');
    expect(data.summary).toMatchObject({ total: 2, likes: 1, dislikes: 1, dislikesWithReason: 1 });
  });
  it('фильтры по оценке и тексту', async () => {
    expect((await call('GET', '/api/admin/feedback?rating=like')).data.total).toBe(1);
    expect((await call('GET', '/api/admin/feedback?rating=dislike')).data.total).toBe(1);
    expect((await call('GET', '/api/admin/feedback?q=' + encodeURIComponent('не на мой'))).data.total).toBe(1);
    expect((await call('GET', '/api/admin/feedback?q=%25')).data.total).toBe(0);
    expect((await call('GET', '/api/admin/feedback?scenario=nope')).data.total).toBe(0);
  });
  it('сводка показывает темы с дизлайками', async () => {
    const { problems } = (await call('GET', '/api/admin/feedback')).data.summary;
    expect(problems[0].dislikes).toBe(1);
    expect(problems[0].sampleQuestion).toBe('А до насоса?');
  });
  it('снятая студентом оценка исчезает при повторной отправке', async () => {
    await post(rated('Оля Тестова', 11, { c1: { rating: 'like', reason: '' } }));
    const data = (await call('GET', '/api/admin/feedback')).data;
    expect(data.total).toBe(1);
    expect(data.summary.dislikes).toBe(0);
  });
  it('удаление попытки удаляет её оценки', async () => {
    const list = await call('GET', '/api/admin/attempts?q=' + encodeURIComponent('Оля Тестова'));
    await call('DELETE', `/api/admin/attempts/${list.data.items[0].id}`);
    expect((await call('GET', '/api/admin/feedback')).data.total).toBe(0);
  });
  it('оценки старых попыток переносятся миграцией', () => {
    const db = openDb(':memory:');
    const now = new Date().toISOString();
    const json = JSON.stringify(rated('Старая', 5, { c2: { rating: 'dislike', reason: 'x' } }));
    db.prepare('INSERT INTO attempts (client_key, scenario_id, student_name, started_at, updated_at, attempt_json) VALUES (?, ?, ?, ?, ?, ?)').run('k', 'hot-water-unit', 'Старая', now, now, json);
    expect((db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }).n).toBe(0);
    backfillFeedback(db);
    expect((db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }).n).toBe(1);
    db.close();
  });
  it('без входа раздел закрыт', async () => {
    const saved = cookie;
    cookie = '';
    expect((await call('GET', '/api/admin/feedback')).status).toBe(401);
    cookie = saved;
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

describe('Сайт на корневом пути (свой домен, BASE_PATH=/)', () => {
  it('главная и ассеты отдаются без редиректов', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tzp-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ТЗ</title>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    const app = createApp(openDb(':memory:'), { ...loadConfig({}), staticDir: dir, basePath: '/' });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    try {
      const home = await realFetch(`${url}/`, { redirect: 'manual' });
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('<title>ТЗ</title>');
      expect((await realFetch(`${url}/assets/app.js`, { redirect: 'manual' })).status).toBe(200);
      expect((await realFetch(`${url}/api/public/scenario`)).status).toBe(200);
    } finally {
      app.server.close();
    }
  });
});
