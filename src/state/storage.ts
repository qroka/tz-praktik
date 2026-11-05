// Сохранение попытки в localStorage. Вся работа остаётся в браузере.
import type { Attempt, Scenario } from '../types';
import { validateAttempt } from './attempt';

export const STORAGE_KEY = 'tz-praktikum:attempt:v1';

export function saveAttempt(attempt: Attempt, storage: Storage = window.localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

export function loadAttempt(scenario: Scenario, storage: Storage = window.localStorage): Attempt | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = validateAttempt(JSON.parse(raw), scenario);
    return result.ok ? result.attempt : null;
  } catch {
    return null;
  }
}

export function clearAttempt(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Хранилище недоступно: очищать нечего.
  }
}
