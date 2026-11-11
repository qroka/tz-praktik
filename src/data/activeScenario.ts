// Какой сценарий показывает сайт. Если в папке scenario/ лежит scenariy.json и он собирается без ошибок,
// сайт работает по нему. Иначе действует встроенный кейс «Узел горячей воды». Файл удаляют — сайт возвращается к встроенному.
import type { Scenario } from '../types';
import { scenario as builtIn } from './scenario';
import { buildScenarioFromPack, type ScenarioPack } from './scenarioPack';

const packs = import.meta.glob('../../scenario/scenariy.json', { eager: true, import: 'default' }) as Record<string, ScenarioPack>;

function pick(): Scenario {
  const pack = Object.values(packs)[0];
  if (!pack) return builtIn;
  const { scenario, report } = buildScenarioFromPack(pack);
  if (report.errors.length) {
    console.error('scenario/scenariy.json не подключён, ошибки:\n' + report.errors.join('\n'));
    return builtIn;
  }
  return scenario;
}

export const scenario = pick();
