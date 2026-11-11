// Статистика по попыткам. Всё считается из сохранённых JSON завершённых попыток, поэтому
// серверу не нужен код сценария: перечень сведений приходит в result.etalon.
import { groupClause } from './adminStudents.ts';
import type { Db } from './db.ts';

type AttemptRow = {
  id: number;
  scenario_id: string;
  student_name: string;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  grade: string | null;
  messages_count: number;
  attempt_json: string;
};

type Etalon = { factId: string; section: number; category: string; label: string; requirementType: string; disclosed: boolean; inRegistry: boolean; inTz: boolean };
type Result = {
  parts?: { id: string; label: string; score: number; max: number }[];
  penalties?: { id: string; label: string; points: number }[];
  etalon?: Etalon[];
  missedCategories?: string[];
  generalQuestions?: { text: string }[];
};

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const average = (values: number[]) => (values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeStats(db: Db, scenarioId?: string, group?: string) {
  const filters: string[] = [];
  const params: string[] = [];
  if (scenarioId) { filters.push('a.scenario_id = ?'); params.push(scenarioId); }
  const byGroup = groupClause(group);
  if (byGroup.clause) { filters.push(byGroup.clause); params.push(...byGroup.params); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT a.id, a.scenario_id, a.student_name, a.started_at, a.finished_at, a.score, a.grade, a.messages_count, a.attempt_json
       FROM attempts a LEFT JOIN students st ON st.id = a.student_id ${where}`,
    )
    .all(...params) as AttemptRow[];
  const finished = rows.filter((row) => row.finished_at && row.score !== null);
  const scores = finished.map((row) => row.score as number);

  const minutes = finished
    .map((row) => (Date.parse(row.finished_at as string) - Date.parse(row.started_at)) / 60_000)
    .filter((value) => Number.isFinite(value) && value >= 0);

  const grades: Record<string, number> = {};
  for (const row of finished) grades[row.grade ?? '—'] = (grades[row.grade ?? '—'] ?? 0) + 1;

  const byDay: Record<string, number> = {};
  for (const row of rows) {
    const day = row.started_at.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  const facts = new Map<string, { label: string; section: number; category: string; requirementType: string; seen: number; disclosed: number; inRegistry: number; inTz: number }>();
  const parts = new Map<string, { label: string; score: number; max: number; count: number }>();
  const penalties = new Map<string, { label: string; count: number; points: number }>();
  const missed = new Map<string, number>();
  const general = new Map<string, number>();

  for (const row of finished) {
    let result: Result | null = null;
    try {
      result = (JSON.parse(row.attempt_json) as { result?: Result | null }).result ?? null;
    } catch {
      result = null;
    }
    if (!result) continue;
    for (const item of result.etalon ?? []) {
      const entry = facts.get(item.factId) ?? { label: item.label, section: item.section, category: item.category, requirementType: item.requirementType, seen: 0, disclosed: 0, inRegistry: 0, inTz: 0 };
      entry.seen++;
      if (item.disclosed) entry.disclosed++;
      if (item.inRegistry) entry.inRegistry++;
      if (item.inTz) entry.inTz++;
      facts.set(item.factId, entry);
    }
    for (const part of result.parts ?? []) {
      const entry = parts.get(part.id) ?? { label: part.label, score: 0, max: part.max, count: 0 };
      entry.score += part.score;
      entry.count++;
      parts.set(part.id, entry);
    }
    for (const penalty of result.penalties ?? []) {
      const entry = penalties.get(penalty.id) ?? { label: penalty.label, count: 0, points: 0 };
      entry.count++;
      entry.points += penalty.points;
      penalties.set(penalty.id, entry);
    }
    for (const category of result.missedCategories ?? []) missed.set(category, (missed.get(category) ?? 0) + 1);
    for (const question of result.generalQuestions ?? []) {
      const key = question.text.trim().toLowerCase();
      if (key) general.set(key, (general.get(key) ?? 0) + 1);
    }
  }

  const pct = (part: number, whole: number) => (whole ? round((part / whole) * 100, 0) : 0);

  const scenarios = db
    .prepare(
      `SELECT s.id AS id, s.title AS title, s.is_current AS isCurrent,
              COUNT(a.id) AS attempts,
              SUM(CASE WHEN a.finished_at IS NOT NULL THEN 1 ELSE 0 END) AS finished,
              AVG(a.score) AS avgScore
       FROM scenarios s LEFT JOIN attempts a ON a.scenario_id = s.id
       GROUP BY s.id ORDER BY s.is_current DESC, s.title`,
    )
    .all() as { id: string; title: string; isCurrent: number; attempts: number; finished: number | null; avgScore: number | null }[];

  return {
    scenarioId: scenarioId ?? null,
    totals: {
      attempts: rows.length,
      finished: finished.length,
      inProgress: rows.length - finished.length,
      students: new Set(rows.map((row) => row.student_name.trim().toLowerCase())).size,
      avgScore: average(scores),
      medianScore: median(scores),
      minScore: scores.length ? Math.min(...scores) : null,
      maxScore: scores.length ? Math.max(...scores) : null,
      avgMinutes: average(minutes),
      avgQuestions: average(rows.map((row) => row.messages_count)),
    },
    grades: Object.entries(grades).map(([grade, count]) => ({ grade, count })),
    byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([day, count]) => ({ day, count })),
    scenarios: scenarios.map((row) => ({ ...row, isCurrent: Boolean(row.isCurrent), finished: row.finished ?? 0, avgScore: row.avgScore === null ? null : round(row.avgScore) })),
    parts: [...parts.entries()].map(([id, value]) => ({ id, label: value.label, avg: round(value.score / value.count), max: value.max })),
    facts: [...facts.entries()]
      .map(([factId, value]) => ({
        factId,
        label: value.label,
        section: value.section,
        category: value.category,
        requirementType: value.requirementType,
        disclosedPct: pct(value.disclosed, value.seen),
        inRegistryPct: pct(value.inRegistry, value.seen),
        inTzPct: pct(value.inTz, value.seen),
      }))
      .sort((a, b) => a.disclosedPct - b.disclosedPct || a.inTzPct - b.inTzPct),
    penalties: [...penalties.entries()].map(([id, value]) => ({ id, label: value.label, count: value.count, points: value.points })).sort((a, b) => b.count - a.count),
    missedCategories: [...missed.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    topGeneralQuestions: [...general.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
