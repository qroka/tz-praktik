// HTTP-приложение: публичный API для студентов, API администратора, отдача собранного сайта.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { clearCookie, createSession, createUser, destroySession, destroyUserSessions, hashPassword, login, SESSION_COOKIE, sessionCookie, userBySession, validatePassword, verifyPassword } from './auth.ts';
import { BUILTIN_SCENARIO, type Config } from './config.ts';
import { transaction, type Db } from './db.ts';
import { registerAdminStudentRoutes, groupClause } from './adminStudents.ts';
import { feedbackSummary, listFeedback } from './feedback.ts';
import { registerStudentRoutes } from './studentRoutes.ts';
import { textKey } from './students.ts';
import { HttpError, RateLimiter, Router, parseCookies, readBody, sendBuffer, sendJson, sendText, type Ctx } from './http.ts';
import { attemptReportMd, attemptsXlsx, scenarioReportMd } from './reports.ts';
import { XLSX_MIME } from './xlsx.ts';
import { computeStats } from './stats.ts';

const MAX_PACK_BYTES = 5 * 1024 * 1024;

type ScenarioRow = {
  id: string;
  title: string;
  kind: 'builtin' | 'pack';
  pack_json: string | null;
  facts_total: number | null;
  is_current: number;
  settings_json: string;
  created_at: string;
  updated_at: string;
};

export type Settings = { title?: string; publicBrief?: string; estimatedMinutes?: number; note?: string; customerName?: string; customerAvatar?: string };

/** Аватарка заказчика: небольшая картинка data-URL (клиент сжимает её до ~256 px). */
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_AVATAR_CHARS = 150_000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

function parseSettings(text: string): Settings {
  try {
    const raw = JSON.parse(text) as unknown;
    return isObject(raw) ? (raw as Settings) : {};
  } catch {
    return {};
  }
}

/** Проверяет и очищает настройки сценария из запроса. */
export function cleanSettings(raw: unknown): Settings {
  if (!isObject(raw)) throw new HttpError(400, 'settings: ожидается объект.');
  const out: Settings = {};
  const title = str(raw.title, 200);
  const publicBrief = str(raw.publicBrief, 2000);
  const note = str(raw.note, 2000);
  if (title) out.title = title;
  if (publicBrief) out.publicBrief = publicBrief;
  if (note) out.note = note;
  const customerName = str(raw.customerName, 80);
  if (customerName) out.customerName = customerName;
  if (typeof raw.customerAvatar === 'string' && raw.customerAvatar) {
    if (raw.customerAvatar.length > MAX_AVATAR_CHARS || !AVATAR_RE.test(raw.customerAvatar)) throw new HttpError(400, 'Аватарка: нужна картинка JPEG, PNG или WebP до 100 КБ.');
    out.customerAvatar = raw.customerAvatar;
  }
  if (raw.estimatedMinutes !== undefined && raw.estimatedMinutes !== null && raw.estimatedMinutes !== '') {
    const minutes = Number(raw.estimatedMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600) throw new HttpError(400, 'Время занятия — целое число минут от 5 до 600.');
    out.estimatedMinutes = minutes;
  }
  return out;
}

/** Лёгкая проверка файла сценария на сервере. Полная проверка (словарь, вопросы) выполняется в панели до загрузки. */
export function checkPack(raw: unknown): { id: string; title: string; factsTotal: number } {
  if (!isObject(raw) || raw.format !== 'tz-praktikum-scenario') throw new HttpError(400, 'Это не файл сценария: format должен быть "tz-praktikum-scenario".');
  const head = raw.scenario;
  if (!isObject(head)) throw new HttpError(400, 'В файле нет блока scenario.');
  const id = head.id;
  const title = str(head.title, 200);
  if (typeof id !== 'string' || !/^[a-z0-9-]{2,60}$/.test(id)) throw new HttpError(400, 'scenario.id: 2–60 символов, строчная латиница, цифры, дефис.');
  if (!title) throw new HttpError(400, 'scenario.title: нужна непустая строка.');
  if (id === BUILTIN_SCENARIO.id) throw new HttpError(409, 'Этот идентификатор занят встроенным сценарием.');
  const facts = raw.facts;
  if (!Array.isArray(facts) || facts.length < 1 || facts.length > 500) throw new HttpError(400, 'В файле должен быть список facts (до 500 сведений).');
  for (const [index, fact] of facts.entries()) {
    if (!isObject(fact) || typeof fact.id !== 'string' || typeof fact.category !== 'string' || !Array.isArray(fact.questions) || !Array.isArray(fact.replies)) {
      throw new HttpError(400, `facts[${index}]: нужны id, category, questions, replies.`);
    }
  }
  return { id, title, factsTotal: facts.length };
}

