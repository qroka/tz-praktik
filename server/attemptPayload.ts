// Проверка попытки, присланной сайтом студента.
import { HttpError } from './http.ts';

export const MAX_ATTEMPT_BYTES = 3 * 1024 * 1024;

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Имя студента берётся из аккаунта, а не из присланной попытки. */
export function validateAttemptPayload(body: unknown, expectedScenario: string) {
  if (!isObject(body)) throw new HttpError(400, 'Ожидается объект попытки.');
  const attempt = body.attempt;
  if (!isObject(attempt)) throw new HttpError(400, 'Нет поля attempt.');
  if (attempt.scenarioId !== expectedScenario) throw new HttpError(400, 'Попытка относится к другому сценарию.');
  const startedAt = typeof attempt.startedAt === 'string' ? attempt.startedAt : '';
  if (!startedAt || Number.isNaN(Date.parse(startedAt))) throw new HttpError(400, 'startedAt: нужна дата в формате ISO.');
  if (typeof attempt.seed !== 'number') throw new HttpError(400, 'Нет seed.');
  if (!Array.isArray(attempt.messages) || attempt.messages.length > 3000) throw new HttpError(400, 'messages: слишком много или не список.');
  if (!Array.isArray(attempt.requirements) || attempt.requirements.length > 1000) throw new HttpError(400, 'requirements: слишком много или не список.');
  if (!isObject(attempt.tz)) throw new HttpError(400, 'tz: ожидается объект.');
  if (!isObject(attempt.engine) || !Array.isArray(attempt.engine.disclosed)) throw new HttpError(400, 'engine.disclosed: ожидается список.');
  const finishedAt = typeof attempt.finishedAt === 'string' && !Number.isNaN(Date.parse(attempt.finishedAt)) ? attempt.finishedAt : null;
  const result = isObject(attempt.result) ? attempt.result : null;
  const score = result && typeof result.total === 'number' ? Math.round(result.total) : null;
  const grade = result && typeof result.grade === 'string' ? result.grade.slice(0, 60) : null;
  const studentMessages = (attempt.messages as unknown[]).filter((m) => isObject(m) && m.role === 'student').length;
  return { attempt, startedAt, seed: attempt.seed, finishedAt, score, grade, studentMessages, disclosed: attempt.engine.disclosed.length };
}
