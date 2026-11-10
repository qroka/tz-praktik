// Состояние попытки: создание, проверка загруженного файла, операции над реестром и ТЗ.
import { createEngineState, respond } from '../engine/dialogueEngine';
import { evaluateAttempt } from '../engine/evaluationEngine';
import { pickVariant } from '../engine/responseSelector';
import type { AnswerFeedback, Attempt, ChatMessage, Difficulty, Requirement, Scenario, Screen } from '../types';

export const newSeed = (): number => Math.floor(Math.random() * 1_000_000) + 1;

let counter = 0;
export const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function createAttempt(scenario: Scenario, studentName: string, difficulty: Difficulty, seed: number): Attempt {
  const engine = createEngineState();
  const greeting = pickVariant(engine, seed, 'greeting', scenario.greeting);
  const at = new Date().toISOString();
  return {
    version: 1,
    scenarioId: scenario.id,
    studentName: studentName.trim(),
    difficulty,
    seed,
    startedAt: at,
    finishedAt: null,
    messages: [{ id: makeId('m'), role: 'customer', text: greeting.text, at, quality: 'social', factIds: [] }],
    engine: greeting.state,
    requirements: [],
    tz: {},
    screen: 'dialog',
    activeSection: 1,
    result: null,
  };
}

export type SendResult = { attempt: Attempt; studentId: string; customerId: string };

/** Отправляет вопрос: студенческое сообщение и ответ заказчика добавляются одновременно. */
export function sendQuestion(attempt: Attempt, scenario: Scenario, text: string, replyToId?: string | null): SendResult {
  const replyTarget = replyToId ? attempt.messages.find((m) => m.id === replyToId) : null;
  const { state, reply } = respond(
    attempt.engine,
    {
      text,
      seed: attempt.seed,
      difficulty: attempt.difficulty,
      replyTo: replyTarget ? { topic: replyTarget.topic, factIds: replyTarget.factIds, intentId: replyTarget.intentId } : null,
    },
    scenario,
  );
  const at = new Date().toISOString();
  const studentId = makeId('m');
  const customerId = makeId('m');
  const student: ChatMessage = {
    id: studentId,
    role: 'student',
    text,
    at,
    quality: reply.quality,
    intentId: reply.intentId,
    topic: reply.topic,
    factIds: reply.factIds,
    replyToId: replyToId ?? undefined,
  };
  const customer: ChatMessage = {
    id: customerId,
    role: 'customer',
    text: reply.text,
    at,
    quality: reply.quality,
    intentId: reply.intentId,
    topic: reply.topic,
    factIds: reply.factIds,
  };
  return { attempt: { ...attempt, engine: state, messages: [...attempt.messages, student, customer] }, studentId, customerId };
}

/** Ставит или снимает (null) оценку ответа заказчика. */
export function setAnswerFeedback(attempt: Attempt, messageId: string, feedback: Pick<AnswerFeedback, 'rating' | 'reason'> | null): Attempt {
  return {
    ...attempt,
    messages: attempt.messages.map((message) => {
      if (message.id !== messageId || message.role !== 'customer') return message;
      const { feedback: _old, ...rest } = message;
      return feedback ? { ...rest, feedback: { rating: feedback.rating, reason: feedback.reason.trim(), at: new Date().toISOString() } } : rest;
    }),
  };
}

export function addRequirement(
  attempt: Attempt,
  draft: Pick<Requirement, 'text' | 'category' | 'needsClarification'> & { sourceMessageId?: string | null },
): Attempt {
  const source = draft.sourceMessageId ? attempt.messages.find((m) => m.id === draft.sourceMessageId) : null;
  const requirement: Requirement = {
    id: makeId('r'),
    text: draft.text.trim(),
    category: draft.category,
    sourceMessageId: draft.sourceMessageId ?? null,
    sourceQuote: source?.text,
    createdAt: new Date().toISOString(),
    needsClarification: draft.needsClarification,
    conflict: false,
  };
  return { ...attempt, requirements: [...attempt.requirements, requirement] };
}

export function updateRequirement(attempt: Attempt, id: string, patch: Partial<Requirement>): Attempt {
  return { ...attempt, requirements: attempt.requirements.map((item) => (item.id === id ? { ...item, ...patch } : item)) };
}

