// Разделы тренажёра и их адреса. Раздел хранится в попытке, адрес ему соответствует: /dialog, /registry, /tz, /progress, /result.
import type { Attempt, Screen } from '../types';

export const SCREEN_PATH: Record<Screen, string> = {
  dialog: '/dialog',
  registry: '/registry',
  tz: '/tz',
  progress: '/progress',
  result: '/result',
};

/** Раздел, который реально показывается: после завершения вместо редактора ТЗ — результат, до завершения результата нет. */
export function effectiveScreen(attempt: Attempt): Screen {
  if (attempt.result && attempt.screen === 'tz') return 'result';
  if (!attempt.result && attempt.screen === 'result') return 'dialog';
  return attempt.screen;
}

/** Раздел по адресу или null, если адрес не относится к попытке. */
export function screenOfPath(path: string): Screen | null {
  const found = (Object.keys(SCREEN_PATH) as Screen[]).find((screen) => SCREEN_PATH[screen] === path);
  return found ?? null;
}

export const CABINET_PATH = '/cabinet';

/**
 * Адрес, который должен быть открыт при текущем состоянии приложения:
 * без попытки — главная (вход) или личный кабинет, с попыткой — адрес её раздела.
 */
export function desiredPath(state: { attempt: Attempt | null; serverEnabled: boolean; signedIn: boolean }): string {
  if (state.attempt) return SCREEN_PATH[effectiveScreen(state.attempt)];
  return state.serverEnabled && state.signedIn ? CABINET_PATH : '/';
}
