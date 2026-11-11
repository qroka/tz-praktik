// Какой сценарий показывает сайт.
// 1. Если есть сервер, сценарий выбирает преподаватель в панели администратора.
// 2. Без сервера: файл scenario/scenariy.json, если он собирается без ошибок.
// 3. Иначе — встроенный кейс «Узел горячей воды».
import { request } from '../api/client';
import { getStudentToken } from '../api/student';
import { STORAGE_KEY } from '../state/storage';
import type { Scenario } from '../types';
import { scenario as builtIn } from './scenario';
import { convertForeignPack } from './packConverter';
import { buildScenarioFromPack, type ScenarioPack } from './scenarioPack';

export type ScenarioSettings = { title?: string; publicBrief?: string; estimatedMinutes?: number; customerName?: string; customerAvatar?: string };

/** Инициалы для аватарки без картинки: первые буквы первых двух слов имени. */
const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join('');

const packs = import.meta.glob('../../scenario/scenariy.json', { eager: true, import: 'default' }) as Record<string, ScenarioPack>;

function fromFile(): Scenario {
  const file = Object.values(packs)[0];
  if (!file) return builtIn;
  const pack = convertForeignPack(file)?.pack ?? file;
  const { scenario: built, report } = buildScenarioFromPack(pack);
  if (report.errors.length || !built) {
    console.error('scenario/scenariy.json не подключён, ошибки:\n' + report.errors.join('\n'));
    return builtIn;
  }
  return built;
}

function withSettings(base: Scenario, settings: ScenarioSettings): Scenario {
  return {
    ...base,
    title: settings.title ?? base.title,
    publicBrief: settings.publicBrief ?? base.publicBrief,
    estimatedMinutes: settings.estimatedMinutes ?? base.estimatedMinutes,
    customer: {
      ...base.customer,
      name: settings.customerName ?? base.customer.name,
      initials: settings.customerName ? initialsOf(settings.customerName) || base.customer.initials : base.customer.initials,
      avatar: settings.customerAvatar,
    },
  };
}

/** Живая привязка: после initScenario() все модули видят выбранный сценарий. */
export let scenario: Scenario = fromFile();

/** Подключён ли сервер: только тогда попытки отправляются преподавателю. */
export let serverConnected = false;

export type PublicScenario = { id: string; kind: 'builtin' | 'pack'; title?: string; variant?: number; settings: ScenarioSettings; pack: ScenarioPack | null };

/** Делает сценарий с сервера активным. Бросает ошибку, если файл сценария не собирается. */
export function applyRemoteScenario(remote: PublicScenario): void {
  if (remote.kind === 'builtin') {
    scenario = withSettings(builtIn, remote.settings);
  } else if (remote.pack) {
    const { scenario: built, report } = buildScenarioFromPack(remote.pack);
    if (report.errors.length || !built) throw new Error(report.errors.join('; ') || 'Сценарий не собрался.');
    scenario = withSettings(built, remote.settings);
  }
}

/**
 * Локальная попытка шла по другому сценарию (преподаватель с тех пор выбрал новый): подключаем её собственный сценарий,
 * иначе работа студента «пропала бы» с экрана. Сценарий берётся с сервера по личному коду попытки.
 */
async function restoreScenarioOfLocalAttempt(): Promise<void> {
  try {
    const token = getStudentToken();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as { scenarioId?: string; resumeCode?: string } | null;
    if (!token || !saved?.resumeCode || !saved.scenarioId || saved.scenarioId === scenario.id) return;
    const found = await request<{ scenario: PublicScenario }>(`/student/attempts/${encodeURIComponent(saved.resumeCode)}`, { token, timeout: 5000 });
    if (found.scenario.id === saved.scenarioId) applyRemoteScenario(found.scenario);
  } catch {
    // Сервер не знает эту попытку или недоступен: остаётся текущий сценарий.
  }
}

/** Подключает вариант, который выбрал студент: сценарий скачивается с сервера и становится активным. */
export async function selectVariant(id: string): Promise<PublicScenario> {
  const remote = await request<PublicScenario>(`/public/scenario?id=${encodeURIComponent(id)}`, { timeout: 10000 });
  applyRemoteScenario(remote);
  return remote;
}

export async function initScenario(): Promise<void> {
  try {
    applyRemoteScenario(await request<PublicScenario>('/public/scenario', { timeout: 3000 }));
    serverConnected = true;
    await restoreScenarioOfLocalAttempt();
  } catch (error) {
    // Нет сервера или сценарий с сервера не собрался: остаётся локальный вариант.
    if (error instanceof Error && !/Сервер недоступен/.test(error.message)) console.error('Сценарий с сервера не подключён:', error.message);
  }
}
