import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import sample from './fixtures/sample-pack.json';
import { buildScenarioFromPack, checkRecognition, validatePack, type ScenarioPack } from './scenarioPack';
import { createEngineState, respond } from '../engine/dialogueEngine';

const recognition = checkRecognition;

describe('Сборка сценария из файла (пример)', () => {
  const pack = sample as unknown as ScenarioPack;
  const built = buildScenarioFromPack(pack);
  const report = built.report;
  const scenario = built.scenario!;

  it('файл проходит проверку', () => expect(report.errors).toEqual([]));
  it('сценарий содержит факты, намерения и ответы', () => {
    expect(scenario.facts).toHaveLength(pack.facts.length);
    for (const intent of scenario.intents.filter((i) => i.kind !== 'meta')) expect(scenario.replies[intent.id], intent.id).toBeTruthy();
  });
  it('вопросы из файла распознаются своим сведением', () => {
    const { total, misses } = recognition(scenario, pack);
    expect(misses, `${misses.length} из ${total}`).toEqual([]);
  });
  it('служебные реплики работают', () => {
    const out = respond(createEngineState(), { text: 'Здравствуйте!', seed: 1, difficulty: 'learning' }, scenario);
    expect(out.reply.intentId).toBe('greeting');
  });
  it('неоднозначное слово вызывает встречный вопрос', () => {
    const out = respond(createEngineState(), { text: 'Какое давление?', seed: 1, difficulty: 'learning' }, scenario);
    expect(out.reply.quality).toBe('clarify');
  });
  it('«не знаю» помечается классом неизвестности', () => {
    const out = respond(createEngineState(), { text: 'Какой контроллер поставить?', seed: 1, difficulty: 'learning' }, scenario);
    expect(out.reply.uncertainty?.kind).toBe('designer');
  });
  it('ошибки в файле находятся', () => {
    const broken = JSON.parse(JSON.stringify(sample));
    broken.facts[1].category = 'nope';
    broken.facts[2].prerequisites = ['missing'];
    const { errors } = validatePack(broken);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// Проверка настоящего файла: `npm run scenario:check`. Отчёт пишется в scenario/otchet.md.
describe.runIf(import.meta.env.MODE === 'scenario')('Проверка scenario/scenariy.json', () => {
  it('собирает и проверяет файл', () => {
    const path = 'scenario/scenariy.json';
    if (!existsSync(path)) throw new Error('Положите файл в scenario/scenariy.json');
    const pack = JSON.parse(readFileSync(path, 'utf8')) as ScenarioPack;
    const { scenario, report } = buildScenarioFromPack(pack);
    const lines = ['# Отчёт проверки сценария', '', `Сведений: ${pack.facts?.length ?? 0}`, '', '## Ошибки (мешают подключить)', ...(report.errors.length ? report.errors.map((e) => `- ${e}`) : ['нет']), '', '## Замечания', ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ['нет'])];
    if (scenario && !report.errors.length) {
      const { total, misses } = recognition(scenario, pack);
      lines.push('', `## Распознавание вопросов: ${total - misses.length} из ${total}`, ...(misses.length ? misses.map((m) => `- ${m}`) : ['все вопросы распознаются']));
    }
    writeFileSync('scenario/otchet.md', lines.join('\n') + '\n');
    expect(report.errors).toEqual([]);
  });
});
