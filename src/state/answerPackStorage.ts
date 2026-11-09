// Загруженный файл ответов хранится только в этом браузере, отдельно от попытки студента.
export const ANSWERS_KEY = 'tz-praktikum:answers:v1';

export type StoredPack = { text: string; fileName: string; loadedAt: string };

export function loadStoredPack(storage: Storage = window.localStorage): StoredPack | null {
  try {
    const raw = storage.getItem(ANSWERS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredPack;
    return typeof data.text === 'string' ? data : null;
  } catch {
    return null;
  }
}

export function saveStoredPack(pack: StoredPack, storage: Storage = window.localStorage): boolean {
  try {
    storage.setItem(ANSWERS_KEY, JSON.stringify(pack));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredPack(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(ANSWERS_KEY);
  } catch {
    // Хранилище недоступно: очищать нечего.
  }
}
