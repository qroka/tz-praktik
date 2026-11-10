// Показатели учебного прогресса и безопасные подсказки. Только чистые функции над состоянием попытки.
import { minSectionWords } from '../data/evaluation';
import { categoryProgress, type CategoryProgress } from '../engine/factTracker';
import type { Attempt, ChatMessage, Scenario } from '../types';

export type CategoryStatus = 'none' | 'partial' | 'done';
/**
 * Направление в прогрессе. found/total — все сведения темы (для преподавателя и итогов),
 * mandatoryFound/mandatoryTotal — обязательные сведения, по ним считается статус.
 */
export type DirectionRow = CategoryProgress & { status: CategoryStatus; mandatoryFound: number; mandatoryTotal: number; percent: number };

export type ProgressSummary = {
  rows: DirectionRow[];
  /** Затронуто направлений: по которым известно хотя бы одно сведение. */
  explored: number;
  all: number;
  remaining: number;
  /** Обязательные сведения: доля выясненных (главный показатель «изучено»). */
  coveragePercent: number;
  mandatoryFound: number;
  mandatoryTotal: number;
  /** Доля затронутых направлений — отдельный показатель, не полнота. */
  touchedPercent: number;
  questions: number;
  requirements: number;
  needsClarification: number;
  conflicts: number;
  filledSections: number;
  totalSections: number;
};

/**
 * Статус темы: «выяснено» — только когда получены все её обязательные сведения;
 * тема без обязательных сведений выяснена, когда получены все её сведения.
 */
export function directionStatus(row: { found: number; total: number; mandatoryFound: number; mandatoryTotal: number }): CategoryStatus {
  if (row.found === 0) return 'none';
  const complete = row.mandatoryTotal > 0 ? row.mandatoryFound === row.mandatoryTotal : row.total > 0 && row.found === row.total;
  return complete ? 'done' : 'partial';
}

export const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

export function summarizeProgress(scenario: Scenario, attempt: Attempt, disclosed: string[]): ProgressSummary {
  const known = new Set(disclosed);
  const rows: DirectionRow[] = categoryProgress(scenario, disclosed).map((row) => {
    const mandatory = scenario.facts.filter((fact) => fact.category === row.id && fact.requirementType === 'mandatory');
    const mandatoryFound = mandatory.filter((fact) => known.has(fact.id)).length;
    const base = { ...row, mandatoryFound, mandatoryTotal: mandatory.length };
    const share = mandatory.length ? mandatoryFound / mandatory.length : row.total ? row.found / row.total : 0;
    return { ...base, status: directionStatus(base), percent: Math.round(share * 100) };
  });
  const explored = rows.filter((row) => row.found > 0).length;
  const all = rows.length;
  const mandatoryTotal = rows.reduce((sum, row) => sum + row.mandatoryTotal, 0);
  const mandatoryFound = rows.reduce((sum, row) => sum + row.mandatoryFound, 0);
  return {
    rows,
    explored,
    all,
    remaining: all - explored,
    coveragePercent: mandatoryTotal === 0 ? 0 : Math.round((mandatoryFound / mandatoryTotal) * 100),
    mandatoryFound,
    mandatoryTotal,
    touchedPercent: all === 0 ? 0 : Math.round((explored / all) * 100),
    questions: attempt.messages.filter((message) => message.role === 'student').length,
    requirements: attempt.requirements.length,
    needsClarification: attempt.requirements.filter((item) => item.needsClarification).length,
    conflicts: attempt.requirements.filter((item) => item.conflict).length,
    filledSections: scenario.tzSections.filter((section) => countWords(attempt.tz[section.id] ?? '') >= minSectionWords).length,
    totalSections: scenario.tzSections.length,
  };
}

export type Hint = { title: string; text: string };

const QUALITY_HINT: Partial<Record<NonNullable<ChatMessage['quality']>, Hint>> = {
  general: { title: 'Уточните вопрос', text: 'Вопрос получился общим. Назовите параметр, режим или условие, о котором хотите узнать.' },
  repeat: { title: 'Вопрос уже звучал', text: 'Опирайтесь на полученный ответ или спросите о другой стороне того же предмета.' },
  unrecognized: { title: 'Заказчик не понял', text: 'Назовите предмет вопроса: оборудование, параметр или режим работы.' },
  clarify: { title: 'Ответьте на встречный вопрос', text: 'Заказчик просит уточнить, о чём речь. Укажите точку измерения, режим или оборудование.' },
  blocked: { title: 'Нужен другой ответ', text: 'Сначала выясните то, от чего зависит этот вопрос, и вернитесь к нему.' },
};

/**
 * Подсказка строится только из названий категорий и общих направлений сценария:
 * числовые значения и ещё не раскрытые факты в неё не попадают.
 * `messages` — только те сообщения, что уже видны студенту.
 */
export function buildHint(scenario: Scenario, attempt: Attempt, rows: DirectionRow[], messages: ChatMessage[]): Hint | null {
  if (attempt.finishedAt) return null;
  const students = messages.filter((message) => message.role === 'student');
  const firstOpen = rows.find((row) => row.status === 'none');
  if (students.length === 0) {
    return { title: 'С чего начать', text: `Начните с общей картины объекта. ${rows[0]?.direction ?? ''}`.trim() };
  }
  const lastStudent = students[students.length - 1];
  const byQuality = lastStudent.quality ? QUALITY_HINT[lastStudent.quality] : undefined;
  if (byQuality) return byQuality;

  const lastCustomer = [...messages].reverse().find((message) => message.role === 'customer' && (message.factIds?.length ?? 0) > 0);
  const factId = lastCustomer?.factIds?.[0];
  const fact = factId ? scenario.facts.find((item) => item.id === factId) : undefined;
  const row = fact ? rows.find((item) => item.id === fact.category) : undefined;
  if (row && attempt.requirements.length === 0) {
    return { title: 'Зафиксируйте результат', text: `Вы получили сведения по теме «${row.title}». Решите, что из них требование, и сохраните его в реестре.` };
  }
  if (row) {
    const done = row.status === 'done' ? ' Обязательные сведения этой темы выяснены.' : '';
    return {
      title: 'Идёте верно',
      text: `Вы выяснили сведения по теме «${row.title}».${done} Подумайте, что из этого зависит от режима работы и как система должна действовать при отклонении.`,
    };
  }
  if (firstOpen) return { title: `Не начато: ${firstOpen.title}`, text: firstOpen.direction };
  return { title: 'Все темы затронуты', text: 'Проверьте реестр: нет ли противоречий и записей, требующих уточнения. Затем переходите к разделам ТЗ.' };
}
