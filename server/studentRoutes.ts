// API студента: регистрация (ФИО + группа), вход по личному коду, личный кабинет, сохранение попыток.
// Студент подтверждает себя токеном в заголовке Authorization (не cookie): сайт может стоять на другом адресе.
import { normalizeCode } from '../src/shared/resumeCode.ts';
import { isObject, MAX_ATTEMPT_BYTES, validateAttemptPayload } from './attemptPayload.ts';
import type { Db } from './db.ts';
import { syncFeedback } from './feedback.ts';
import { HttpError, RateLimiter, sendJson, type Router } from './http.ts';
import { uniqueCode } from './resume.ts';
import {
  bearerToken, cleanFullName, cleanGroup, createStudent, createStudentSession, destroyStudentSession, requireStudent, studentView, type StudentRow,
} from './students.ts';

type Deps = {
  db: Db;
  /** Описание сценария для сайта студента или undefined, если такого сценария нет. */
  scenarioPayload: (id: string) => unknown;
};

type StoredAttempt = { id: number; scenario_id: string; student_id: number | null; finished_at: string | null; rev: number; attempt_json: string };

export function registerStudentRoutes(router: Router, { db, scenarioPayload }: Deps) {
  const registerLimiter = new RateLimiter(20, 60 * 60_000);
  const loginLimiter = new RateLimiter(40, 10 * 60_000);
  const submitLimiter = new RateLimiter(240, 60_000);

  const stamp = (student: StudentRow, token: string) => ({ student: studentView(student), token });

  router.add('GET', '/api/student/groups', 'public', () => ({
    // Подсказка при регистрации: так группа пишется одинаково у всех.
    groups: (db.prepare("SELECT group_name AS name FROM students WHERE group_name <> '' GROUP BY group_key ORDER BY group_name").all() as { name: string }[]).map((g) => g.name),
  }));

  router.add('POST', '/api/student/register', 'public', async (ctx) => {
    if (!registerLimiter.take(ctx.ip)) throw new HttpError(429, 'Слишком много регистраций с этого адреса. Попробуйте позже.');
    const body = await ctx.json<{ fullName?: unknown; group?: unknown }>(10_000);
    const student = createStudent(db, cleanFullName(body.fullName), cleanGroup(body.group));
    return stamp(student, createStudentSession(db, student.id));
  });

  router.add('POST', '/api/student/login', 'public', async (ctx) => {
    if (!loginLimiter.take(ctx.ip)) throw new HttpError(429, 'Слишком много попыток входа. Подождите несколько минут.');
    const body = await ctx.json<{ code?: unknown }>(10_000);
    const code = normalizeCode(body.code);
    const student = code ? (db.prepare('SELECT * FROM students WHERE code = ?').get(code) as StudentRow | undefined) : undefined;
    // Неверный, неполный и несуществующий код неотличимы.
    if (!student) throw new HttpError(401, 'Код не подходит. Проверьте слова и их порядок или попросите преподавателя выдать новый.');
    db.prepare('UPDATE students SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), student.id);
    return stamp(student, createStudentSession(db, student.id));
  });

  router.add('POST', '/api/student/logout', 'public', (ctx) => {
    const token = bearerToken(ctx.req);
    if (token) destroyStudentSession(db, token);
    return { ok: true };
  });

  /** Кабинет: профиль и история попыток. */
  router.add('GET', '/api/student/me', 'public', (ctx) => {
    const student = requireStudent(db, ctx.req);
    const attempts = db
      .prepare(
        `SELECT a.resume_code AS key, a.scenario_id AS scenarioId, s.title AS scenarioTitle, a.started_at AS startedAt, a.updated_at AS updatedAt,
                a.finished_at AS finishedAt, a.score, a.grade, a.messages_count AS questions, a.disclosed_count AS disclosed
         FROM attempts a LEFT JOIN scenarios s ON s.id = a.scenario_id WHERE a.student_id = ? ORDER BY a.started_at DESC, a.id DESC`,
      )
      .all(student.id);
    return { student: studentView(student), attempts };
  });

  /** Открыть свою попытку: переписка, реестр, ТЗ и сценарий, по которому она шла. */
  router.add('GET', '/api/student/attempts/:key', 'public', (ctx) => {
    const student = requireStudent(db, ctx.req);
    const key = normalizeCode(ctx.params.key);
    const row = key
      ? (db.prepare('SELECT scenario_id, rev, attempt_json FROM attempts WHERE resume_code = ? AND student_id = ?').get(key, student.id) as
          | { scenario_id: string; rev: number; attempt_json: string }
          | undefined)
      : undefined;
    const scenario = row ? scenarioPayload(row.scenario_id) : undefined;
    if (!row || !scenario) throw new HttpError(404, 'Попытка не найдена.');
    return { attempt: JSON.parse(row.attempt_json) as unknown, rev: row.rev, scenario };
  });

  router.add('POST', '/api/student/attempts', 'public', async (ctx) => {
    const student = requireStudent(db, ctx.req);
    if (!submitLimiter.take(`student:${student.id}`)) throw new HttpError(429, 'Слишком много запросов.');
    const body = await ctx.json<unknown>(MAX_ATTEMPT_BYTES);
    const scenarioId = isObject(body) && typeof body.scenarioId === 'string' ? body.scenarioId : '';
    if (!scenarioId) throw new HttpError(400, 'Не указан scenarioId.');
    if (!scenarioPayload(scenarioId)) throw new HttpError(404, 'Сценарий не найден.');
    const data = validateAttemptPayload(body, scenarioId);
    const input = body as { baseRev?: unknown; force?: unknown };
    const baseRev = typeof input.baseRev === 'number' && Number.isInteger(input.baseRev) ? input.baseRev : null;
    const force = input.force === true;
    const now = new Date().toISOString();

    // Личность и группа берутся из аккаунта, что бы ни прислал сайт.
    const identity = { studentName: student.full_name, studentGroup: student.group_name, studentId: student.id };
    const code = normalizeCode(data.attempt.resumeCode);
    if (data.attempt.resumeCode !== undefined && data.attempt.resumeCode !== null && !code) throw new HttpError(400, 'Неверный номер попытки.');
    const columns = 'id, scenario_id, student_id, finished_at, rev, attempt_json';
    const existing = (code ? db.prepare(`SELECT ${columns} FROM attempts WHERE resume_code = ?`).get(code) : undefined) as StoredAttempt | undefined;

    if (existing) {
      if (existing.student_id !== student.id) throw new HttpError(403, 'Эта попытка принадлежит другому студенту.');
      if (existing.scenario_id !== scenarioId) throw new HttpError(409, 'Номер попытки относится к другому сценарию.');
      // Другое устройство сохранило более новую версию: свою нельзя отправлять молча, иначе она её затрёт.
      if (!force && baseRev !== null && existing.rev !== baseRev) {
        const stored = JSON.parse(existing.attempt_json) as Record<string, unknown>;
        sendJson(ctx.res, 409, { error: 'conflict', rev: existing.rev, attempt: stored });
        return undefined;
      }
      // Завершённая попытка не откатывается к незавершённой: так запоздалая отправка не затирает результат.
      if (existing.finished_at && !data.finishedAt) return { ok: true, rev: existing.rev, code, ignored: true };
      Object.assign(data.attempt, identity, { resumeCode: code });
      const rev = existing.rev + 1;
      db.prepare(
        'UPDATE attempts SET updated_at = ?, finished_at = ?, score = ?, grade = ?, messages_count = ?, disclosed_count = ?, attempt_json = ?, student_name = ?, rev = ? WHERE id = ?',
      ).run(now, data.finishedAt, data.score, data.grade, data.studentMessages, data.disclosed, JSON.stringify(data.attempt), student.full_name, rev, existing.id);
      syncFeedback(db, existing.id, scenarioId, student.full_name, data.attempt.messages as unknown[]);
      return { ok: true, rev, code };
    }

    const finalCode = code ?? uniqueCode(db);
    Object.assign(data.attempt, identity, { resumeCode: finalCode });
    const result = db
      .prepare(
        `INSERT INTO attempts (client_key, scenario_id, student_id, student_name, started_at, updated_at, finished_at, score, grade, messages_count, disclosed_count, attempt_json, resume_code, rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(`code:${finalCode}`, scenarioId, student.id, student.full_name, data.startedAt, now, data.finishedAt, data.score, data.grade, data.studentMessages, data.disclosed, JSON.stringify(data.attempt), finalCode);
    syncFeedback(db, Number(result.lastInsertRowid), scenarioId, student.full_name, data.attempt.messages as unknown[]);
    return { ok: true, rev: 1, code: finalCode };
  });
}
