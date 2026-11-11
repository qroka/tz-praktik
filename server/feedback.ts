// Обратная связь студентов: лайки и дизлайки на ответы заказчика.
// Оценки живут в JSON попытки; для поиска и статистики они дублируются в таблице feedback.
import type { Db } from './db.ts';

type Message = {
  id?: unknown;
  role?: unknown;
  text?: unknown;
  intentId?: unknown;
  topic?: unknown;
  feedback?: { rating?: unknown; reason?: unknown; at?: unknown };
};

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

/** Заменяет оценки попытки теми, что есть в присланном JSON: снятая студентом оценка исчезает и здесь. */
export function syncFeedback(db: Db, attemptId: number, scenarioId: string, studentName: string, messages: unknown[]): void {
  db.prepare('DELETE FROM feedback WHERE attempt_id = ?').run(attemptId);
  const insert = db.prepare(
    `INSERT OR REPLACE INTO feedback (attempt_id, scenario_id, student_name, message_id, rating, reason, at, question, answer, intent_id, topic)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let lastStudentQuestion = '';
  for (const raw of messages) {
    const message = raw as Message;
    if (message?.role === 'student') {
      lastStudentQuestion = text(message.text, 1000);
      continue;
    }
    const rating = message?.feedback?.rating;
    if (message?.role !== 'customer' || (rating !== 'like' && rating !== 'dislike')) continue;
    insert.run(
      attemptId,
      scenarioId,
      studentName,
      text(message.id, 100),
      rating,
      text(message.feedback?.reason, 500),
      text(message.feedback?.at, 40) || new Date().toISOString(),
      lastStudentQuestion,
      text(message.text, 2000),
      text(message.intentId, 100) || null,
      text(message.topic, 100) || null,
    );
  }
}

/** Разовый перенос оценок из уже сохранённых попыток (миграция). */
export function backfillFeedback(db: Db): void {
  const rows = db.prepare('SELECT id, scenario_id, student_name, attempt_json FROM attempts').all() as { id: number; scenario_id: string; student_name: string; attempt_json: string }[];
  for (const row of rows) {
    try {
      const attempt = JSON.parse(row.attempt_json) as { messages?: unknown[] };
      if (Array.isArray(attempt.messages)) syncFeedback(db, row.id, row.scenario_id, row.student_name, attempt.messages);
    } catch {
      // Повреждённую попытку пропускаем: остальные переносятся.
    }
  }
}

type Filters = { scenario?: string; rating?: string; q?: string };

function where(filters: Filters): { clause: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (filters.scenario) { parts.push('f.scenario_id = ?'); params.push(filters.scenario); }
  if (filters.rating === 'like' || filters.rating === 'dislike') { parts.push('f.rating = ?'); params.push(filters.rating); }
  if (filters.q) {
    parts.push("(f.question LIKE ? ESCAPE '\\' OR f.answer LIKE ? ESCAPE '\\' OR f.reason LIKE ? ESCAPE '\\' OR f.student_name LIKE ? ESCAPE '\\')");
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(like, like, like, like);
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

export function listFeedback(db: Db, filters: Filters, page: number, pageSize: number) {
  const { clause, params } = where(filters);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM feedback f ${clause}`).get(...params) as { n: number }).n;
  const items = db
    .prepare(
      `SELECT f.id, f.attempt_id AS attemptId, f.scenario_id AS scenarioId, s.title AS scenarioTitle, f.student_name AS studentName, f.rating, f.reason, f.at,
              f.question, f.answer, f.intent_id AS intentId, f.topic
       FROM feedback f LEFT JOIN scenarios s ON s.id = f.scenario_id ${clause}
       ORDER BY f.at DESC, f.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export function feedbackSummary(db: Db, scenario?: string) {
  const { clause, params } = where({ scenario });
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(f.rating = 'like'), 0) AS likes, COALESCE(SUM(f.rating = 'dislike'), 0) AS dislikes,
              COUNT(DISTINCT f.attempt_id) AS attempts, COUNT(DISTINCT lower(f.student_name)) AS students,
              COALESCE(SUM(f.rating = 'dislike' AND f.reason <> ''), 0) AS dislikesWithReason
       FROM feedback f ${clause}`,
    )
    .get(...params) as { total: number; likes: number; dislikes: number; attempts: number; students: number; dislikesWithReason: number };
  // Ответы по темам (намерениям), которые чаще всего получают дизлайк: что чинить в сценарии в первую очередь.
  const problems = db
    .prepare(
      `SELECT f.scenario_id AS scenarioId, f.intent_id AS intentId, MAX(f.topic) AS topic,
              SUM(f.rating = 'dislike') AS dislikes, SUM(f.rating = 'like') AS likes, COUNT(*) AS total,
              (SELECT f2.question FROM feedback f2 WHERE f2.scenario_id = f.scenario_id AND COALESCE(f2.intent_id, '') = COALESCE(f.intent_id, '') AND f2.rating = 'dislike' ORDER BY f2.at DESC LIMIT 1) AS sampleQuestion,
              (SELECT f2.answer FROM feedback f2 WHERE f2.scenario_id = f.scenario_id AND COALESCE(f2.intent_id, '') = COALESCE(f.intent_id, '') AND f2.rating = 'dislike' ORDER BY f2.at DESC LIMIT 1) AS sampleAnswer
       FROM feedback f ${clause}
       GROUP BY f.scenario_id, COALESCE(f.intent_id, '')
       HAVING dislikes > 0
       ORDER BY dislikes DESC, total DESC LIMIT 10`,
    )
    .all(...params);
  return { ...totals, problems };
}
