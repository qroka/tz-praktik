import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import type { EngineReply, Scenario } from '../types';
import { applyAnswerPack, buildAnswerTemplate, parseAnswerPack } from './answerPack';
import { createEngineState, respond } from './dialogueEngine';

const parsed = parseAnswerPack(readFileSync('docs/otvety-zakazchika.json', 'utf8'), scenario);
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const loaded = applyAnswerPack(scenario, parsed.pack);
const cases: [string, string | null, EngineReply['quality'], string[], string][] = [
  ["Какие режимы работы есть сейчас", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["Какие режимы работы нужно предусмотреть", "modes_list", "useful", ["mode_auto", "mode_manual", "mode_service"], "режим|автомат|ручн"],
  ["Сейчас система работает автоматически?", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["Что сейчас регулируется вручную?", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["Что работает в автоматическом режиме, а что в ручном?", null, "clarify", [], "сейчас|после автоматизации"],
  ["Какие режимы будут после автоматизации?", "modes_list", "useful", ["mode_auto", "mode_manual", "mode_service"], "автомат|ручн"],
  ["Что оператор делает сейчас?", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["Что изменится после внедрения автоматики?", "purpose_goal", "useful", ["purpose_goal"], "температур|давлен"],
  ["Что уже автоматизировано на объекте?", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["Какие параметры сейчас регулирует оператор?", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["Какое оборудование уже установлено?", "object_desc", "useful", ["obj_flow"], "теплообменник|насос"],
  ["Какие приборы сейчас есть в наличии?", "object_desc", "useful", ["obj_flow"], "перечень.*уточнить"],
  ["Какие исполнительные устройства стоят сейчас?", "object_desc", "useful", ["obj_flow"], "перечень.*уточнить"],
  ["Какое оборудование нужно будет подобрать?", "eq_requirements", "useful", ["eq_industrial"], "промышлен"],
  ["Какой насос у вас установлен?", "about_pump", "general", ["pump_type"], "центробеж"],
  ["Какая мощность у насоса?", "pump_power", "useful", ["pump_power"], "2[,.]2"],
  ["Как сейчас управляется насос?", null, "unknown_found", [], "не уточнён|проверить"],
  ["Как предлагаете управлять насосом после автоматизации?", "pump_control", "useful", ["pump_vfd"], "частот"],
  ["Какой теплообменник используется?", "about_hx", "general", ["hx_type"], "пластинчат"],
  ["Есть ли на объекте сжатый воздух?", "air_available", "useful", ["air_pressure"], "воздух"],
  ["Какие параметры нужно контролировать?", "purpose_goal", "useful", ["purpose_goal"], "температур|давлен"],
  ["Какую температуру воды надо поддерживать?", "temp_setpoint", "useful", ["temp_setpoint"], "60"],
  ["Какая температура поступающей воды зимой?", "temp_inlet_winter", "useful", ["temp_inlet_winter"], "10"],
  ["А летом?", null, "unrecognized", [], "."],
  ["Какое допустимое отклонение по температуре?", "temp_tolerance", "blocked", [], "температур|значени"],
  ["При какой температуре нужна аварийная остановка нагрева?", "temp_alarm", "useful", ["temp_alarm"], "75"],
  ["Какой рабочий расход воды?", "flow_range", "useful", ["flow_range"], "1[,.]5|полутора"],
  ["При каком расходе считать, что циркуляции нет?", "flow_low", "useful", ["flow_low"], "0[,.]8"],
  ["Какое давление воды до насоса?", "press_in_normal", "useful", ["press_in_normal"], "0[,.]15"],
  ["А после насоса?", null, "unrecognized", [], "."],
  ["Какое давление теплоносителя?", "hc_pressure", "useful", ["hc_pressure"], "0[,.]6"],
  ["Что должно произойти при низком давлении?", null, "clarify", [], "давление|Давление"],
  ["Что происходит при перегреве?", "temp_alarm_action", "useful", ["temp_alarm_action"], "нагрев"],
  ["Какие защиты должны работать в ручном режиме?", "mode_protections", "useful", ["mode_protections"], "защит"],
  ["Что делать при потере сигнала датчика температуры?", "sensor_temp_loss", "useful", ["sensor_temp_loss"], "клапан|Клапан"],
  ["Какие данные нужно показывать оператору?", "hmi_main", "useful", ["hmi_temp", "hmi_press_in", "hmi_press_out"], "температур|Температур"],
  ["Нужен ли журнал аварий?", "hmi_log", "useful", ["hmi_log"], "журнал"],
  ["Можно ли оператору менять уставки?", "hmi_setpoints", "useful", ["hmi_setpoints"], "температур|Температур"],
  ["Какое электропитание есть на объекте?", "power_available", "useful", ["power_available"], "400"],
  ["Какое питание требуется цепям автоматики?", "power_control", "useful", ["power_control"], "24"],
  ["Какую модель контроллера ставить?", "unk_plc_model", "unknown_found", ["unk_plc_model"], "модел|Модел|выбор|Выбор|подберите|Подберите"],
  ["Какую марку датчиков рекомендуете?", "unk_sensor_vendor", "unknown_found", ["unk_sensor_vendor"], "марк|Марк|производител|знаю"],
  ["Какие кабели использовать?", "unk_cable_brand", "unknown_found", ["unk_cable_brand"], "кабел"],
  ["Кто должен выбрать оборудование?", null, "unknown_found", [], "согласуйте"],
  ["Расскажите всё об установке", "general_all", "general", ["purpose_goal", "purpose_manual"], "температур|параметр"],
  ["Что по температуре?", null, "clarify", [], "температур|Температур"],
  ["а по давлению?", null, "clarify", [], "давление|Давление"],
  ["какие режими работы есть щас", "purpose_current", "useful", ["purpose_manual"], "вручную|руками|оператор"],
  ["чо там с насосом", "about_pump", "general", ["pump_type"], "центробеж"],
  ["спасибо, теперь понятно", "thanks", "social", [], "."]
];

function talk(target: Scenario, questions: string[]) {
  let state = createEngineState();
  return questions.map(text => {
    const result = respond(state, {text, seed: 1, difficulty: 'standard'}, target);
    state = result.state;
    return result.reply;
  });
}

for (const [name, target] of [['базовый', scenario], ['JSON', loaded]] as const) {
  describe(name, () => {
    it.each(cases)('отдельно: %s', (question, id, quality, facts, meaning) => {
      const reply = talk(target, [question])[0];
      // В пакете есть собственная общая реплика, тоже не раскрывающая факты.
      if (question === 'Что по температуре?' && target === loaded) {
        id = 'about_temp'; quality = 'general';
      }
      expect(reply.intentId).toBe(id);
      expect(reply.quality).toBe(quality);
      expect(reply.factIds).toEqual(facts);
      expect(reply.text).toMatch(new RegExp(meaning, 'i'));
    });
    it('50 вопросов подряд: другой факт не превращается в повтор или следующий шаг чужой темы', () => {
      const replies = talk(target, cases.map(([q]) => q));
      for (const [index, reply] of replies.entries()) {
        const [question, id, , facts] = cases[index];
        if ([23, 24, 29, 45].includes(index)) continue; // явные контекстные уточнения проверены ниже
        expect(reply.intentId, question).toBe(id);
        expect(reply.factIds, question).toEqual(facts);
        if (id && cases.findIndex(c => c[1] === id) === index) expect(reply.quality, question).not.toBe('repeat');
      }
      expect(replies[23].factIds).toEqual(['temp_inlet_summer']);
      expect(replies[24].factIds).toEqual(['temp_tolerance']);
      expect(replies[29].factIds).toEqual(['press_out_setpoint']);
      expect(replies[35].factIds).toEqual(['hmi_temp', 'hmi_press_in', 'hmi_press_out']);
    });
    it.each([
      [['Какая температура входной воды зимой?', 'А летом?'], 'temp_inlet_summer', ['temp_inlet_summer']],
      [['Какое давление воды до насоса?', 'А после насоса?'], 'press_out_setpoint', ['press_out_setpoint']],
      [['Какое давление воды после насоса?', 'А до насоса?'], 'press_in_normal', ['press_in_normal']],
      [['Какие режимы работы есть сейчас?', 'Какие режимы будут после автоматизации?'], 'modes_list', ['mode_auto', 'mode_manual', 'mode_service']],
      [['Как сейчас управляется насос?', 'Как предлагаете управлять насосом после автоматизации?'], 'pump_control', ['pump_vfd']],
      [['При каком расходе считать, что циркуляции нет?', 'Какое давление до насоса?'], 'press_in_normal', ['press_in_normal']],
      [['Какое давление?', 'Какие данные показывать оператору?'], 'hmi_main', ['hmi_temp', 'hmi_press_in', 'hmi_press_out']],
    ] as [string[], string, string[]][])('контекст: %j', (questions, id, facts) => {
      const reply = talk(target, questions).at(-1)!;
      expect(reply.intentId).toBe(id);
      expect(reply.quality).toBe('useful');
      expect(reply.factIds).toEqual(facts);
    });
    it.each(['спасибо, теперь понятно', 'понял', 'давайте', 'до свидания'])('социальная реплика: %s', text => {
      const reply = talk(target, ['Какое давление?', text]).at(-1)!;
      expect(reply.quality).toBe('social');
      expect(reply.factIds).toEqual([]);
    });
  });
}

it('пакет сохраняет исходные 113 тем, факты и число шагов', () => {
  expect(buildAnswerTemplate(scenario).answers).toHaveLength(113);
  expect(loaded.facts).toEqual(scenario.facts);
  expect(Object.fromEntries(Object.entries(loaded.replies).map(([id, steps]) => [id, steps.length])))
    .toEqual(Object.fromEntries(Object.entries(scenario.replies).map(([id, steps]) => [id, steps.length])));
});

it.each([
  ['какой объект автоматизации чем надо управлять', 'object_desc', 'obj_flow'],
  ['что управляется вручную', 'purpose_current', 'purpose_manual'],
  ['какие приборы', 'object_desc', 'obj_flow'],
  ['исполнительные устройства', 'object_desc', 'obj_flow'],
  ['что есть', 'object_desc', 'obj_flow'],
  ['какое питание', 'power_available', 'power_available'],
  ['как работает', 'purpose_current', 'purpose_manual'],
  ['какой контроллер', 'eq_plc', 'eq_plc'],
])('словарь студента: %s', (text, id, fact) => {
  const reply = talk(scenario, [text])[0];
  expect(reply.intentId).toBe(id);
  expect(reply.factIds).toContain(fact);
});

it.each([
  ['modes_list', 'Какие режимы работы есть сейчас', 'purpose_current', ['purpose_manual']],
  ['purpose_current', 'Какие режимы будут после автоматизации?', 'modes_list', ['mode_auto', 'mode_manual', 'mode_service']],
  ['env_location', 'Какое оборудование уже установлено?', 'object_desc', ['obj_flow']],
  ['hmi_main', 'Что оператор делает сейчас?', 'purpose_current', ['purpose_manual']],
  ['power_control', 'какой объект автоматизации чем надо управлять', 'object_desc', ['obj_flow']],
  ['press_in_run', 'Какое давление воды до насоса?', 'press_in_normal', ['press_in_normal']],
  ['press_out_setpoint', 'Какое давление воды до насоса?', 'press_in_normal', ['press_in_normal']],
  ['flow_display', 'Какие данные нужно показывать оператору?', 'hmi_main', ['hmi_temp', 'hmi_press_in', 'hmi_press_out']],
  ['pump_control', 'Как сейчас управляется насос?', null, []],
  ['eq_requirements', 'Кто должен выбрать оборудование?', null, []],
  ['temp_setpoint', 'спасибо, теперь понятно', 'thanks', []],
] as [string, string, string | null, string[]][])('конфликтующий точный вопрос пакета: %s', (wrongId, question, id, facts) => {
  const pack = parseAnswerPack(JSON.stringify({format: 'tz-praktikum-answers', version: 1, answers: [{id: wrongId, questions: [question]}]}), scenario);
  expect(pack.ok).toBe(true);
  if (!pack.ok) return;
  const reply = talk(applyAnswerPack(scenario, pack.pack), [question])[0];
  expect(reply.intentId).toBe(id);
  expect(reply.factIds).toEqual(facts);
  expect(reply.quality).not.toBe('unrecognized');
});

it.each(['Сейчас', 'Щас', 'Уже', 'Пока', 'На данный момент'])('%s: настоящее не становится проектным режимом', cue => {
  const reply = talk(loaded, [`${cue} система работает автоматически?`])[0];
  expect(reply.intentId).toBe('purpose_current');
  expect(reply.factIds).toEqual(['purpose_manual']);
});

it.each(['нужно предусмотреть', 'требуется предусмотреть', 'планируется предусмотреть', 'должны быть', 'будут после автоматизации'])('будущее: %s', cue => {
  expect(talk(loaded, [`Какие режимы ${cue}?`])[0].factIds).toEqual(['mode_auto', 'mode_manual', 'mode_service']);
});

it('наличие оборудования не означает наличие будущего способа управления', () => {
  for (const text of ['У вас уже установлен частотник?', 'Как пока управляется насос?', 'Как на данный момент регулируется насос?']) {
    const reply = talk(loaded, [text])[0];
    expect(reply.quality).toBe('unknown_found');
    expect(reply.factIds).toEqual([]);
    expect(reply.text).toMatch(/проверить|уточн/);
  }
});

it('сезонное уточнение не наследует температуру на выходе', () => {
  const reply = talk(loaded, ['Какую температуру поддерживать?', 'А летом?']).at(-1)!;
  expect(reply.factIds).toEqual([]);
});

it.each(['learning', 'standard', 'strict'] as const)('бессмыслица с pending и replyTo: %s', difficulty => {
  const previous = respond(createEngineState(), {text: 'Какое давление?', seed: 1, difficulty}, loaded).state;
  const result = respond(previous, {text: 'ываыва ???', seed: 1, difficulty, replyTo: {topic: 'hmi', intentId: 'hmi_main', factIds: ['hmi_temp']}}, loaded);
  expect(result.reply.factIds).toEqual([]);
  expect(result.reply.quality).toBe('unrecognized');
  expect(result.state.disclosed).toEqual(previous.disclosed);
  expect(result.state.pending).toBeNull();
  expect(result.reply.text).not.toContain('«');
});