export type App = { server: Server; handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>; router: Router };

export function createApp(db: Db, config: Config): App {
  const router = new Router();
  const loginLimiter = new RateLimiter(8, 10 * 60_000);

  const scenarioRow = (id: string) => db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id) as ScenarioRow | undefined;
  const cookieSecure = (req: IncomingMessage) => config.secureCookies || req.headers['x-forwarded-proto'] === 'https';

  // ---------- Публичное API ----------
  router.add('GET', '/api/health', 'public', () => ({ ok: true }));

  router.add('GET', '/api/public/scenario', 'public', () => {
    const row = db.prepare('SELECT * FROM scenarios WHERE is_current = 1').get() as ScenarioRow | undefined;
    if (!row) throw new HttpError(404, 'Сценарий не выбран.');
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      settings: parseSettings(row.settings_json),
      pack: row.kind === 'pack' && row.pack_json ? (JSON.parse(row.pack_json) as unknown) : null,
      updatedAt: row.updated_at,
    };
  });

  /** Описание сценария для сайта студента: так же, как у текущего, но для сценария конкретной попытки. */
  const scenarioPayload = (row: ScenarioRow) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    settings: parseSettings(row.settings_json),
    pack: row.kind === 'pack' && row.pack_json ? (JSON.parse(row.pack_json) as unknown) : null,
    updatedAt: row.updated_at,
  });

  registerStudentRoutes(router, {
    db,
    scenarioPayload: (id) => {
      const row = scenarioRow(id);
      return row ? scenarioPayload(row) : undefined;
    },
  });
  registerAdminStudentRoutes(router, db);

  // ---------- Авторизация ----------
  router.add('POST', '/api/auth/login', 'public', async (ctx) => {
    if (!loginLimiter.take(ctx.ip)) throw new HttpError(429, 'Слишком много попыток входа. Подождите 10 минут.');
    const body = await ctx.json<{ username?: unknown; password?: unknown }>(10_000);
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 200) throw new HttpError(400, 'Введите логин и пароль.');
    const user = login(db, body.username.trim(), body.password);
    if (!user) throw new HttpError(401, 'Неверный логин или пароль.');
    loginLimiter.reset(ctx.ip);
    const session = createSession(db, user.id, config.sessionDays);
    ctx.res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt, cookieSecure(ctx.req)));
    return { user };
  });

  router.add('POST', '/api/auth/logout', 'public', (ctx) => {
    destroySession(db, parseCookies(ctx.req.headers.cookie)[SESSION_COOKIE]);
    ctx.res.setHeader('Set-Cookie', clearCookie(cookieSecure(ctx.req)));
    return { ok: true };
  });

  router.add('GET', '/api/auth/me', 'public', (ctx) => ({ user: ctx.user }));

  router.add('POST', '/api/auth/password', 'admin', async (ctx) => {
    const body = await ctx.json<{ current?: unknown; next?: unknown }>(10_000);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user!.id) as { password_hash: string };
    if (typeof body.current !== 'string' || !verifyPassword(body.current, row.password_hash)) throw new HttpError(403, 'Текущий пароль неверен.');
    const problem = validatePassword(body.next);
    if (problem) throw new HttpError(400, problem);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.next as string), ctx.user!.id);
    destroyUserSessions(db, ctx.user!.id, parseCookies(ctx.req.headers.cookie)[SESSION_COOKIE]);
    return { ok: true };
  });

  // ---------- Администраторы ----------
  router.add('GET', '/api/admin/users', 'admin', () => ({
    items: db.prepare('SELECT id, username, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ORDER BY username').all(),
  }));

  router.add('POST', '/api/admin/users', 'admin', async (ctx) => {
    const body = await ctx.json<{ username?: unknown; password?: unknown }>(10_000);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw new HttpError(400, 'Логин: 3–40 символов, латиница, цифры, точка, дефис, подчёркивание.');
    const problem = validatePassword(body.password);
    if (problem) throw new HttpError(400, problem);
    try {
      return { id: createUser(db, username, body.password as string) };
    } catch {
      throw new HttpError(409, 'Такой логин уже есть.');
    }
  });

  router.add('DELETE', '/api/admin/users/:id', 'admin', (ctx) => {
    const id = Number(ctx.params.id);
    if (id === ctx.user!.id) throw new HttpError(400, 'Нельзя удалить самого себя.');
    const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    if (count <= 1) throw new HttpError(400, 'Нельзя удалить последнего администратора.');
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (!result.changes) throw new HttpError(404, 'Пользователь не найден.');
    return { ok: true };
  });

  // ---------- Сценарии ----------
  const listScenarios = () => {
    const rows = db
      .prepare(
        `SELECT s.*, COUNT(a.id) AS attempts, SUM(CASE WHEN a.finished_at IS NOT NULL THEN 1 ELSE 0 END) AS finished, AVG(a.score) AS avg_score
         FROM scenarios s LEFT JOIN attempts a ON a.scenario_id = s.id GROUP BY s.id ORDER BY s.is_current DESC, s.created_at`,
      )
      .all() as (ScenarioRow & { attempts: number; finished: number | null; avg_score: number | null })[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      isCurrent: Boolean(row.is_current),
      factsTotal: row.facts_total,
      settings: parseSettings(row.settings_json),
      attempts: row.attempts,
      finished: row.finished ?? 0,
      avgScore: row.avg_score === null ? null : Math.round(row.avg_score * 10) / 10,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  };

  router.add('GET', '/api/admin/scenarios', 'admin', () => ({ items: listScenarios() }));

  router.add('GET', '/api/admin/scenarios/:id', 'admin', (ctx) => {
    const row = scenarioRow(ctx.params.id);
    if (!row) throw new HttpError(404, 'Сценарий не найден.');
    const summary = listScenarios().find((item) => item.id === row.id);
    return { ...summary, pack: row.pack_json ? (JSON.parse(row.pack_json) as unknown) : null };
  });

  /** Загрузка файла сценария. Существующий сценарий с тем же id заменяется только при replace=1. */
  router.add('POST', '/api/admin/scenarios', 'admin', async (ctx) => {
    const pack = await ctx.json<unknown>(MAX_PACK_BYTES);
    const info = checkPack(pack);
    const existing = scenarioRow(info.id);
    const replace = ctx.url.searchParams.get('replace') === '1';
    if (existing && !replace) throw new HttpError(409, `Сценарий «${existing.title}» с таким id уже есть. Загрузите с заменой.`);
    const now = new Date().toISOString();
    const json = JSON.stringify(pack);
    if (existing) {
      db.prepare('UPDATE scenarios SET title = ?, pack_json = ?, facts_total = ?, updated_at = ? WHERE id = ?').run(info.title, json, info.factsTotal, now, info.id);
    } else {
      db.prepare('INSERT INTO scenarios (id, title, kind, pack_json, facts_total, is_current, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(
        info.id, info.title, 'pack', json, info.factsTotal, now, now,
      );
    }
    return { id: info.id, replaced: Boolean(existing) };
  });

  router.add('PATCH', '/api/admin/scenarios/:id', 'admin', async (ctx) => {
    const row = scenarioRow(ctx.params.id);
    if (!row) throw new HttpError(404, 'Сценарий не найден.');
    const body = await ctx.json<{ settings?: unknown; isCurrent?: unknown }>(250_000);
    const now = new Date().toISOString();
    transaction(db, () => {
      if (body.settings !== undefined) {
        const settings = cleanSettings(body.settings);
        db.prepare('UPDATE scenarios SET settings_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(settings), now, row.id);
      }
      if (body.isCurrent === true) {
        db.prepare('UPDATE scenarios SET is_current = 0 WHERE is_current = 1').run();
        db.prepare('UPDATE scenarios SET is_current = 1, updated_at = ? WHERE id = ?').run(now, row.id);
      } else if (body.isCurrent === false && row.is_current) {
        throw new HttpError(400, 'Чтобы снять отметку, выберите текущим другой сценарий.');
      }
    });
    return listScenarios().find((item) => item.id === row.id);
  });

  router.add('DELETE', '/api/admin/scenarios/:id', 'admin', (ctx) => {
    const row = scenarioRow(ctx.params.id);
    if (!row) throw new HttpError(404, 'Сценарий не найден.');
    if (row.kind === 'builtin') throw new HttpError(400, 'Встроенный сценарий удалить нельзя.');
    if (row.is_current) throw new HttpError(400, 'Сначала выберите текущим другой сценарий.');
    const attempts = (db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE scenario_id = ?').get(row.id) as { n: number }).n;
    if (attempts && ctx.url.searchParams.get('withAttempts') !== '1') {
      throw new HttpError(409, `У сценария ${attempts} попыток студентов. Они будут удалены вместе с ним: подтвердите удаление.`);
    }
    transaction(db, () => {
      db.prepare('DELETE FROM attempts WHERE scenario_id = ?').run(row.id);
      db.prepare('DELETE FROM scenarios WHERE id = ?').run(row.id);
    });
    return { ok: true, deletedAttempts: attempts };
  });

  // ---------- Попытки ----------
  router.add('GET', '/api/admin/attempts', 'admin', (ctx) => {
    const q = ctx.url.searchParams;
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.get('scenario')) { where.push('a.scenario_id = ?'); params.push(q.get('scenario')!); }
    const group = groupClause(q.get('group'));
    if (group.clause) { where.push(group.clause); params.push(...group.params); }
    if (q.get('q')) {
      // Поиск по ФИО и группе: ключи уже в нижнем регистре и без «ё» (SQLite не понижает регистр кириллицы).
      where.push("(st.name_key LIKE ? ESCAPE '\\' OR st.group_key LIKE ? ESCAPE '\\')");
      const like = `%${textKey(q.get('q')!).replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    if (q.get('status') === 'finished') where.push('a.finished_at IS NOT NULL');
    if (q.get('status') === 'active') where.push('a.finished_at IS NULL');
    if (q.get('from')) { where.push('a.started_at >= ?'); params.push(q.get('from')!); }
    if (q.get('to')) { where.push('a.started_at <= ?'); params.push(`${q.get('to')!}${q.get('to')!.length === 10 ? 'T23:59:59.999Z' : ''}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sorts: Record<string, string> = { date: 'a.started_at DESC', score: 'a.score DESC, a.started_at DESC', name: 'st.name_key ASC, a.started_at DESC', group: "st.group_key = '', st.group_key ASC, st.name_key ASC" };
    const order = sorts[q.get('sort') ?? 'date'] ?? sorts.date;
    const pageSize = Math.min(100, Math.max(1, Number(q.get('pageSize') ?? 25) || 25));
    const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
    const from = 'FROM attempts a LEFT JOIN students st ON st.id = a.student_id LEFT JOIN scenarios s ON s.id = a.scenario_id';
    const total = (db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...params) as { n: number }).n;
    const items = db
      .prepare(
        `SELECT a.id, a.scenario_id AS scenarioId, s.title AS scenarioTitle, a.student_name AS studentName, st.id AS studentId, COALESCE(st.group_name, '') AS "group",
                a.started_at AS startedAt, a.updated_at AS updatedAt, a.finished_at AS finishedAt, a.score, a.grade, a.messages_count AS messages, a.disclosed_count AS disclosed
         ${from} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize);
    return { items, total, page, pageSize };
  });

  router.add('GET', '/api/admin/attempts/:id', 'admin', (ctx) => {
    const row = db
      .prepare(
        `SELECT a.id, a.scenario_id AS scenarioId, s.title AS scenarioTitle, a.attempt_json AS json, COALESCE(st.group_name, '') AS "group", st.id AS studentId
         FROM attempts a LEFT JOIN scenarios s ON s.id = a.scenario_id LEFT JOIN students st ON st.id = a.student_id WHERE a.id = ?`,
      )
      .get(Number(ctx.params.id)) as { id: number; scenarioId: string; scenarioTitle: string | null; json: string; group: string; studentId: number | null } | undefined;
    if (!row) throw new HttpError(404, 'Попытка не найдена.');
    return { id: row.id, scenarioId: row.scenarioId, scenarioTitle: row.scenarioTitle, group: row.group, studentId: row.studentId, attempt: JSON.parse(row.json) as unknown };
  });

  router.add('GET', '/api/admin/attempts/:id/report.md', 'admin', (ctx) => {
    const row = db
      .prepare('SELECT a.id, a.scenario_id, s.title AS scenario_title, a.attempt_json FROM attempts a LEFT JOIN scenarios s ON s.id = a.scenario_id WHERE a.id = ?')
      .get(Number(ctx.params.id)) as { id: number; scenario_id: string; scenario_title: string | null; attempt_json: string } | undefined;
    if (!row) throw new HttpError(404, 'Попытка не найдена.');
    sendText(ctx.res, 200, attemptReportMd(row), 'text/markdown; charset=utf-8', { 'Content-Disposition': `attachment; filename="attempt-${row.id}.md"` });
    return undefined;
  });

  router.add('DELETE', '/api/admin/attempts/:id', 'admin', (ctx) => {
    const result = db.prepare('DELETE FROM attempts WHERE id = ?').run(Number(ctx.params.id));
    if (!result.changes) throw new HttpError(404, 'Попытка не найдена.');
    return { ok: true };
  });

  // ---------- Обратная связь ----------
  router.add('GET', '/api/admin/feedback', 'admin', (ctx) => {
    const q = ctx.url.searchParams;
    const pageSize = Math.min(100, Math.max(1, Number(q.get('pageSize') ?? 20) || 20));
    const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
    const filters = { scenario: q.get('scenario') || undefined, rating: q.get('rating') || undefined, q: q.get('q')?.trim() || undefined };
    return { ...listFeedback(db, filters, page, pageSize), summary: feedbackSummary(db, filters.scenario) };
  });

  // ---------- Статистика и отчёты ----------
  router.add('GET', '/api/admin/stats', 'admin', (ctx) => computeStats(db, ctx.url.searchParams.get('scenario') || undefined, ctx.url.searchParams.get('group') || undefined));

  router.add('GET', '/api/admin/reports/attempts.xlsx', 'admin', (ctx) => {
    sendBuffer(ctx.res, 200, attemptsXlsx(db, ctx.url.searchParams.get('scenario') || undefined, ctx.url.searchParams.get('group') || undefined), XLSX_MIME, { 'Content-Disposition': 'attachment; filename="attempts.xlsx"' });
    return undefined;
  });

  router.add('GET', '/api/admin/reports/scenario/:id', 'admin', (ctx) => {
    const text = scenarioReportMd(db, ctx.params.id);
    if (text === null) throw new HttpError(404, 'Сценарий не найден.');
    sendText(ctx.res, 200, text, 'text/markdown; charset=utf-8', { 'Content-Disposition': `attachment; filename="report-${ctx.params.id}.md"` });
    return undefined;
  });

  // ---------- Обработка запроса ----------
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  };

  function serveStatic(res: ServerResponse, pathname: string): boolean {
    if (!pathname.startsWith(config.basePath)) return false;
    const relative = decodeURIComponent(pathname.slice(config.basePath.length)) || 'index.html';
    const file = normalize(join(config.staticDir, relative));
    if (file !== config.staticDir && !file.startsWith(config.staticDir + sep)) throw new HttpError(403, 'Доступ запрещён.');
    const target = existsSync(file) && statSync(file).isFile() ? file : join(config.staticDir, 'index.html');
    if (!existsSync(target)) return false;
    const type = MIME[extname(target)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
    res.end(readFileSync(target));
    return true;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';
      const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
      const isPublicApi = url.pathname.startsWith('/api/public/') || url.pathname.startsWith('/api/student/');

      // CORS: только для публичного API студентов; админские запросы возможны лишь с того же адреса.
      if (isPublicApi) {
        res.setHeader('Access-Control-Allow-Origin', config.publicOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '600');
        if (method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
      }

      if (url.pathname.startsWith('/api/')) {
        const found = router.find(method, url.pathname);
        if (!found) throw new HttpError(404, 'Не найдено.');
        if (found === 'method') throw new HttpError(405, 'Метод не поддерживается.');
        const { route, params } = found;
        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
        const user = userBySession(db, token);
        if (route.access === 'admin') {
          if (!user) throw new HttpError(401, 'Требуется вход.');
          // Защита от CSRF: изменения только с собственным заголовком, который чужой сайт без CORS отправить не может.
          if (method !== 'GET' && req.headers['x-requested-with'] !== 'tzp') throw new HttpError(403, 'Запрос отклонён.');
        } else if (method === 'POST' && !isPublicApi && req.headers['x-requested-with'] !== 'tzp') {
          throw new HttpError(403, 'Запрос отклонён.');
        }
        const ctx: Ctx = {
          req, res, url, params, ip, user,
          json: async <T>(limit = 1_000_000) => {
            const text = await readBody(req, limit);
            try {
              return JSON.parse(text) as T;
            } catch {
              throw new HttpError(400, 'Тело запроса не является JSON.');
            }
          },
        };
        const result = await route.handler(ctx);
        if (!res.headersSent) sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        if (url.pathname === '/') {
          res.writeHead(302, { Location: config.basePath });
          res.end();
          return;
        }
        if (serveStatic(res, url.pathname)) return;
      }
      throw new HttpError(404, 'Не найдено.');
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) sendJson(res, error.status, { error: error.message });
      else {
        console.error(error);
        sendJson(res, 500, { error: 'Внутренняя ошибка сервера.' });
      }
    }
  }

  const server = createServer((req, res) => void handle(req, res));
  return { server, handle, router };
}
