// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createUser } from './auth.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { backfillStudents } from './students.ts';
import { unzip } from './testUtils.ts';
import { normalizeCode } from '../src/shared/resumeCode.ts';

let base = '';
let close = () => {};
let adminCookie = '';
const JSON_H = { 'Content-Type': 'application/json' };

async function api(method: string, path: string, options: { token?: string; body?: unknown; admin?: boolean } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(options.body !== undefined ? JSON_H : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.admin ? { Cookie: adminCookie, 'X-Requested-With': 'tzp' } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const type = response.headers.get('content-type') ?? '';
  return { status: response.status, data: type.includes('json') ? await response.json() : await response.arrayBuffer(), headers: response.headers };
}

const register = (fullName: string, group: string) => api('POST', '/api/student/register', { body: { fullName, group } });

const attempt = (code: string, over: Record<string, unknown> = {}) => ({
  version: 1,
  scenarioId: 'hot-water-unit',
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
  resumeCode: code,
  ...over,
});

const post = (token: string, code: string, extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  api('POST', '/api/student/attempts', { token, body: { scenarioId: 'hot-water-unit', attempt: attempt(code, over), ...extra } });

const done = (score: number) => ({ finishedAt: '2026-11-05T11:00:00.000Z', result: { total: score, grade: score >= 70 ? 'Хорошо' : 'Нужно доработать', parts: [], penalties: [], etalon: [] } });

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

let ivanov = { token: '', code: '', id: 0 };
let petrova = { token: '', code: '', id: 0 };

describe('Регистрация студента', () => {
  it('ФИО и группа создают аккаунт с кодом из четырёх слов и входом', async () => {
    const response = await register('Иванов Иван', 'ИС-21');
    expect(response.status).toBe(200);
    const { student, token } = response.data;
    expect(student).toMatchObject({ fullName: 'Иванов Иван', group: 'ИС-21' });
    expect(normalizeCode(student.code)).toBe(student.code);
    expect(token.length).toBeGreaterThan(30);
    ivanov = { token, code: student.code, id: student.id };
  });

  it('ФИО и группа проверяются', async () => {
    for (const [name, group] of [['Иван', 'ИС-21'], ['', 'ИС-21'], ['Ив', 'ИС-21'], ['Иван 123', 'ИС-21'], ['<b>Иван</b> Тест', 'ИС-21'], ['Петров Пётр', ''], ['Петров Пётр', '   '], ['Петров Пётр', 'х'.repeat(41)], ['Петров Пётр', '<script>']]) {
      expect((await register(name, group)).status, `${name} / ${group}`).toBe(400);
    }
    expect((await api('POST', '/api/student/register', { body: { fullName: 42, group: [] } })).status).toBe(400);
  });

  it('тот же студент в той же группе не регистрируется дважды, даже с другим регистром и «ё»', async () => {
    for (const [name, group] of [['иванов иван', 'ис-21'], ['  Иванов   Иван ', 'ИС-21'], ['ИВАНОВ ИВАН', 'Ис-21']]) {
      const response = await register(name, group);
      expect(response.status, name).toBe(409);
      expect(response.data.error).toContain('уже зарегистрирован');
    }
    // Тёзка в другой группе — другой студент.
    expect((await register('Иванов Иван', 'ИС-22')).status).toBe(200);
    expect((await register('Фёдоров Пётр', 'ИС-21')).status).toBe(200);
    expect((await register('Федоров Петр', 'ИС-21')).status).toBe(409);
  });

  it('группа пишется так, как её уже написали первой', async () => {
    const response = await register('Сидоров Сидор', 'ис-21');
    expect(response.data.student.group).toBe('ИС-21');
    expect((await api('GET', '/api/student/groups')).data.groups).toEqual(['ИС-21', 'ИС-22']);
  });

  it('вход по коду: регистр, пробелы и «е» вместо «ё» не важны, неверный код неотличим от несуществующего', async () => {
    const written = ivanov.code.replace(/-/g, ' ').toUpperCase();
    const ok = await api('POST', '/api/student/login', { body: { code: written } });
    expect(ok.status).toBe(200);
    expect(ok.data.student).toMatchObject({ fullName: 'Иванов Иван', code: ivanov.code });
    const bad = await api('POST', '/api/student/login', { body: { code: 'лиса-мост-река-абракадабра' } });
    const unknown = await api('POST', '/api/student/login', { body: { code: 'сад-сад-сад-сад' } });
    const junk = await api('POST', '/api/student/login', { body: { code: 42 } });
    expect([bad.status, unknown.status, junk.status]).toEqual([401, 401, 401]);
    expect(bad.data).toEqual(unknown.data);
  });
});

describe('Личный кабинет и попытки', () => {
  it('без входа кабинет закрыт, с неверным токеном — тоже', async () => {
    expect((await api('GET', '/api/student/me')).status).toBe(401);
    expect((await api('GET', '/api/student/me', { token: 'x'.repeat(40) })).status).toBe(401);
    expect((await api('POST', '/api/student/attempts', { body: { scenarioId: 'hot-water-unit', attempt: attempt('лиса-мост-река-замок') } })).status).toBe(401);
  });

  it('попытка сохраняется, имя и группа берутся из аккаунта, а не из присланного', async () => {
    const created = await post(ivanov.token, 'лиса-мост-река-замок', {}, { studentName: 'Подделка', studentGroup: 'ЧУЖАЯ', studentId: 999 });
    expect(created.status).toBe(200);
    expect(created.data).toMatchObject({ ok: true, rev: 1 });
    const list = await api('GET', '/api/admin/attempts', { admin: true });
    const row = list.data.items[0];
    expect(row).toMatchObject({ studentName: 'Иванов Иван', group: 'ИС-21' });
    const detail = await api('GET', `/api/admin/attempts/${row.id}`, { admin: true });
    expect(detail.data.attempt).toMatchObject({ studentName: 'Иванов Иван', studentGroup: 'ИС-21', studentId: ivanov.id });
  });

  it('история кабинета показывает попытки студента с названием сценария', async () => {
    await post(ivanov.token, 'мост-лиса-замок-река', {}, { startedAt: '2026-11-06T09:00:00.000Z', seed: 8, ...done(81) });
    const me = (await api('GET', '/api/student/me', { token: ivanov.token })).data;
    expect(me.student.fullName).toBe('Иванов Иван');
    expect(me.attempts).toHaveLength(2);
    // Свежие сверху.
    expect(me.attempts[0]).toMatchObject({ key: 'мост-лиса-замок-река', score: 81, grade: 'Хорошо', questions: 1 });
    expect(me.attempts[0].scenarioTitle).toBeTruthy();
    expect(me.attempts[1].finishedAt).toBeNull();
  });

  it('свою попытку можно открыть вместе со сценарием; чужую — нет', async () => {
    const own = await api('GET', `/api/student/attempts/${encodeURIComponent('лиса-мост-река-замок')}`, { token: ivanov.token });
    expect(own.status).toBe(200);
    expect(own.data.attempt.messages).toHaveLength(1);
    expect(own.data.scenario).toMatchObject({ id: 'hot-water-unit', kind: 'builtin' });

    const other = await register('Петрова Анна', 'ИС-21');
    petrova = { token: other.data.token, code: other.data.student.code, id: other.data.student.id };
    expect((await api('GET', `/api/student/attempts/${encodeURIComponent('лиса-мост-река-замок')}`, { token: petrova.token })).status).toBe(404);
    expect((await api('GET', '/api/student/me', { token: petrova.token })).data.attempts).toHaveLength(0);
  });

  it('чужую попытку нельзя изменить, даже зная её номер', async () => {
    const hijack = await post(petrova.token, 'лиса-мост-река-замок', { force: true }, { tz: { 1: 'взлом' } });
    expect(hijack.status).toBe(403);
    const own = await api('GET', `/api/student/attempts/${encodeURIComponent('лиса-мост-река-замок')}`, { token: ivanov.token });
    expect(own.data.attempt.tz).toEqual({});
  });

  it('версии: устаревшая отправка не затирает, «оставить мою» перезаписывает', async () => {
    const ok = await post(ivanov.token, 'лиса-мост-река-замок', { baseRev: 1 }, { messages: [{ id: 'm1', role: 'student', text: 'a', at: 'x' }, { id: 'm2', role: 'student', text: 'b', at: 'x' }] });
    expect(ok.data.rev).toBe(2);
    const stale = await post(ivanov.token, 'лиса-мост-река-замок', { baseRev: 1 }, { tz: { 1: 'моё' } });
    expect(stale.status).toBe(409);
    expect(stale.data).toMatchObject({ error: 'conflict', rev: 2 });
    expect(stale.data.attempt.messages).toHaveLength(2);
    const forced = await post(ivanov.token, 'лиса-мост-река-замок', { baseRev: 1, force: true }, { tz: { 1: 'моё' } });
    expect(forced.data.rev).toBe(3);
  });

  it('завершённая попытка не откатывается незавершённой', async () => {
    await post(ivanov.token, 'лиса-мост-река-замок', { baseRev: 3 }, done(77));
    const late = await post(ivanov.token, 'лиса-мост-река-замок', { baseRev: 4 });
    expect(late.data.ignored).toBe(true);
  });

  it('искажённый номер попытки и чужой сценарий отклоняются', async () => {
    expect((await post(ivanov.token, 'abc-123')).status).toBe(400);
    expect((await api('POST', '/api/student/attempts', { token: ivanov.token, body: { scenarioId: 'nope', attempt: attempt('лиса-мост-река-замок') } })).status).toBe(404);
    expect((await api('POST', '/api/student/attempts', { token: ivanov.token, body: { scenarioId: 'hot-water-unit', attempt: attempt('лиса-мост-река-замок', { scenarioId: 'other' }) } })).status).toBe(400);
  });

  it('выход закрывает токен', async () => {
    const login = await api('POST', '/api/student/login', { body: { code: ivanov.code } });
    const token = login.data.token;
    expect((await api('GET', '/api/student/me', { token })).status).toBe(200);
    await api('POST', '/api/student/logout', { token });
    expect((await api('GET', '/api/student/me', { token })).status).toBe(401);
    // Токен, полученный при регистрации, остаётся действующим: это другая сессия.
    expect((await api('GET', '/api/student/me', { token: ivanov.token })).status).toBe(200);
  });

  it('CORS для сайта на другом адресе: Authorization разрешён', async () => {
    const preflight = await fetch(`${base}/api/student/me`, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('Студенты в панели преподавателя', () => {
  it('раздел закрыт без входа администратора, а студенческий токен не подходит', async () => {
    expect((await api('GET', '/api/admin/students')).status).toBe(401);
    expect((await api('GET', '/api/admin/students', { token: ivanov.token })).status).toBe(401);
    expect((await api('GET', '/api/admin/students/codes.xlsx')).status).toBe(401);
  });

  it('список с попытками и лучшим баллом, группы со счётчиками', async () => {
    const data = (await api('GET', '/api/admin/students', { admin: true })).data;
    expect(data.total).toBe(5);
    const row = data.items.find((s: { fullName: string; group: string }) => s.fullName === 'Иванов Иван' && s.group === 'ИС-21');
    expect(row).toMatchObject({ attempts: 2, finished: 2, bestScore: 81, code: ivanov.code });
    expect(data.groups).toEqual([{ name: 'ИС-21', students: 4 }, { name: 'ИС-22', students: 1 }]);
  });

  it('фильтр по группе и поиск без учёта регистра и «ё»', async () => {
    const find = async (query: string) => (await api('GET', `/api/admin/students?${query}`, { admin: true })).data;
    expect((await find('group=' + encodeURIComponent('ИС-22'))).total).toBe(1);
    expect((await find('group=' + encodeURIComponent('ис-21'))).total).toBe(4);
    expect((await find('q=' + encodeURIComponent('ИВАНОВ'))).total).toBe(2);
    expect((await find('q=' + encodeURIComponent('федоров'))).items[0].fullName).toBe('Фёдоров Пётр');
    expect((await find('q=' + encodeURIComponent(ivanov.code.replace(/-/g, ' ')))).items[0].fullName).toBe('Иванов Иван');
    expect((await find('q=%25')).total).toBe(0);
    expect((await find('pageSize=2&page=2')).items).toHaveLength(2);
  });

  it('добавление студента вручную', async () => {
    const created = await api('POST', '/api/admin/students', { admin: true, body: { fullName: 'Кузнецов Кирилл', group: 'ИС-23' } });
    expect(created.status).toBe(200);
    expect(normalizeCode(created.data.code)).toBe(created.data.code);
    expect((await api('POST', '/api/admin/students', { admin: true, body: { fullName: 'Кузнецов Кирилл', group: 'ис-23' } })).status).toBe(409);
    // Студент, добавленный преподавателем, входит по выданному коду.
    expect((await api('POST', '/api/student/login', { body: { code: created.data.code } })).status).toBe(200);
  });

  it('список группой: группа по умолчанию, пропуск дублей и ошибок с причинами', async () => {
    const text = ['Орлов Олег; ИС-24', 'Волкова Вера, ИС-24', 'Зайцев Захар', 'Иванов Иван\tИС-21', 'Один', '', 'Лисицына Лиза;'].join('\n');
    const result = (await api('POST', '/api/admin/students/bulk', { admin: true, body: { text, group: 'ИС-25' } })).data;
    expect(result.created.map((s: { fullName: string; group: string }) => `${s.fullName}:${s.group}`)).toEqual([
      'Орлов Олег:ИС-24', 'Волкова Вера:ИС-24', 'Зайцев Захар:ИС-25', 'Лисицына Лиза:ИС-25',
    ]);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.find((s: { line: string }) => s.line.startsWith('Иванов')).reason).toContain('уже зарегистрирован');
    expect(result.skipped.find((s: { line: string }) => s.line === 'Один').reason).toContain('фамилию и имя');
    expect((await api('POST', '/api/admin/students/bulk', { admin: true, body: { text: 'Без Группы' } })).data.skipped[0].reason).toContain('группу');
    expect((await api('POST', '/api/admin/students/bulk', { admin: true, body: { text: '   ' } })).status).toBe(400);
  });

  it('смена ФИО и группы обновляет и попытки студента', async () => {
    const patch = await api('PATCH', `/api/admin/students/${ivanov.id}`, { admin: true, body: { fullName: 'Иванов Иван Иванович', group: 'ИС-22' } });
    expect(patch.status).toBe(200);
    const list = (await api('GET', '/api/admin/attempts?q=' + encodeURIComponent('иванович'), { admin: true })).data;
    expect(list.total).toBe(2);
    expect(list.items[0]).toMatchObject({ studentName: 'Иванов Иван Иванович', group: 'ИС-22' });
    const detail = (await api('GET', `/api/admin/attempts/${list.items[0].id}`, { admin: true })).data;
    expect(detail.attempt).toMatchObject({ studentName: 'Иванов Иван Иванович', studentGroup: 'ИС-22' });
    // Занятое сочетание ФИО и группы другим студентом не позволяется.
    const clash = await api('PATCH', `/api/admin/students/${petrova.id}`, { admin: true, body: { fullName: 'Иванов Иван Иванович', group: 'ИС-22' } });
    expect(clash.status).toBe(409);
    expect((await api('PATCH', '/api/admin/students/99999', { admin: true, body: { group: 'ИС-1' } })).status).toBe(404);
  });

  it('новый код: старый не работает, старые входы закрыты, новый подходит', async () => {
    const reissued = await api('POST', `/api/admin/students/${petrova.id}/reissue-code`, { admin: true });
    expect(reissued.status).toBe(200);
    const fresh = reissued.data.code;
    expect(fresh).not.toBe(petrova.code);
    expect((await api('GET', '/api/student/me', { token: petrova.token })).status).toBe(401);
    expect((await api('POST', '/api/student/login', { body: { code: petrova.code } })).status).toBe(401);
    const login = await api('POST', '/api/student/login', { body: { code: fresh } });
    expect(login.status).toBe(200);
    expect(login.data.student.fullName).toBe('Петрова Анна');
  });

  it('попытки и статистика фильтруются по группе', async () => {
    const attempts = (group: string) => api('GET', '/api/admin/attempts?group=' + encodeURIComponent(group), { admin: true });
    expect((await attempts('ИС-22')).data.total).toBe(2);
    expect((await attempts('ис-21')).data.total).toBe(0);
    const stats = (group: string) => api('GET', '/api/admin/stats?group=' + encodeURIComponent(group), { admin: true });
    expect((await stats('ИС-22')).data.totals).toMatchObject({ attempts: 2, finished: 2, students: 1 });
    expect((await stats('ИС-99')).data.totals.attempts).toBe(0);
    expect((await api('GET', '/api/admin/stats', { admin: true })).data.totals.attempts).toBe(2);
  });

  it('таблица попыток содержит группу и фильтруется по ней', async () => {
    const read = async (path: string) => unzip(Buffer.from((await api('GET', path, { admin: true })).data as ArrayBuffer))['xl/worksheets/sheet1.xml'];
    const all = await read('/api/admin/reports/attempts.xlsx');
    expect(all).toContain('Группа');
    expect(all).toContain('ИС-22');
    expect(await read('/api/admin/reports/attempts.xlsx?group=' + encodeURIComponent('ИС-99'))).not.toContain('Иванов');
  });

  it('список кодов для раздачи скачивается и фильтруется по группе', async () => {
    const response = await api('GET', '/api/admin/students/codes.xlsx?group=' + encodeURIComponent('ИС-24'), { admin: true });
    expect(response.headers.get('content-type')).toContain('spreadsheetml');
    const sheet = unzip(Buffer.from(response.data as ArrayBuffer))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('Код для входа');
    expect(sheet).toContain('Орлов Олег');
    expect(sheet).not.toContain('Иванов');
  });

  it('удаление студента: с попытками — только подтвердив, студенческие входы закрываются', async () => {
    const denied = await api('DELETE', `/api/admin/students/${ivanov.id}`, { admin: true });
    expect(denied.status).toBe(409);
    expect((await api('GET', '/api/student/me', { token: ivanov.token })).status).toBe(200);
    const removed = await api('DELETE', `/api/admin/students/${ivanov.id}?withAttempts=1`, { admin: true });
    expect(removed.data).toMatchObject({ ok: true, deletedAttempts: 2 });
    expect((await api('GET', '/api/student/me', { token: ivanov.token })).status).toBe(401);
    expect((await api('GET', '/api/admin/attempts', { admin: true })).data.total).toBe(0);
    expect((await api('DELETE', `/api/admin/students/${ivanov.id}`, { admin: true })).status).toBe(404);
  });
});

describe('Ограничения', () => {
  it('регистрация и подбор кода ограничены по адресу', async () => {
    const db = openDb(':memory:');
    const app = createApp(db, { ...loadConfig({}), staticDir: '/nonexistent' });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const send = (path: string, body: unknown) => fetch(url + path, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }).then((r) => r.status);
    let last = 0;
    for (let i = 0; i < 22; i++) last = await send('/api/student/register', { fullName: `Студент Номер${'абвгдежзик'[i % 10]}${'абвгдежзик'[Math.floor(i / 10)]}`, group: 'ИС-1' });
    expect(last).toBe(429);
    last = 0;
    for (let i = 0; i < 45; i++) last = await send('/api/student/login', { code: 'лиса-мост-река-сад' });
    expect(last).toBe(429);
    app.server.close();
    db.close();
  });
});

describe('Перенос старых попыток в аккаунты', () => {
  it('каждое имя становится студентом, прежний код попытки — его кодом, попытки привязаны', async () => {
    const db = openDb(':memory:');
    const insert = db.prepare('INSERT INTO attempts (client_key, scenario_id, student_name, started_at, updated_at, attempt_json, resume_code) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run('a', 'hot-water-unit', 'Старый Студент', '2026-10-01T10:00:00.000Z', 'x', '{}', 'лиса-мост-река-замок');
    insert.run('b', 'hot-water-unit', 'старый  студент', '2026-10-02T10:00:00.000Z', 'x', '{}', 'сад-мост-река-замок');
    insert.run('c', 'hot-water-unit', 'Другой Человек', '2026-10-03T10:00:00.000Z', 'x', '{}', 'сад-лиса-река-замок');
    backfillStudents(db);
    const students = db.prepare('SELECT * FROM students ORDER BY id').all() as { id: number; full_name: string; group_name: string; code: string }[];
    expect(students).toHaveLength(2);
    // Свежая попытка определяет написание имени и код.
    expect(students.find((s) => s.full_name === 'старый студент')?.code).toBe('сад-мост-река-замок');
    expect(students.every((s) => s.group_name === '')).toBe(true);
    const linked = db.prepare('SELECT student_id, COUNT(*) AS n FROM attempts GROUP BY student_id').all() as { student_id: number; n: number }[];
    expect(linked.map((l) => l.n).sort()).toEqual([1, 2]);

    // Выданный раньше код работает как вход в кабинет.
    const app = createApp(db, { ...loadConfig({}), staticDir: '/nonexistent' });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const login = await fetch(`${url}/api/student/login`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ code: 'сад мост река замок' }) });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };
    const me = (await (await fetch(`${url}/api/student/me`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { attempts: unknown[] };
    expect(me.attempts).toHaveLength(2);
    app.server.close();
    db.close();
  });
});
