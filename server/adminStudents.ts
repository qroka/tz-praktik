// Студенты в панели преподавателя: список, группы, добавление, правка, выдача нового кода.
import type { Db } from './db.ts';
import { transaction } from './db.ts';
import { HttpError, sendBuffer, type Router } from './http.ts';
import {
  canonicalGroup, cleanFullName, cleanGroup, createStudent, destroyStudentSessions, textKey, uniqueStudentCode, updateStudent, type StudentRow,
} from './students.ts';
import { buildXlsx, XLSX_MIME } from './xlsx.ts';

/** Значение фильтра «студенты без группы» (их создала миграция из старых попыток). */
export const NO_GROUP = '__none__';

/** Условие по группе для запросов, где студенты доступны как st. */
export function groupClause(group: string | null | undefined, column = 'st.group_key'): { clause: string; params: string[] } {
  if (!group) return { clause: '', params: [] };
  return { clause: `${column} = ?`, params: [group === NO_GROUP ? '' : textKey(group)] };
}

type ListRow = {
  id: number; fullName: string; group: string; code: string; createdAt: string; lastLoginAt: string | null;
  attempts: number; finished: number; bestScore: number | null; lastAttemptAt: string | null;
};

const parseId = (text: string) => {
  const id = Number(text);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Неверный номер студента.');
  return id;
};