export function removeRequirement(attempt: Attempt, id: string): Attempt {
  return { ...attempt, requirements: attempt.requirements.filter((item) => item.id !== id) };
}

/** Объединяет записи в первую из выбранных; источники сохраняются. */
export function mergeRequirements(attempt: Attempt, ids: string[], text: string): Attempt {
  const chosen = attempt.requirements.filter((item) => ids.includes(item.id));
  if (chosen.length < 2) return attempt;
  const [first] = chosen;
  const merged: Requirement = {
    ...first,
    text: text.trim(),
    needsClarification: chosen.some((item) => item.needsClarification),
    conflict: chosen.some((item) => item.conflict),
    mergedFrom: chosen.map((item) => item.sourceMessageId).filter((id): id is string => Boolean(id)),
    movedToSections: [...new Set(chosen.flatMap((item) => item.movedToSections ?? []))],
  };
  return {
    ...attempt,
    requirements: attempt.requirements.filter((item) => !ids.includes(item.id) || item.id === first.id).map((item) => (item.id === first.id ? merged : item)),
  };
}

export function setTzText(attempt: Attempt, sectionId: number, text: string): Attempt {
  return { ...attempt, tz: { ...attempt.tz, [sectionId]: text } };
}

/** Переносит выбранные требования в раздел как черновик, который студент затем переписывает. */
export function moveRequirementsToSection(attempt: Attempt, sectionId: number, ids: string[]): Attempt {
  const chosen = attempt.requirements.filter((item) => ids.includes(item.id));
  if (!chosen.length) return attempt;
  const current = attempt.tz[sectionId] ?? '';
  const lines = chosen.map((item) => `— ${item.text}`).join('\n');
  const text = current.trim() ? `${current.trimEnd()}\n${lines}` : lines;
  return {
    ...attempt,
    tz: { ...attempt.tz, [sectionId]: text },
    requirements: attempt.requirements.map((item) =>
      ids.includes(item.id) ? { ...item, movedToSections: [...new Set([...(item.movedToSections ?? []), sectionId])] } : item,
    ),
  };
}

export function setScreen(attempt: Attempt, screen: Screen): Attempt {
  return { ...attempt, screen };
}

export function finishAttempt(attempt: Attempt, scenario: Scenario): Attempt {
  const finished: Attempt = { ...attempt, finishedAt: new Date().toISOString(), screen: 'result' };
  return { ...finished, result: evaluateAttempt(finished, scenario) };
}

/** Проверяет и приводит к текущему формату данные из localStorage или файла. */
export function validateAttempt(data: unknown, scenario: Scenario): { ok: true; attempt: Attempt } | { ok: false; error: string } {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Файл не содержит данных попытки.' };
  const raw = data as Partial<Attempt>;
  if (raw.version !== 1) return { ok: false, error: 'Неизвестная версия файла прогресса.' };
  if (raw.scenarioId !== scenario.id) return { ok: false, error: 'Файл относится к другому учебному кейсу.' };
  if (typeof raw.studentName !== 'string' || !['learning', 'standard', 'strict'].includes(raw.difficulty as string)) {
    return { ok: false, error: 'В файле нет имени студента или режима сложности.' };
  }
  if (typeof raw.seed !== 'number' || !Array.isArray(raw.messages) || !Array.isArray(raw.requirements)) {
    return { ok: false, error: 'Файл повреждён: нет переписки или реестра.' };
  }
  if (!raw.engine || !Array.isArray(raw.engine.disclosed) || !raw.engine.counters) {
    return { ok: false, error: 'Файл повреждён: нет состояния заказчика.' };
  }
  const screen: Screen = raw.screen === 'tz' || raw.screen === 'result' || raw.screen === 'registry' || raw.screen === 'progress' ? raw.screen : 'dialog';
  return {
    ok: true,
    attempt: {
      ...(raw as Attempt),
      tz: raw.tz && typeof raw.tz === 'object' ? raw.tz : {},
      activeSection: typeof raw.activeSection === 'number' ? raw.activeSection : 1,
      finishedAt: raw.finishedAt ?? null,
      result: raw.result ?? null,
      screen: raw.result ? screen : screen === 'result' ? 'dialog' : screen,
    },
  };
}
