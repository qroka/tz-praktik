// Отправка попыток студента преподавателю. Работает только при подключённом сервере и никогда не мешает работе:
// ошибки молчат, попытка остаётся в браузере и уйдёт при следующей отправке.
import { serverConnected } from '../data/activeScenario';
import type { Attempt } from '../types';
import { request } from './client';

const MARK_KEY = 'tz-praktikum:synced:v1';

const attemptKey = (attempt: Attempt) => `${attempt.startedAt}|${attempt.seed}`;

function readMark(): string | null {
  try {
    return window.localStorage.getItem(MARK_KEY);
  } catch {
    return null;
  }
}

function writeMark(value: string) {
  try {
    window.localStorage.setItem(MARK_KEY, value);
  } catch {
    // Хранилище недоступно: при следующей загрузке попытка отправится ещё раз, сервер примет её без дублей.
  }
}

/** Отметка вида «ключ попытки + признак завершения»: по ней понятно, ушёл ли итог. */
const markOf = (attempt: Attempt) => `${attemptKey(attempt)}|${attempt.finishedAt ? 'done' : 'open'}`;

export const needsSync = (attempt: Attempt): boolean => serverConnected && Boolean(attempt.finishedAt) && readMark() !== markOf(attempt);

/** true — сервер принял попытку. */
export async function sendAttempt(attempt: Attempt): Promise<boolean> {
  if (!serverConnected) return false;
  try {
    await request('/public/attempts', { method: 'POST', body: { scenarioId: attempt.scenarioId, attempt }, timeout: 20000 });
    writeMark(markOf(attempt));
    return true;
  } catch {
    return false;
  }
}