export function registerAdminStudentRoutes(router: Router, db: Db) {
  const find = (id: number) => {
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as StudentRow | undefined;
    if (!row) throw new HttpError(404, 'Студент не найден.');
    return row;
  };

  const where = (q: URLSearchParams) => {
    const parts: string[] = [];
    const params: string[] = [];
    const group = groupClause(q.get('group') || undefined, 'st.group_key');
    if (group.clause) { parts.push(group.clause); params.push(...group.params); }
    const text = q.get('q')?.trim();
    if (text) {
      const like = `%${textKey(text).replace(/[\\%_]/g, '\\$&')}%`;
      parts.push("(st.name_key LIKE ? ESCAPE '\\' OR st.group_key LIKE ? ESCAPE '\\' OR st.code LIKE ? ESCAPE '\\')");
      params.push(like, like, `%${text.toLowerCase().replace(/\s+/g, '-').replace(/[\\%_]/g, '\\$&')}%`);
    }
    return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
  };

  const SELECT = `SELECT st.id, st.full_name AS fullName, st.group_name AS "group", st.code, st.created_at AS createdAt, st.last_login_at AS lastLoginAt,
      COUNT(a.id) AS attempts, COALESCE(SUM(CASE WHEN a.finished_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS finished, MAX(a.score) AS bestScore, MAX(a.started_at) AS lastAttemptAt
    FROM students st LEFT JOIN attempts a ON a.student_id = st.id`;

  const groups = () =>
    (db.prepare("SELECT MAX(group_name) AS name, COUNT(*) AS students FROM students GROUP BY group_key ORDER BY group_key = '', MAX(group_name)").all() as { name: string; students: number }[]).map(
      (g) => ({ name: g.name, students: g.students }),
    );

  router.add('GET', '/api/admin/students', 'admin', (ctx) => {
    const q = ctx.url.searchParams;
    const { clause, params } = where(q);
    const pageSize = Math.min(200, Math.max(1, Number(q.get('pageSize') ?? 25) || 25));
    const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
    const sorts: Record<string, string> = {
      name: 'st.name_key ASC',
      group: "st.group_key = '', st.group_key ASC, st.name_key ASC",
      recent: 'lastAttemptAt IS NULL, lastAttemptAt DESC, st.name_key ASC',
      score: 'bestScore IS NULL, bestScore DESC, st.name_key ASC',
    };
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM students st ${clause}`).get(...params) as { n: number }).n;
    const items = db.prepare(`${SELECT} ${clause} GROUP BY st.id ORDER BY ${sorts[q.get('sort') ?? 'name'] ?? sorts.name} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as ListRow[];
    return { items, total, page, pageSize, groups: groups() };
  });

  router.add('POST', '/api/admin/students', 'admin', async (ctx) => {
    const body = await ctx.json<{ fullName?: unknown; group?: unknown }>(10_000);
    const student = createStudent(db, cleanFullName(body.fullName), cleanGroup(body.group));
    return { id: student.id, fullName: student.full_name, group: student.group_name, code: student.code };
  });

  /** Список группы одним действием: строки «ФИО; группа» (разделитель ; , или табуляция). Группа по умолчанию подставляется, если в строке её нет. */
  router.add('POST', '/api/admin/students/bulk', 'admin', async (ctx) => {
    const body = await ctx.json<{ text?: unknown; group?: unknown }>(200_000);
    if (typeof body.text !== 'string' || !body.text.trim()) throw new HttpError(400, 'Вставьте список студентов: по одному на строку.');
    const lines = body.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 500) throw new HttpError(400, 'Не больше 500 строк за раз.');
    const defaultGroup = typeof body.group === 'string' && body.group.trim() ? body.group : undefined;
    const created: { id: number; fullName: string; group: string; code: string }[] = [];
    const skipped: { line: string; reason: string }[] = [];
    transaction(db, () => {
      for (const line of lines) {
        const [name, groupInLine] = line.split(/[;\t,]/).map((part) => part.trim());
        try {
          const student = createStudent(db, cleanFullName(name), cleanGroup(groupInLine || defaultGroup));
          created.push({ id: student.id, fullName: student.full_name, group: student.group_name, code: student.code });
        } catch (error) {
          skipped.push({ line, reason: error instanceof HttpError ? error.message : 'Не удалось добавить.' });
        }
      }
    });
    return { created, skipped };
  });

  router.add('PATCH', '/api/admin/students/:id', 'admin', async (ctx) => {
    const student = find(parseId(ctx.params.id));
    const body = await ctx.json<{ fullName?: unknown; group?: unknown }>(10_000);
    const fullName = body.fullName === undefined ? student.full_name : cleanFullName(body.fullName);
    // Группу можно оставить пустой только у студента, которому её ещё не назначали.
    const group = body.group === undefined ? student.group_name : cleanGroup(body.group);
    transaction(db, () => updateStudent(db, student.id, fullName, group));
    return { ok: true, group: canonicalGroup(db, group) };
  });

  /** Новый код: старый перестаёт работать, все входы студента закрываются. */
  router.add('POST', '/api/admin/students/:id/reissue-code', 'admin', (ctx) => {
    const student = find(parseId(ctx.params.id));
    const code = uniqueStudentCode(db);
    transaction(db, () => {
      db.prepare('UPDATE students SET code = ? WHERE id = ?').run(code, student.id);
      destroyStudentSessions(db, student.id);
    });
    return { code };
  });

  router.add('DELETE', '/api/admin/students/:id', 'admin', (ctx) => {
    const student = find(parseId(ctx.params.id));
    const attempts = (db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?').get(student.id) as { n: number }).n;
    if (attempts && ctx.url.searchParams.get('withAttempts') !== '1') {
      throw new HttpError(409, `У студента ${attempts} попыток. Они будут удалены вместе с ним: подтвердите удаление.`);
    }
    transaction(db, () => {
      db.prepare('DELETE FROM attempts WHERE student_id = ?').run(student.id);
      db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
    });
    return { ok: true, deletedAttempts: attempts };
  });

  /** Список кодов для раздачи (печать на листе): ФИО, группа, код для входа. */
  router.add('GET', '/api/admin/students/codes.xlsx', 'admin', (ctx) => {
    const { clause, params } = where(ctx.url.searchParams);
    const rows = db.prepare(`SELECT st.full_name, st.group_name, st.code FROM students st ${clause} ORDER BY st.group_key = '', st.group_key, st.name_key`).all(...params) as {
      full_name: string; group_name: string; code: string;
    }[];
    const file = buildXlsx([{ name: 'Коды для входа', header: ['ФИО', 'Группа', 'Код для входа'], rows: rows.map((r) => [r.full_name, r.group_name, r.code]) }]);
    sendBuffer(ctx.res, 200, file, XLSX_MIME, { 'Content-Disposition': 'attachment; filename="student-codes.xlsx"' });
    return undefined;
  });
}
