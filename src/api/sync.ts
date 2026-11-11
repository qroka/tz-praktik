// Хранение попыток на сервере: отправка с номером версии, открытие из истории кабинета.
// Работает только при подключённом сервере и вошедшем студенте, и никогда не мешает работе: ошибки молчат,
// попытка остаётся в браузере и уйдёт при следующей отправке.
import { serverConnected, type PublicScenario } from '../data/activeScenario';
import type { Attempt } from '../types';
import { ApiError, request } from './client';
import { getStudentToken } from './student';

const MARK_KEY = 'tz-praktikum:synced:v1';
const REV_KEY = 'tz-praktikum:rev:v1';

const attemptKey = (attempt: Attempt) => `${attempt.startedAt}|${attempt.seed}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно: при следующей загрузке попытка отправится ещё раз, сервер примет её без дублей.
  }
}

/** Отметка вида «ключ попытки + признак завершения»: по ней понятно, ушёл ли итог. */
const markOf = (attempt: Attempt) => `${attemptKey(attempt)}|${attempt.finishedAt ? 'done' : 'open'}`;

/** Можно ли сохранять попытки на сервере: он подключён и студент вошёл. */
export const canSync = (): boolean => serverConnected && getStudentToken() !== null;

export const needsSync = (attempt: Attempt): boolean => canSync() && Boolean(attempt.finishedAt) && read(MARK_KEY) !== markOf(attempt);

/** Номер версии, которую этот браузер видел на сервере в последний раз (0 — попытка ещё не отправлялась). */
export function getRev(code: string): number {
  try {
    const saved = JSON.parse(read(REV_KEY) ?? 'null') as { code?: string; rev?: number } | null;
    return saved?.code === code && typeof saved.rev === 'number' ? saved.rev : 0;
  } catch {
    return 0;
  }
}

export function setRev(code: string, rev: number) {
  write(REV_KEY, JSON.stringify({ code, rev }));
}

export type SyncResult =
  | { status: 'ok'; rev: number }
  | { status: 'offline' }
  | { status: 'rejected'; message: string }
  | { status: 'conflict'; rev: number; attempt: unknown };

/**
 * Отправляет попытку. Если за это время другое устройство успело сохранить свою версию, сервер не затирает её:
 * возвращается conflict, и студент выбирает, какую оставить. force — «оставить мою».
 */
export async function sendAttempt(attempt: Attempt, options: { force?: boolean } = {}): Promise<SyncResult> {
  const token = getStudentToken();
  if (!serverConnected || !token) return { status: 'offline' };
  const code = attempt.resumeCode;
  try {
    const result = await request<{ rev: number }>('/student/attempts', {
      method: 'POST',
      token,
      body: { scenarioId: attempt.scenarioId, attempt, baseRev: code ? getRev(code) : undefined, force: options.force || undefined },
      timeout: 20000,
    });
    if (code) setRev(code, result.rev);
    write(MARK_KEY, markOf(attempt));
    return { status: 'ok', rev: result.rev };
  } catch (error) {
    if (!(error instanceof ApiError)) return { status: 'offline' };
    if (error.status === 0 || error.status >= 500 || error.status === 429) return { status: 'offline' };
    if (error.status === 409 && error.conflict) return { status: 'conflict', rev: error.conflict.rev, attempt: error.conflict.attempt };
    return { status: 'rejected', message: error.message };
  }
}

export type ResumeData = { attempt: unknown; rev: number; scenario: PublicScenario };

/** Своя попытка из истории кабинета вместе со сценарием, по которому она шла. */
export async function fetchAttempt(key: string): Promise<ResumeData> {
  const token = getStudentToken();
  if (!token) throw new ApiError(401, 'Войдите в личный кабинет.');
  return request<ResumeData>(`/student/attempts/${encodeURIComponent(key)}`, { token, timeout: 15000 });
}
