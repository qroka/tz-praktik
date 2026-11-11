// Отчёты: таблица Excel (.xlsx) и Markdown по сценарию и по одной попытке.
import { TZ_SECTION_TITLES } from './config.ts';
import type { Db } from './db.ts';
import { computeStats } from './stats.ts';
import { groupClause } from './adminStudents.ts';
import { buildXlsx } from './xlsx.ts';

type AttemptRow = {
  id: number;
  scenario_id: string;
  scenario_title: string | null;
  student_name: string;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  grade: string | null;
  messages_count: number;
  disclosed_count: number;
  group_name: string;
};

/** Таблица попыток для Excel. Время — московское (у Excel нет часовых поясов). */
export function attemptsXlsx(db: Db, scenarioId?: string, group?: string): Buffer {
  const filters: string[] = [];
  const params: string[] = [];
  if (scenarioId) { filters.push('a.scenario_id = ?'); params.push(scenarioId); }
  const byGroup = groupClause(group);
  if (byGroup.clause) { filters.push(byGroup.clause); params.push(...byGroup.params); }
  const rows = db
    .prepare(
      `SELECT a.id, a.scenario_id, s.title AS scenario_title, a.student_name, COALESCE(st.group_name, '') AS group_name, a.started_at, a.finished_at, a.score, a.grade, a.messages_count, a.disclosed_count
       FROM attempts a LEFT JOIN scenarios s ON s.id = a.scenario_id LEFT JOIN students st ON st.id = a.student_id
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY st.group_key = '', st.group_key, a.student_name, a.started_at DESC`,
    )
    .all(...params) as AttemptRow[];
  return buildXlsx([
    {
      name: 'Попытки',
      header: ['№', 'Студент', 'Группа', 'Сценарий', 'Начало (МСК)', 'Завершение (МСК)', 'Минут', 'Балл', 'Оценка', 'Вопросов', 'Раскрыто сведений'],
      rows: rows.map((row) => [
        row.id,
        row.student_name,
        row.group_name,
        row.scenario_title ?? row.scenario_id,
        new Date(row.started_at),
        row.finished_at ? new Date(row.finished_at) : null,
        row.finished_at ? Math.round((Date.parse(row.finished_at) - Date.parse(row.started_at)) / 60_000) : null,
        row.score,
        row.grade ?? 'в процессе',
        row.messages_count,
        row.disclosed_count,
      ]),
    },
  ]);
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—');
const esc = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function scenarioReportMd(db: Db, scenarioId: string): string | null {
  const scenario = db.prepare('SELECT id, title FROM scenarios WHERE id = ?').get(scenarioId) as { id: string; title: string } | undefined;
  if (!scenario) return null;
  const stats = computeStats(db, scenarioId);
  const t = stats.totals;
  const lines = [
    `# Отчёт по сценарию «${scenario.title}»`,
    '',
    `Сформирован: ${date(new Date().toISOString())}`,
    '',
    '## Итоги',
    '',
    `- Попыток: ${t.attempts} (завершено ${t.finished}, в процессе ${t.inProgress}), студентов: ${t.students}`,
    `- Средний балл: ${t.avgScore ?? '—'}, медиана: ${t.medianScore ?? '—'}, от ${t.minScore ?? '—'} до ${t.maxScore ?? '—'}`,
    `- Среднее время: ${t.avgMinutes ?? '—'} мин, вопросов в среднем: ${t.avgQuestions ?? '—'}`,
    '',
    '## Распределение оценок',
    '',
    ...(stats.grades.length ? stats.grades.map((g) => `- ${g.grade}: ${g.count}`) : ['Завершённых попыток нет.']),
    '',
    '## Средние баллы по критериям',
    '',
    '| Критерий | Средний балл | Максимум |',
    '|---|---|---|',
    ...stats.parts.map((p) => `| ${esc(p.label)} | ${p.avg} | ${p.max} |`),
    '',
    '## Сведения: что студенты выясняют хуже всего',
    '',
    '| Сведение | Тип | Выяснили в диалоге | В реестре | В ТЗ |',
    '|---|---|---|---|---|',
    ...stats.facts.map((f) => `| ${esc(f.label)} | ${f.requirementType} | ${f.disclosedPct}% | ${f.inRegistryPct}% | ${f.inTzPct}% |`),
    '',
    '## Частые штрафы',
    '',
    ...(stats.penalties.length ? stats.penalties.map((p) => `- ${p.label}: ${p.count} раз, ${p.points} баллов`) : ['Штрафов нет.']),
    '',
    '## Студенты',
    '',
    '| Студент | Начало | Завершение | Балл | Оценка |',
    '|---|---|---|---|---|',
  ];
  const rows = db
    .prepare('SELECT student_name, started_at, finished_at, score, grade FROM attempts WHERE scenario_id = ? ORDER BY started_at DESC')
    .all(scenarioId) as { student_name: string; started_at: string; finished_at: string | null; score: number | null; grade: string | null }[];
  for (const row of rows) lines.push(`| ${esc(row.student_name)} | ${date(row.started_at)} | ${date(row.finished_at)} | ${row.score ?? '—'} | ${row.grade ?? 'в процессе'} |`);
  return lines.join('\n') + '\n';
}

type StoredAttempt = {
  studentName?: string;
  startedAt?: string;
  finishedAt?: string | null;
  messages?: { role: string; text: string; at: string; quality?: string }[];
  requirements?: { text: string; category: string; needsClarification?: boolean; conflict?: boolean }[];
  tz?: Record<string, string>;
  result?: {
    total: number;
    grade: string;
    parts: { label: string; score: number; max: number; note: string }[];
    penalties: { label: string; points: number; detail: string }[];
    recommendations: string[];
    emptySections: number[];
  } | null;
};

/** Названия разделов ТЗ сценария: свои, если сценарий их задаёт, иначе стандартные 13. */
export function sectionTitles(db: Db, scenarioId: string): Record<number, string> {
  const row = db.prepare('SELECT pack_json FROM scenarios WHERE id = ?').get(scenarioId) as { pack_json: string | null } | undefined;
  try {
    const sections = row?.pack_json ? (JSON.parse(row.pack_json) as { tzSections?: { title?: unknown }[] }).tzSections : undefined;
    if (Array.isArray(sections) && sections.length) {
      return Object.fromEntries(sections.map((section, index) => [index + 1, typeof section?.title === 'string' ? section.title : `Раздел ${index + 1}`]));
    }
  } catch {
    // Повреждённый файл сценария: остаются стандартные названия.
  }
  return TZ_SECTION_TITLES;
}

export function attemptReportMd(row: { id: number; scenario_title: string | null; scenario_id: string; attempt_json: string }, titles: Record<number, string> = TZ_SECTION_TITLES): string {
  const attempt = JSON.parse(row.attempt_json) as StoredAttempt;
  const lines = [
    `# Попытка №${row.id}: ${attempt.studentName ?? 'без имени'}`,
    '',
    `Сценарий: ${row.scenario_title ?? row.scenario_id}`,
    `Начало: ${date(attempt.startedAt ?? null)}. Завершение: ${date(attempt.finishedAt ?? null)}`,
    '',
  ];
  const result = attempt.result;
  if (result) {
    lines.push(`## Результат: ${result.total} из 100, ${result.grade}`, '', '| Критерий | Балл | Максимум | Комментарий |', '|---|---|---|---|');
    for (const part of result.parts) lines.push(`| ${esc(part.label)} | ${part.score} | ${part.max} | ${esc(part.note)} |`);
    if (result.penalties.length) lines.push('', '### Штрафы', '', ...result.penalties.map((p) => `- ${p.label}: −${p.points}. ${p.detail}`));
    if (result.recommendations.length) lines.push('', '### Рекомендации', '', ...result.recommendations.map((r) => `- ${r}`));
  } else {
    lines.push('## Результат', '', 'Попытка не завершена.');
  }
  lines.push('', '## Переписка', '');
  for (const message of attempt.messages ?? []) lines.push(`**${message.role === 'student' ? 'Студент' : 'Заказчик'}:** ${message.text}`, '');
  lines.push('## Реестр требований', '');
  for (const item of attempt.requirements ?? []) lines.push(`- ${item.text}${item.needsClarification ? ' (требует уточнения)' : ''}${item.conflict ? ' (противоречие)' : ''}`);
  lines.push('', '## Текст ТЗ', '');
  for (const [number, title] of Object.entries(titles)) {
    lines.push(`### ${number}. ${title}`, '', attempt.tz?.[number]?.trim() || '—', '');
  }
  return lines.join('\n');
}
