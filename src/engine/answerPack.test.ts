import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import type { Scenario } from '../types';
import { ANSWER_PACK_FORMAT, applyAnswerPack, buildAnswerTemplate, parseAnswerPack } from './answerPack';
import { createEngineState, respond } from './dialogueEngine';

function load(pack: object): Scenario {
  const parsed = parseAnswerPack(JSON.stringify(pack), scenario);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return applyAnswerPack(scenario, parsed.pack);
}

function talk(target: Scenario, questions: string[]) {
  let state = createEngineState();
  return questions.map((text) => {
    const out = respond(state, { text, seed: 3, difficulty: 'standard' }, target);
    state = out.state;
    return out.reply;
  });
}

const pack = (answers: object[], extra: object = {}) => ({ format: ANSWER_PACK_FORMAT, version: 1, answers, ...extra });

describe('Шаблон ответов', () => {
  const template = buildAnswerTemplate(scenario);

  it('содержит все темы с ответами и справку по фактам', () => {
    const ids = template.answers.map((entry) => entry.id);
    expect(ids).toContain('temp_setpoint');
    expect(ids).toContain('hmi_main');
    expect(ids).not.toContain('followup_more');
    const temp = template.answers.find((entry) => entry.id === 'temp_setpoint')!;
    expect(temp.facts?.[0]).toContain('60');
    expect(temp.replies?.length).toBeGreaterThan(0);
    expect(template.answers.find((entry) => entry.id === 'hmi_main')!.steps).toHaveLength(3);
  });

  it('загружается без ошибок и предупреждений и не меняет поведение', () => {
    const parsed = parseAnswerPack(JSON.stringify(template), scenario);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    const same = applyAnswerPack(scenario, parsed.pack);
    const questions = ['Какая температура воды нужна после теплообменника?', 'Какое давление?', 'После насоса', 'Абракадабра'];
    expect(talk(same, questions).map((r) => r.text)).toEqual(talk(scenario, questions).map((r) => r.text));
  });
});

describe('Замена ответов', () => {
  it('новый текст ответа используется, факты и оценка сохраняются', () => {
    const custom = load(pack([{ id: 'temp_setpoint', replies: ['На выходе держим 60 °C, это наш режим мойки.'] }]));
    const [reply] = talk(custom, ['Какая температура воды нужна после теплообменника?']);
    expect(reply.text).toBe('На выходе держим 60 °C, это наш режим мойки.');
    expect(reply.factIds).toEqual(['temp_setpoint']);
  });

  it('шаги и короткий повтор', () => {
    const custom = load(pack([{ id: 'temp_inlet', steps: [['Зимой где-то 10.'], ['Летом 20–25.']], repeat: ['Зимой 10, летом 20–25.'] }]));
    const replies = talk(custom, ['Какая температура воды на входе?', 'Что ещё?', 'Какая температура воды на входе?', 'Какая температура воды на входе?']);
    expect(replies[0].text).toBe('Зимой где-то 10.');
    expect(replies[1].text).toBe('Летом 20–25.');
    expect(replies[3].text).toContain('Зимой 10, летом 20–25.');
  });

  it('добавленный вопрос исправляет распознавание', () => {
    const question = 'Насколько горячей должна быть вода';
    expect(talk(scenario, [question])[0].intentId).not.toBe('temp_setpoint');
    const custom = load(pack([{ id: 'temp_setpoint', questions: [question] }]));
    expect(talk(custom, [question])[0].intentId).toBe('temp_setpoint');
    expect(talk(custom, ['насколько горячей должна быть вода?'])[0].intentId).toBe('temp_setpoint');
  });

  it('новая тема отвечает на свои вопросы и на близкие формулировки', () => {
    const custom = load(pack([{ title: 'Обслуживающий персонал', questions: ['Кто будет обслуживать систему?'], replies: ['Наши наладчики, двое на смену.'] }]));
    expect(talk(custom, ['Кто будет обслуживать систему?'])[0].text).toBe('Наши наладчики, двое на смену.');
    expect(talk(custom, ['А кто будет обслуживать эту систему?'])[0].text).toBe('Наши наладчики, двое на смену.');
    expect(talk(custom, ['Кто будет обслуживать систему?', 'Кто будет обслуживать систему?'])[1].text).toBe('Наши наладчики, двое на смену.');
  });

  it('приветствие, непонятный вопрос и встречные вопросы', () => {
    const custom = load(
      pack([], { greeting: ['Здравствуйте, слушаю.'], fallback: ['Не понял, спросите проще.'], clarifications: { pressure: ['Где именно давление?'] } }),
    );
    expect(custom.greeting).toEqual(['Здравствуйте, слушаю.']);
    expect(talk(custom, ['Абракадабра'])[0].text).toContain('Не понял, спросите проще.');
    expect(talk(custom, ['Какое давление?'])[0].text).toBe('Где именно давление?');
  });

  it('исходный сценарий не меняется', () => {
    load(pack([{ id: 'temp_setpoint', replies: ['Другое 60'], questions: ['вопрос'] }]));
    expect(scenario.replies.temp_setpoint[0].variants[0]).not.toBe('Другое 60');
    expect(scenario.intents.find((i) => i.id === 'temp_setpoint')!.priorityExamples).toBeUndefined();
  });
});

describe('Проверка файла', () => {
  const errors = (value: unknown) => {
    const parsed = parseAnswerPack(typeof value === 'string' ? value : JSON.stringify(value), scenario);
    return parsed.ok ? [] : parsed.errors;
  };

  it('понятные ошибки', () => {
    expect(errors('{ "format": ')[0]).toContain('JSON');
    expect(errors({ answers: [] })[0]).toContain('format');
    expect(errors({ format: ANSWER_PACK_FORMAT })[0]).toContain('answers');
    expect(errors(pack([{ id: 'temp_setpoint', replies: 'текст' }]))[0]).toContain('списком строк');
    expect(errors(pack([{ title: 'Новое', replies: ['Ответ'] }]))[0]).toContain('questions');
    expect(errors(pack([{ questions: ['Вопрос'] }]))[0]).toContain('replies');
  });

  it('предупреждает, если в ответе потеряно значение из эталона', () => {
    const parsed = parseAnswerPack(JSON.stringify(pack([{ id: 'temp_setpoint', replies: ['Около 65 градусов.'] }])), scenario);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.warnings[0]).toContain('60');
  });

  it('считает изменённые и новые темы', () => {
    const parsed = parseAnswerPack(
      JSON.stringify(pack([{ id: 'temp_setpoint', replies: ['60 градусов.'] }, { questions: ['Вопрос?'], replies: ['Ответ.'] }])),
      scenario,
    );
    expect(parsed.ok && parsed.summary).toEqual({ changed: 1, added: 1, questions: 1 });
  });
});
