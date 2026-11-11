// Какой сценарий показывает сайт.
// 1. Если есть сервер, сценарий выбирает преподаватель в панели администратора.
// 2. Без сервера: файл scenario/scenariy.json, если он собирается без ошибок.
// 3. Иначе — встроенный кейс «Узел горячей воды».
import { request } from '../api/client';
import type { Scenario } from '../types';
import { scenario as builtIn } from './scenario';
import { buildScenarioFromPack, type ScenarioPack } from './scenarioPack';

export type ScenarioSettings = { title?: string; publicBrief?: string; estimatedMinutes?: number };

const packs = import.meta.glob('../../scenario/scenariy.json', { eager: true, import: 'default' }) as Record<string, ScenarioPack>;

function fromFile(): Scenario {
  const pack = Object.values(packs)[0];
  if (!pack) return builtIn;
  const { scenario: built, report } = buildScenarioFromPack(pack);
  if (report.errors.length) {
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
  };
}

/** Живая привязка: после initScenario() все модули видят выбранный сценарий. */
export let scenario: Scenario = fromFile();

/** Подключён ли сервер: только тогда попытки отправляются преподавателю. */
export let serverConnected = false;

type PublicScenario = { id: string; kind: 'builtin' | 'pack'; settings: ScenarioSettings; pack: ScenarioPack | null };

export async function initScenario(): Promise<void> {
  try {
    const remote = await request<PublicScenario>('/public/scenario', { timeout: 3000 });
    if (remote.kind === 'builtin') {
      scenario = withSettings(builtIn, remote.settings);
    } else if (remote.pack) {
      const { scenario: built, report } = buildScenarioFromPack(remote.pack);
      if (report.errors.length) throw new Error(report.errors.join('; '));
      scenario = withSettings(built, remote.settings);
    }
    serverConnected = true;
  } catch (error) {
    // Нет сервера или сценарий с сервера не собрался: остаётся локальный вариант.
    if (error instanceof Error && !/Сервер недоступен/.test(error.message)) console.error('Сценарий с сервера не подключён:', error.message);
  }
}
