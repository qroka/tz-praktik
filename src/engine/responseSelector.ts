// Выбор варианта ответа: воспроизводимый случайный выбор без повторов подряд.
import type { EngineState } from '../types';

/** Хеш строки (FNV-1a) для получения подпоследовательности из seed и контекста. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Генератор mulberry32: одинаковый seed даёт одинаковую последовательность. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFor(seed: number, turn: number, key: string): number {
  return mulberry32((seed ^ hashString(`${turn}:${key}`)) >>> 0)();
}

/**
 * Берёт вариант из группы, не повторяя уже использованные, пока они не закончатся.
 * Возвращает текст и новое состояние учёта вариантов.
 */
export function pickVariant(
  state: EngineState,
  seed: number,
  groupKey: string,
  variants: string[],
): { text: string; state: EngineState } {
  if (variants.length === 0) throw new Error(`Пустая группа ответов: ${groupKey}`);
  const used = state.usedVariants[groupKey] ?? [];
  let free = variants.map((_, index) => index).filter((index) => !used.includes(index));
  let nextUsed = used;
  if (free.length === 0) {
    // Варианты исчерпаны: начинаем заново, но не с только что сказанного.
    const last = used[used.length - 1];
    free = variants.map((_, index) => index).filter((index) => index !== last || variants.length === 1);
    nextUsed = [];
  }
  const index = free[Math.floor(randomFor(seed, state.turn, groupKey) * free.length)];
  return {
    text: variants[index],
    state: { ...state, usedVariants: { ...state.usedVariants, [groupKey]: [...nextUsed, index] } },
  };
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}
