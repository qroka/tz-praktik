import { describe, expect, it } from 'vitest';
import foreign from './fixtures/foreign-ventilation.json';
import sample from './fixtures/sample-pack.json';
import { convertForeignPack, isForeignPack } from './packConverter';
import { createEngineState, respond } from '../engine/dialogueEngine';
import { buildScenarioFromPack, checkRecognition, validatePack, type ScenarioPack } from './scenarioPack';

// Файл ChatGPT в чужом формате (schemaVersion, answers, свои категории и разделы ТЗ): раньше загрузчик молча падал.
const converted = convertForeignPack(foreign)!;
const pack = converted.pack;
const built = buildScenarioFromPack(pack);
const scenario = built.scenario!;
const fact = (id: string) => pack.facts.find((f) => f.id === id)!;

const ask = (texts: string[]) => {
  let state = createEngineState();
  let last = respond(state, { text: texts[0], seed: 1, difficulty: 'learning' }, scenario);
  state = last.state;
  for (const text of texts.slice(1)) {
    last = respond(state, { text, seed: 1, difficulty: 'learning' }, scenario);
    state = last.state;
  }
  return last.reply;
};

describe('Файл в чужом формате', () => {
  it('распознаётся как чужой, наш формат не трогается', () => {
    expect(isForeignPack(foreign)).toBe(true);
    expect(isForeignPack(sample)).toBe(false);
    expect(convertForeignPack(sample)).toBeNull();
    expect(isForeignPack(null)).toBe(false);
    expect(isForeignPack({ facts: [] })).toBe(false);
    expect(isForeignPack('строка')).toBe(false);
  });

  it('преобразуется без ошибок, все 55 сведений на месте', () => {
    expect(validatePack(pack).errors).toEqual([]);
    expect(built.report.errors).toEqual([]);
    expect(pack.facts).toHaveLength(55);
    expect(converted.notes.length).toBeGreaterThan(2);
  });

  it('сохраняет свои 13 категорий и 13 разделов ТЗ', () => {
    expect(scenario.categories).toHaveLength(13);
    expect(scenario.categories[0]).toMatchObject({ id: 'object', title: 'Объект автоматизации' });
    expect(scenario.tzSections).toHaveLength(13);
    expect(scenario.tzSections.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(scenario.tzSections[2].title).toBe('Характеристика объекта автоматизации');
    // F001 ожидается в разделе automation_object — третьем по списку.
    expect(fact('f001').section).toBe(3);
    // Категории реестра, которые обычно переносят в раздел, выводятся из сведений.
    expect(scenario.tzSections[2].categories).toContain('object');
  });

  it('значения превращаются в понятный текст и числа для сверки', () => {
    expect(fact('f013')).toMatchObject({ value: '22 °C.', numbers: [22], unit: '°C' });
    expect(fact('f014').value).toBe('20–24 °C.');
    expect(fact('f015').value).toBe('ниже 18 °C.');
    expect(fact('f019').value).toBe('07:00–18:00.');
    expect(fact('f006').value).toBe('0, 25, 50, 75, 100 %.');
    expect(fact('f024')).toMatchObject({ value: '10 с.', numbers: [10] });
    expect(fact('f003').value).toBe('Да.');
    expect(fact('f012').value).toBe('Нет.');
    // Сложные значения заменяются первым ответом заказчика: никакого «heater: off».
    expect(fact('f028').value).toMatch(/нагрев/i);
    expect(fact('f028').value).not.toMatch(/heater|ventilation/);
    expect(fact('f035').value).not.toMatch(/automatic/);
  });

  it('связи между сведениями сохранены', () => {
    expect(fact('f006').prerequisites).toEqual(['f003']);
    expect(fact('f045').prerequisites).toEqual(['f043', 'f044']);
    expect(fact('f001').customerConfidence).toBe('certain');
    expect(fact('f013').customerConfidence).toBe('certain');
    expect(fact('f055').customerConfidence).toBe('approximate');
    expect(fact('f048').customerConfidence).toBe('unknown');
    expect(fact('f048').unknownKind).toBe('designer');
    for (const id of ['f028', 'f029', 'f030']) expect(fact(id).isReaction).toBe(true);
    expect(pack.evaluation?.warnAlarmFacts).toEqual(['f015', 'f016', 'f017', 'f018']);
  });

  it('все 165 вопросов из файла находят своё сведение', () => {
    const { total, misses } = checkRecognition(scenario, pack);
    expect(total).toBe(165);
    expect(misses, misses.join('\n')).toEqual([]);
  });

  it('вопросы, которых в файле нет, тоже понимаются', () => {
    expect(ask(['Какая рабочая температура?']).factIds).toContain('f013');
    expect(ask(['До скольки градусов греть?']).factIds).toContain('f013');
    expect(ask(['Во сколько у вас начинается смена?']).factIds).toContain('f019');
    expect(ask(['Когда заканчивается смена?']).factIds).toContain('f019');
    expect(ask(['Нужно ли охлаждение летом?']).factIds).toContain('f012');
    expect(ask(['Что делать при перегреве?']).factIds).toContain('f028');
    expect(ask(['Сколько человек будут работать со SCADA?']).factIds).toContain('f038');
    expect(ask(['Какой контроллер поставить?']).factIds).toContain('f048');
  });

  it('предметные рамки встроенного кейса не мешают: «Какие режимы нужны?» отвечает по сути', () => {
    const reply = ask(['Какие режимы нужны?']);
    expect(reply.factIds).toContain('f035');
    expect(reply.text).not.toMatch(/насос|узел/i);
    expect(ask(['Что в итоге должна делать новая система?']).factIds).toContain('f011');
  });

  it('«не знаю» заказчика получает класс неизвестности', () => {
    expect(ask(['Какой контроллер хотите?']).uncertainty?.kind).toBe('designer');
    // F047 открывается после F002 (предпосылка).
    expect(ask(['Какая вентиляция сейчас стоит?', 'У вентиляторов есть сигналы Работа и Авария?']).uncertainty?.kind).toBe('survey');
    expect(ask(['Какая SCADA должна быть?']).uncertainty?.kind).toBe('designer');
  });

  it('общий вопрос не раскрывает конкретных значений', () => {
    const reply = ask(['Расскажите всё']);
    expect(reply.quality).toBe('general');
    expect(reply.factIds).toEqual([]);
    expect(ask(['Расскажите про объект']).factIds).toEqual(['f001', 'f002', 'f003']);
  });
});

describe('Сборщик сценария не падает на чужих и сломанных файлах', () => {
  const broken: unknown[] = [
    {}, [], null, 'строка', 42, { facts: 'нет' }, { facts: [null, 5, 'x'] }, { format: 'tz-praktikum-scenario', scenario: null, facts: [{}] },
    { format: 'tz-praktikum-scenario', scenario: { id: 'a' }, facts: [] }, foreign,
    { ...(sample as object), tzSections: [null], categories: [null] },
  ];

  it.each(broken.map((value, index) => [index, value] as const))('вариант %i: ошибки в отчёте вместо исключения', (_, value) => {
    expect(() => validatePack(value)).not.toThrow();
    const result = buildScenarioFromPack(value as ScenarioPack);
    expect(result.report.errors.length).toBeGreaterThan(0);
    expect(result.scenario).toBeNull();
  });

  it('чужой формат без преобразования даёт понятную ошибку про format', () => {
    expect(validatePack(foreign).errors[0]).toContain('format');
  });

  it('свои разделы без списка категорий отклоняются, а неверный номер раздела называется по имени', () => {
    const noCategories = { ...(sample as object), tzSections: [{ title: 'Один' }], categories: undefined } as unknown;
    expect(validatePack(noCategories).errors.join('\n')).toContain('categories');
    const bad = JSON.parse(JSON.stringify(pack)) as ScenarioPack;
    bad.facts[0].section = 14;
    expect(validatePack(bad).errors.join('\n')).toContain('от 1 до 13');
  });
});
