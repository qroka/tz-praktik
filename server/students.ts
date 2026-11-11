// Аккаунты студентов: ФИО, группа, личный код для входа, сессии.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { generateCode } from '../src/shared/resumeCode.ts';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';

export const STUDENT_SESSION_DAYS = 180;

export type StudentRow = {
  id: number;
  full_name: string;
  name_key: string;
  group_name: string;
  group_key: string;
  identity_key: string;
  code: string;
  created_at: string;
  last_login_at: string | null;
};

/** Что студент видит о себе. */
export type StudentView = { id: number; fullName: string; group: string; code: string };

export const studentView = (row: StudentRow): StudentView => ({ id: row.id, fullName: row.full_name, group: row.group_name, code: row.code });

/** Ключ для сравнения: регистр, «ё» и повторные пробелы не важны. SQLite сравнивает без учёта регистра только латиницу, поэтому ключи считаем здесь. */
export const textKey = (text: string): string => text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

export function cleanFullName(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, 'Укажите ФИО.');
  const value = collapse(raw);
  if (value.length < 3 || value.length > 120) throw new HttpError(400, 'ФИО: от 3 до 120 символов.');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(value)) throw new HttpError(400, 'ФИО: только буквы, пробелы, точки, дефис и апостроф.');
  if (value.split(' ').length < 2) throw new HttpError(400, 'Укажите фамилию и имя полностью.');
  return value;
}

export function cleanGroup(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, 'Укажите группу.');
  const value = collapse(raw);
  if (!value) throw new HttpError(400, 'Укажите группу.');
  if (value.length > 40) throw new HttpError(400, 'Группа: не больше 40 символов.');
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s\-._/№()]*$/u.test(value)) throw new HttpError(400, 'Группа: буквы, цифры, пробел и знаки - . _ / № ( ).');
  return value;
}

/** Группа в том написании, которое уже встречается у других студентов: «ис-21» и «ИС-21» — одна группа. */
export function canonicalGroup(db: Db, group: string): string {
  if (!group) return '';
  const found = db.prepare('SELECT group_name FROM students WHERE group_key = ? ORDER BY id LIMIT 1').get(textKey(group)) as { group_name: string } | undefined;
  return found?.group_name ?? group;
}

export function uniqueStudentCode(db: Db): string {
  for (let i = 0; i < 30; i++) {
    const code = generateCode((max) => randomInt(max));
    if (!db.prepare('SELECT 1 FROM students WHERE code = ?').get(code)) return code;
  }
  throw new Error('Не удалось подобрать свободный код студента.');
}

const identityOf = (fullName: string, group: string) => `${textKey(fullName)}|${textKey(group)}`;

export function createStudent(db: Db, fullName: string, group: string, code?: string): StudentRow {
  const finalGroup = canonicalGroup(db, group);
  const identity = identityOf(fullName, finalGroup);
  if (db.prepare('SELECT 1 FROM students WHERE identity_key = ?').get(identity)) {
    throw new HttpError(409, 'Студент с таким ФИО и группой уже зарегистрирован. Войдите по своему коду или попросите преподавателя выдать новый.');
  }
  const result = db
    .prepare('INSERT INTO students (full_name, name_key, group_name, group_key, identity_key, code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(fullName, textKey(fullName), finalGroup, textKey(finalGroup), identity, code ?? uniqueStudentCode(db), new Date().toISOString());
  return db.prepare('SELECT * FROM students WHERE id = ?').get(Number(result.lastInsertRowid)) as StudentRow;
}

/** Меняет ФИО и/или группу. Дубликат другого студента не допускается. */
export function updateStudent(db: Db, id: number, fullName: string, group: string): void {
  const finalGroup = canonicalGroup(db, group);
  const identity = identityOf(fullName, finalGroup);
  const clash = db.prepare('SELECT id FROM students WHERE identity_key = ? AND id <> ?').get(identity, id);
  if (clash) throw new HttpError(409, 'Другой студент с таким ФИО и группой уже есть.');
  db.prepare('UPDATE students SET full_name = ?, name_key = ?, group_name = ?, group_key = ?, identity_key = ? WHERE id = ?').run(
    fullName, textKey(fullName), finalGroup, textKey(finalGroup), identity, id,
  );
  // В списках и отчётах имя берётся из попытки: обновляем и колонку, и сохранённый JSON.
  db.prepare('UPDATE attempts SET student_name = ? WHERE student_id = ?').run(fullName, id);
  const rows = db.prepare('SELECT id, attempt_json FROM attempts WHERE student_id = ?').all(id) as { id: number; attempt_json: string }[];
  for (const row of rows) {
    try {
      const json = JSON.stringify({ ...(JSON.parse(row.attempt_json) as object), studentName: fullName, studentGroup: finalGroup });
      db.prepare('UPDATE attempts SET attempt_json = ? WHERE id = ?').run(json, row.id);
    } catch {
      // Повреждённую попытку пропускаем.
    }
  }
}

// ---------- сессии ----------
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function createStudentSession(db: Db, studentId: number): string {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  db.prepare('DELETE FROM student_sessions WHERE expires_at < ?').run(now.toISOString());
  db.prepare('INSERT INTO student_sessions (token_hash, student_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha(token), studentId, now.toISOString(), new Date(now.getTime() + STUDENT_SESSION_DAYS * 86_400_000).toISOString(),
  );
  return token;
}

export function studentBySession(db: Db, token: string): StudentRow | undefined {
  return db
    .prepare('SELECT st.* FROM student_sessions s JOIN students st ON st.id = s.student_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(sha(token), new Date().toISOString()) as StudentRow | undefined;
}

export const destroyStudentSession = (db: Db, token: string) => void db.prepare('DELETE FROM student_sessions WHERE token_hash = ?').run(sha(token));
export const destroyStudentSessions = (db: Db, studentId: number) => void db.prepare('DELETE FROM student_sessions WHERE student_id = ?').run(studentId);

export function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(header) : null;
  return match ? match[1] : null;
}

export function requireStudent(db: Db, req: IncomingMessage): StudentRow {
  const token = bearerToken(req);
  const student = token ? studentBySession(db, token) : undefined;
  if (!student) throw new HttpError(401, 'Войдите в личный кабинет.');
  return student;
}

/**
 * Миграция: аккаунты для уже сохранённых попыток. Один студент на каждое имя; его код — код последней попытки,
 * поэтому выданные раньше коды продолжают работать как вход в кабинет. Группа не известна: её проставляет преподаватель.
 */
export function backfillStudents(db: Db): void {
  const rows = db.prepare('SELECT id, student_name, resume_code FROM attempts ORDER BY started_at DESC, id DESC').all() as {
    id: number;
    student_name: string;
    resume_code: string | null;
  }[];
  const byName = new Map<string, number>();
  for (const row of rows) {
    const key = textKey(row.student_name);
    let studentId = byName.get(key);
    if (studentId === undefined) {
      const name = collapse(row.student_name) || 'Без имени';
      const taken = row.resume_code && !db.prepare('SELECT 1 FROM students WHERE code = ?').get(row.resume_code);
      studentId = createStudent(db, name, '', taken ? (row.resume_code as string) : undefined).id;
      byName.set(key, studentId);
    }
    db.prepare('UPDATE attempts SET student_id = ? WHERE id = ?').run(studentId, row.id);
  }
}
