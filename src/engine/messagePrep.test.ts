import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import type { Scenario } from '../types';
import { applyAnswerPack, parseAnswerPack } from './answerPack';
import { createEngineState, respond } from './dialogueEngine';
import { analyze } from './intentMatcher';
import { prepareMessage } from './messagePrep';
import { frameAction } from './questionFrame';

describe('Подготовка сообщения: вежливый префикс', () => {
  it.each([
    ['Здравствуйте. Что за узел у вас?', 'Что за узел у вас?', true],
    ['Хорошо. Есть ли бак?', 'Есть ли бак?', false],
    ['Здравствуйте! Нам нужно сделать ТЗ на вашу установку. Расскажите, что у вас за система?', 'Расскажите, что у вас за система?', true],
    ['Понятно, а какой напор?', 'а какой напор?', false],
    ['Нам надо сделать ТЗ. Как работает установка?', 'Как работает установка?', false],
  ])('%s', (text, body, greeted) => {
    const prepared = prepareMessage(text);
    expect(prepared.body).toBe(body);
    expect(prepared.greeted).toBe(greeted);
    expect(prepared.prefix).not.toBeNull();
  });
  it.each(['Здравствуйте!', 'Спасибо, всё понятно', 'Спасибо за ответы', 'Хорошо', 'Какое давление после насоса?'])('без отделения: %s', (text) => {
    expect(prepareMessage(text).body).toBe(text);
  });
});

describe('Смысловая рамка: время и действие', () => {
  const frameOf = (text: string) => analyze(text, scenario).frame;
  it('время вопроса', () => {
    expect(frameOf('Какие режимы есть сейчас?').time).toBe('current');
    expect(frameOf('Какие режимы нужно предусмотреть?').time).toBe('future');
    expect(frameOf('Какая мощность насоса?').time).toBe('unspecified');
  });
  it('«сейчас» побеждает «контролируемые параметры»', () => {
    const frame = frameOf('Какие параметры сейчас контролируют?');
    expect(frame.monitorFuture).toBe(false);
    expect(frame.currentOperation).toBe(true);
    expect(frameOf('Какие параметры нужно контролировать?').monitorFuture).toBe(true);
  });
  it('состав узла — отдельно от «составить ТЗ» и схемы подключения', () => {
    expect(frameOf('Из чего состоит узел?').composition).toBe(true);
    expect(frameOf('Опишите состав узла и путь воды').composition).toBe(true);
    expect(frameOf('Можете составить техническое задание сами?').composition).toBe(false);
    expect(frameOf('Какая схема подключения нужна?').composition).toBe(false);
  });
  it('«что установлено» — инвентарь, но не «где установлено» и не «сколько стоит»', () => {
    expect(frameOf('Что сейчас установлено?').inventory).toBe(true);
    expect(frameOf('Где установлено оборудование?').inventory).toBe(false);
    expect(frameOf('Сколько стоит проект?').inventory).toBe(false);
  });
  it('потеря питания и сухой ход', () => {
    expect(frameOf('А если пропало электропитание, что должно быть?').powerLoss).toBe(true);
    expect(frameOf('Что с клапаном при потере питания?').powerLoss).toBe(false);
    expect(frameOf('Нужна защита от сухого хода?').dryRun).toBe(true);
  });
  it('действие для диагностики', () => {
    const a = analyze('Из чего состоит узел?', scenario);
    expect(frameAction(a.frame, a.concepts)).toBe('inventory');
    const b = analyze('Как сейчас регулируете температуру?', scenario);
    expect(frameAction(b.frame, b.concepts)).toBe('operating_state');
  });
});

describe('Диагностика ответа (для преподавателя)', () => {
  it('ответ несёт рамку, причину и вежливый префикс', () => {
    const out = respond(createEngineState(), { text: 'Здравствуйте. Какие характеристики у насоса?', seed: 1, difficulty: 'standard' }, scenario);
    expect(out.reply.diagnostic?.frame?.prefix).toMatch(/здравствуйте/i);
    expect(out.reply.diagnostic?.frame?.subjects).toContain('pump');
    expect(out.reply.diagnostic?.reason).toMatch(/Паспорт/);
  });
  it('честное «не знаю» помечено классом неизвестности и не раскрывает фактов', () => {
    const out = respond(createEngineState(), { text: 'Сколько насосов установлено?', seed: 1, difficulty: 'standard' }, scenario);
    expect(out.reply.uncertainty?.kind).toBe('survey');
    expect(out.reply.factIds).toEqual([]);
    expect(out.state.uncertain).toContain('pump_count');
    expect(out.state.disclosed).toEqual([]);
    const designer = respond(createEngineState(), { text: 'Каким сигналом управлять приводом: 4–20 мА или 0–10 В?', seed: 1, difficulty: 'standard' }, scenario);
    expect(designer.reply.uncertainty?.kind).toBe('designer');
  });
  it('старое состояние без новых полей обрабатывается', () => {
    const legacy = createEngineState();
    delete (legacy as Partial<typeof legacy>).askedTexts;
    const out = respond({ ...legacy, lastSpec: undefined, missStreak: undefined, uncertain: undefined }, { text: 'Какие характеристики у насоса?', seed: 1, difficulty: 'standard' }, scenario);
    expect(out.reply.factIds.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Загруженный пакет ответов преподавателя проходит те же ограничения', () => {
  const parsed = parseAnswerPack(readFileSync('docs/otvety-zakazchika.json', 'utf8'), scenario);
  if (!parsed.ok) throw new Error('пакет не загрузился');
  const loaded: Scenario = applyAnswerPack(scenario, parsed.pack);
  const talk = (questions: string[]) => {
    let state = createEngineState();
    return questions.map((text) => {
      const out = respond(state, { text, seed: 1, difficulty: 'standard' }, loaded);
      state = out.state;
      return out.reply;
    });
  };
  it('вежливость, числа в вопросе, сейчас/надо, предмет, паспорт', () => {
    expect(talk(['Здравствуйте. Из чего состоит узел?'])[0].factIds).toContain('obj_flow');
    expect(talk(['Сколько градусов должно быть на мойку?', 'Какое отклонение от 60 °C допускается?'])[1].factIds).toContain('temp_tolerance');
    expect(talk(['Какие режимы работы есть сейчас?'])[0].intentId).toBe('purpose_current');
    expect(talk(['Какой контроллер поставить?'])[0].intentId).not.toBe('env_location');
    expect(talk(['Мощность, подача, напор насоса?'])[0].factIds).toEqual(expect.arrayContaining(['pump_power', 'pump_nominal', 'pump_head']));
    expect(talk(['Хорошо. Есть ли бак?'])[0].quality).toBe('unknown_found');
  });
  it('паспортный блок говорит текстом пакета', () => {
    const reply = talk(['Какие характеристики у насоса?'])[0];
    const packTexts = (loaded.replies.pump_power ?? []).flatMap((step) => step.variants);
    if (reply.factIds.includes('pump_power')) expect(packTexts.some((text) => reply.text.includes(text))).toBe(true);
  });
});
