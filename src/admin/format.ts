// Общие помощники панели администратора.
import { adminApi } from '../api/client';

export type ScenarioSummary = {
  id: string;
  title: string;
  kind: 'builtin' | 'pack';
  /** Номер варианта: сценарий 1 — первый вариант и так далее. */
  variant: number;
  /** Выложен ли сценарий: выложенные попадают в список вариантов, из которого студент выбирает. */
  published: boolean;
  factsTotal: number | null;
  settings: { title?: string; publicBrief?: string; estimatedMinutes?: number; note?: string; customerName?: string; customerAvatar?: string };
  attempts: number;
  finished: number;
  avgScore: number | null;
  createdAt: string;
  updatedAt: string;
};

export const dateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const day = (iso: string): string => new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

export const minutesBetween = (from: string, to: string | null): string => {
  if (!to) return '—';
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  return Number.isFinite(minutes) && minutes >= 0 ? `${minutes} мин` : '—';
};

export function gradeColor(score: number | null): 'success' | 'primary' | 'warning' | 'error' | 'neutral' {
  if (score === null) return 'neutral';
  if (score >= 85) return 'success';
  if (score >= 70) return 'primary';
  if (score >= 50) return 'warning';
  return 'error';
}

/** Скачивает файл, полученный от сервера с cookie администратора. */
export async function downloadFromServer(path: string, filename: string): Promise<void> {
  const blob = await adminApi.file(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const CATEGORY_TITLES: Record<string, string> = {
  purpose: 'Назначение и цели', object: 'Объект автоматизации', monitored: 'Контролируемые параметры', regulated: 'Регулируемые параметры',
  modes: 'Режимы работы', warning: 'Предупредительная сигнализация', protection: 'Аварийные защиты', actuators: 'Исполнительные устройства',
  hmi: 'Операторский интерфейс', power: 'Электропитание', environment: 'Условия эксплуатации', reliability: 'Надёжность и безопасность', docs: 'Документация',
};

export const TYPE_LABEL: Record<string, string> = { mandatory: 'Требование', preference: 'Пожелание', proposal: 'Предложение' };

/** Группа студентов со счётчиком. Пустое имя — студенты, которым группу ещё не назначили. */
export type GroupInfo = { name: string; students: number };

/** Значение фильтра «без группы» (совпадает с серверным). */
export const NO_GROUP = '__none__';

export async function loadGroups(): Promise<GroupInfo[]> {
  return (await adminApi.get<{ groups: GroupInfo[] }>('/admin/students?pageSize=1')).groups;
}

export const groupItems = (groups: GroupInfo[]) => [
  { label: 'Все группы', value: 'all' },
  ...groups.map((g) => (g.name ? { label: `${g.name} · ${g.students}`, value: g.name } : { label: `Без группы · ${g.students}`, value: NO_GROUP })),
];

/** Параметры запроса из набора фильтров: пустые и «все» не передаются. */
export function filterParams(filters: Record<string, string>, names: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const name of names) {
    const value = filters[name];
    if (value && value !== 'all' && value.trim()) params.set(name, value.trim());
  }
  return params;
}
