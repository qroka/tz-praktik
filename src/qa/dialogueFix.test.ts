// Обязательный регрессионный набор ТЗ на исправление UX диалога (раздел 6) + негативные сценарии.
// Проверяется смысл: intentId, тип ответа, подтверждённые factIds, отсутствие чужих значений.
import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import { createEngineState, respond } from '../engine/dialogueEngine';
import type { Difficulty, EngineReply, EngineState } from '../types';

type Turn = { state: EngineState; reply: EngineReply };

function talk(questions: string[], seed = 1, difficulty: Difficulty = 'standard'): Turn[] {
  let state = createEngineState();
  return questions.map((text) => {
    const out = respond(state, { text, seed, difficulty }, scenario);
    state = out.state;
    return out;
  });
}
const last = (questions: string[], seed = 1) => talk(questions, seed).at(-1)!;
const SEEDS = [1, 2, 3, 7, 42];

/** Проверка на нескольких seed: смысл не должен зависеть от выбранного варианта реплики. */
function eachSeed(questions: string[], check: (turn: Turn, turns: Turn[]) => void) {
  for (const seed of SEEDS) {
    const turns = talk(questions, seed);
    check(turns.at(-1)!, turns);
  }
}

describe('Раздел 6: обязательные примеры', () => {
  it('1. Приветствие + «Что за узел» — приветствие и схема узла', () =>
    eachSeed(['Здравствуйте. Что за узел у вас?'], ({ reply }) => {
      expect(reply.text).toMatch(/здравств|добрый|приветств/i);
      expect(reply.factIds).toContain('obj_flow');
      expect(reply.text).toMatch(/теплообмен/i);
    }));

  it('2. «Нам надо сделать ТЗ. Как работает установка?» — не write_for_me', () =>
    eachSeed(['Нам надо сделать ТЗ. Как работает установка?'], ({ reply }) => {
      expect(reply.intentId).not.toBe('write_for_me');
      expect(reply.factIds.length).toBeGreaterThan(0);
    }));

  it('3. «Хорошо. Есть ли бак?» — честное «не уточнено», не благодарность', () =>
    eachSeed(['Хорошо. Есть ли бак?'], ({ reply }) => {
      expect(reply.intentId).not.toBe('thanks');
      expect(reply.quality).toBe('unknown_found');
      expect(reply.factIds).toEqual([]);
      expect(reply.text).toMatch(/не уточн|на объекте|не знаю|не скажу/i);
      expect(reply.text).not.toMatch(/(^|\s)(есть|нет)\s+бак/i);
    }));

  it('4. «Из чего состоит узел?» — состав', () =>
    eachSeed(['Из чего состоит узел?'], ({ reply }) => {
      expect(reply.factIds).toContain('obj_flow');
      expect(reply.text).toMatch(/теплообмен/i);
      expect(reply.text).toMatch(/насос/i);
    }));

  it('5. «Опишите состав узла и путь воды» — схема без «слишком общего»', () =>
    eachSeed(['Опишите состав узла и путь воды'], ({ reply }) => {
      expect(reply.factIds).toContain('obj_flow');
      expect(reply.quality).not.toBe('general');
    }));

  it('6. «Что сейчас установлено?» — известный состав + оговорка о перечне', () =>
    eachSeed(['Что сейчас установлено?'], ({ reply }) => {
      expect(reply.intentId).toBe('object_desc');
      expect(reply.text).toMatch(/уточнить на объекте|на объекте/i);
      expect(reply.text).not.toMatch(/частотн|контроллер|датчик/i);
    }));

  it('7. «Какие режимы работы есть сейчас?» — текущее ручное', () =>
    eachSeed(['Какие режимы работы есть сейчас?'], ({ reply }) => {
      expect(reply.intentId).toBe('purpose_current');
      expect(reply.text).toMatch(/вручн|руками|оператор/i);
      expect(reply.text).not.toMatch(/обслуживан/i);
    }));

  it('8. «Какие режимы нужно предусмотреть?» — три проектных режима', () =>
    eachSeed(['Какие режимы нужно предусмотреть?'], ({ reply }) => {
      expect(reply.intentId).toBe('modes_list');
      expect(reply.text).toMatch(/обслуживан/i);
    }));

  it('9. «Как сейчас управляется насос?» — не уточнено', () =>
    eachSeed(['Как сейчас управляется насос?'], ({ reply }) => {
      expect(reply.quality).toBe('unknown_found');
      expect(reply.text).toMatch(/не уточн|проверить на объекте/i);
      expect(reply.factIds).not.toContain('pump_vfd');
    }));

  it('10. «Как нужно управлять насосом?» — требование ПЧ', () =>
    eachSeed(['Как нужно управлять насосом?'], ({ reply }) => {
      expect(reply.intentId).toBe('pump_control');
      expect(reply.factIds).toContain('pump_vfd');
      expect(reply.text).not.toMatch(/уже стоит|уже установлен/i);
    }));

  it('11. «Какие характеристики у насоса?» — компактный набор паспортных данных', () =>
    eachSeed(['Какие характеристики у насоса?'], ({ reply }) => {
      const pumpFacts = ['pump_type', 'pump_power', 'pump_nominal', 'pump_head', 'pump_supply'];
      expect(reply.factIds.filter((id) => pumpFacts.includes(id)).length).toBeGreaterThanOrEqual(2);
      expect(reply.factIds.length).toBeLessThanOrEqual(4);
      expect(reply.factIds.every((id) => pumpFacts.includes(id))).toBe(true);
      expect(reply.text).not.toMatch(/спрашивайте отдельно/i);
    }));

  it('12. «Мощность, подача, напор насоса?» — три значения', () =>
    eachSeed(['Мощность, подача, напор насоса?'], ({ reply }) => {
      expect(reply.factIds).toEqual(expect.arrayContaining(['pump_power', 'pump_nominal', 'pump_head']));
      expect(reply.text).toMatch(/2,2/);
      expect(reply.text).toMatch(/5/);
      expect(reply.text).toMatch(/32/);
    }));

  it('13. «Какая мощность насоса?» → «А сколько он качает?» — подача', () =>
    eachSeed(['Какая мощность насоса?', 'А сколько он качает?'], ({ reply }) => {
      expect(reply.intentId).toBe('pump_nominal');
      expect(reply.factIds).toContain('pump_nominal');
    }));

  it('14. «Температура воды на входе в теплообменник» — входная вода, не 110 °C', () =>
    eachSeed(['Какая температура воды на входе в теплообменник?'], ({ reply }) => {
      expect(reply.intentId).toMatch(/^temp_inlet/);
      expect(reply.text).not.toMatch(/110/);
    }));

  it('15. «Входная вода зимой» → «А летом?» — летний диапазон', () =>
    eachSeed(['Какая температура входной воды зимой?', 'А летом?'], ({ reply }) => {
      expect(reply.factIds).toContain('temp_inlet_summer');
      expect(reply.text).toMatch(/20/);
    }));

  it('16. «Сколько градусов должно быть на мойку?» — 60 °C', () =>
    eachSeed(['Сколько градусов должно быть на мойку?'], ({ reply }) => {
      expect(reply.factIds).toContain('temp_setpoint');
      expect(reply.text).not.toMatch(/110/);
    }));

  it('17. после 60 °C: «Какое отклонение от 60 °C допускается?» — ±2 °C', () =>
    eachSeed(['Сколько градусов должно быть на мойку?', 'Какое отклонение от 60 °C допускается?'], ({ reply }) => {
      expect(reply.factIds).toContain('temp_tolerance');
      expect(reply.quality).not.toBe('correction');
      expect(reply.text).not.toMatch(/не называл/i);
    }));

  it('18. «Какое давление до насоса?» → «А после?» — давление после', () =>
    eachSeed(['Какое давление до насоса?', 'А после?'], ({ reply }) => {
      expect(reply.intentId).toBe('press_out_setpoint');
      expect(reply.text).not.toMatch(/0,45|0,15/);
    }));

  it('19. «Какое давление на мойку?» — 0,30 МПа', () =>
    eachSeed(['Какое давление на мойку?'], ({ reply }) => {
      expect(reply.factIds).toContain('press_out_setpoint');
      expect(reply.text).not.toMatch(/0,45/);
    }));

  it('20. «Какая защита от низкого давления после насоса?» — не 0,45 МПа', () =>
    eachSeed(['Какая защита от низкого давления после насоса?'], ({ reply }) => {
      expect(reply.text).not.toMatch(/0,45/);
      expect(reply.factIds).not.toContain('press_out_alarm');
      expect(['unknown_found', 'clarify']).toContain(reply.quality);
    }));

  it('21. «Какое питание на объекте?» — 400/230 В', () =>
    eachSeed(['Какое питание на объекте?'], ({ reply }) => {
      expect(reply.factIds).toContain('power_available');
      expect(reply.factIds).not.toContain('env_cabinet');
    }));

  it('21б. «Какое напряжение питания есть для шкафа?» — питание, не место шкафа', () =>
    eachSeed(['Какое напряжение питания есть для шкафа?'], ({ reply }) => {
      expect(reply.factIds).toContain('power_available');
      expect(reply.intentId).not.toBe('env_cabinet');
    }));

  it('22. «Какие цепи питания у автоматики?» — 24 В DC', () =>
    eachSeed(['Какие цепи питания у автоматики?'], ({ reply }) => {
      expect(reply.factIds).toContain('power_control');
      expect(reply.intentId).not.toBe('env_cabinet');
    }));

  it('23. «Помещение взрывоопасное?» — нет взрывоопасной зоны', () =>
    eachSeed(['Помещение взрывоопасное?'], ({ reply }) => {
      expect(reply.factIds).toContain('env_ex');
    }));

  it('24. «Каким сигналом привод: 4–20 мА или 0–10 В?» — выбор инженера', () =>
    eachSeed(['Каким сигналом привод: 4–20 мА или 0–10 В?'], ({ reply }) => {
      expect(['correction', 'confirmation']).not.toContain(reply.quality);
      expect(reply.quality).toBe('unknown_found');
      expect(reply.text).not.toMatch(/не говорил|так и есть|правильно/i);
    }));

  it('25. «Какие приборы уже стоят?» — инвентаризация неизвестна', () =>
    eachSeed(['Какие приборы уже стоят?'], ({ reply }) => {
      expect(reply.text).toMatch(/на объекте/i);
      expect(reply.text).not.toMatch(/датчик\S* (температуры|давления) (стоит|установлен)/i);
    }));

  it('26. «Сколько насосов? Есть резервный?» — проверить на объекте', () =>
    eachSeed(['Сколько насосов? Есть резервный?'], ({ reply }) => {
      expect(reply.quality).toBe('unknown_found');
      expect(reply.factIds).toEqual([]);
      expect(reply.text).not.toMatch(/(^|\s)(один|два|два насоса|один насос)(\s|[.,])/i);
    }));

  it('27. «Какой контроллер поставить?» — выбор проектировщика', () =>
    eachSeed(['Какой контроллер поставить?'], ({ reply }) => {
      expect(reply.intentId).not.toBe('env_location');
      expect(reply.text).not.toMatch(/внутри цеха/i);
      expect(['unk_plc_model', 'eq_plc']).toContain(reply.intentId);
    }));

  it('28. «Что такое теплоноситель?» — объяснение термина без значений', () =>
    eachSeed(['Что такое теплоноситель?'], ({ reply, state }) => {
      expect(reply.text).not.toMatch(/что именно/i);
      expect(reply.text).not.toMatch(/\d/);
      expect(reply.factIds).toEqual([]);
      expect(state.disclosed).toEqual([]);
    }));

  it('29. «Какую температуру держать и какой допуск?» — оба значения', () =>
    eachSeed(['Какую температуру держать и какой допуск?'], ({ reply }) => {
      expect(reply.factIds).toEqual(expect.arrayContaining(['temp_setpoint', 'temp_tolerance']));
      expect(reply.text).not.toMatch(/по одному/i);
    }));

  it('30. «Что вы знаете об авариях системы?» — без порогов', () =>
    eachSeed(['Что вы знаете об авариях системы?'], ({ reply }) => {
      expect(reply.text).not.toMatch(/\d/);
      const protection = scenario.facts.filter((f) => f.category === 'protection' || f.category === 'warning').map((f) => f.id);
      expect(reply.factIds.filter((id) => protection.includes(id))).toEqual([]);
    }));

  it('31. «Какое давление?» без контекста — уточнение точки', () =>
    eachSeed(['Какое давление?'], ({ reply }) => {
      expect(reply.quality).toBe('clarify');
      expect(reply.text).not.toMatch(/\d/);
    }));

  it('32. «Спасибо, всё понятно» — социальная реакция', () =>
    eachSeed(['Спасибо, всё понятно'], ({ reply }) => {
      expect(reply.quality).toBe('social');
      expect(reply.factIds).toEqual([]);
    }));

  it('33. «какие режими работы есть щас» — текущее состояние', () =>
    eachSeed(['какие режими работы есть щас'], ({ reply }) => {
      expect(reply.intentId).toBe('purpose_current');
      expect(reply.text).not.toMatch(/обслуживан/i);
    }));

  it('34. «Расскажите вообще всё об установке» — краткая вводная', () =>
    eachSeed(['Расскажите вообще всё об установке'], ({ reply }) => {
      expect(reply.factIds.length).toBeLessThanOrEqual(3);
      const allowed = ['purpose_goal', 'purpose_manual', 'obj_flow'];
      expect(reply.factIds.every((id) => allowed.includes(id))).toBe(true);
      expect(reply.text).not.toMatch(/\d/);
    }));
});

describe('Раздел 6: негативные сценарии', () => {
  it('после давления теплоносителя вопрос о температуре воды — новый предмет', () =>
    eachSeed(['Какое давление теплоносителя?', 'Какая температура воды нужна на мойку?'], ({ reply }) => {
      expect(reply.factIds).toContain('temp_setpoint');
    }));

  it('предупреждение и авария не смешиваются', () => {
    eachSeed(['При какой температуре предупреждать оператора?'], ({ reply }) => expect(reply.factIds).toEqual(['temp_warning']));
    eachSeed(['При какой температуре авария?'], ({ reply }) => expect(reply.factIds).toEqual(['temp_alarm']));
  });

  it('вопрос о расположении шкафа по-прежнему про место', () =>
    eachSeed(['Где можно поставить шкаф управления?'], ({ reply }) => {
      expect(reply.factIds).toContain('env_cabinet');
      expect(reply.factIds).not.toContain('power_available');
    }));

  it('подтверждение неверного числа после раскрытия поправляется', () =>
    eachSeed(['Сколько градусов должно быть на мойку?', 'Значит, рабочая температура 65 градусов?'], ({ reply }) => {
      expect(reply.quality).toBe('correction');
      expect(reply.text).toMatch(/60/);
    }));

  it('«Значит, аварийная температура 90 °C?» до раскрытия — поправка без раскрытия', () =>
    eachSeed(['Значит, аварийная температура 90 °C?'], ({ reply, state }) => {
      expect(reply.quality).toBe('correction');
      expect(reply.text).not.toMatch(/75/);
      expect(state.disclosed).not.toContain('temp_alarm');
    }));

  it('верное подтверждение остаётся подтверждением', () =>
    eachSeed(['При какой температуре авария?', 'Правильно понял, что авария при 75 градусах?'], ({ reply }) => {
      expect(reply.quality).toBe('confirmation');
    }));

  it('контекст не переезжает на явно новый предмет', () =>
    eachSeed(['Какая мощность насоса?', 'Какое давление теплоносителя?'], ({ reply }) => {
      expect(reply.factIds).toContain('hc_pressure');
    }));

  it('после аварийной температуры «А после насоса?» — без признака не приписывать аварию давлению', () =>
    eachSeed(['Какое давление до насоса?', 'А после?'], ({ reply }) => {
      expect(reply.factIds).not.toContain('press_out_alarm');
    }));

  it('«Что у нас с теплообменником?» → «А на какую температуру он рассчитан?» — предел ТО', () =>
    eachSeed(['Что у нас с теплообменником?', 'А на какую температуру он рассчитан?'], ({ reply }) => {
      expect(reply.factIds).toContain('hx_max_temp');
    }));

  it('сейчас → заменить → предусмотреть: три разных осмысленных ответа', () =>
    eachSeed(['Что сейчас установлено?', 'А что из этого нужно заменить?', 'Что тогда надо предусмотреть в новой системе?'], (_, turns) => {
      expect(turns.map((t) => t.reply.quality)).not.toContain('unrecognized');
      expect(new Set(turns.map((t) => t.reply.text)).size).toBe(3);
      expect(turns[1].reply.text).not.toMatch(/замен\S* (насос|теплообменник|двигател)/i);
    }));

  it('«Какие параметры сейчас контролируют?» — не будущая телеметрия', () =>
    eachSeed(['Какие параметры сейчас контролируют?'], ({ reply }) => {
      expect(reply.intentId).toBe('purpose_current');
      expect(reply.text).not.toMatch(/расход/i);
      expect(reply.text).not.toMatch(/датчиков нет|приборов нет/i);
    }));

  it('«Какие параметры нужно контролировать?» — будущие параметры, а не «сейчас»', () =>
    eachSeed(['Какие параметры нужно контролировать?'], ({ reply }) => {
      expect(reply.intentId).not.toBe('purpose_current');
      expect(reply.text).toMatch(/температур/i);
    }));

  it('мощность → напор — два разных вопроса, не повтор', () =>
    eachSeed(['Какая мощность насоса?', 'А какой напор?'], ({ reply }) => {
      expect(reply.factIds).toContain('pump_head');
      expect(reply.quality).not.toBe('repeat');
    }));

  it('«А как им сейчас управляют?» после насоса — способ сейчас не уточнён', () =>
    eachSeed(['Какая мощность насоса?', 'А как им сейчас управляют?'], ({ reply }) => {
      expect(reply.quality).toBe('unknown_found');
      expect(reply.factIds).not.toContain('pump_vfd');
    }));

  it('сведения не раскрываются без сказанного: factIds ответа = раскрытое этим ответом или уже известное', () => {
    for (const seed of SEEDS) {
      let state = createEngineState();
      for (const text of ['Какие характеристики у насоса?', 'А ещё?', 'Расскажите про теплообменник', 'Что по питанию?']) {
        const before = new Set(state.disclosed);
        const out = respond(state, { text, seed, difficulty: 'standard' }, scenario);
        const fresh = out.state.disclosed.filter((id) => !before.has(id));
        for (const id of fresh) expect(out.reply.factIds, `${text}: ${id}`).toContain(id);
        state = out.state;
      }
    }
  });

  it('широкие вопросы не раскрывают защиты', () => {
    const protection = new Set(scenario.facts.filter((f) => ['protection', 'warning'].includes(f.category)).map((f) => f.id));
    for (const text of ['Расскажите всё об установке', 'Какие характеристики у насоса?', 'Что по паспорту теплообменника?', 'Какое питание доступно на объекте?', 'Какие параметры теплоносителя известны?', 'Что вы знаете об авариях системы?']) {
      eachSeed([text], ({ state }) => expect(state.disclosed.filter((id) => protection.has(id)), text).toEqual([]));
    }
  });

  it('один seed и одно состояние — один ответ', () => {
    const a = talk(['Здравствуйте. Что за узел?', 'Какие характеристики у насоса?', 'А летом?'], 5);
    const b = talk(['Здравствуйте. Что за узел?', 'Какие характеристики у насоса?', 'А летом?'], 5);
    expect(a.map((t) => t.reply.text)).toEqual(b.map((t) => t.reply.text));
  });

  it('разные seed не меняют набор подтверждённых фактов', () => {
    const questions = ['Из чего состоит узел?', 'Какие характеристики у насоса?', 'Мощность, подача, напор насоса?', 'Какая температура воды нужна на мойку?', 'Какое отклонение?'];
    const sets = SEEDS.map((seed) => JSON.stringify(talk(questions, seed).map((t) => [...t.reply.factIds].sort())));
    expect(new Set(sets).size).toBe(1);
  });

  it('три режима сложности: P0-ответы не ломаются', () => {
    for (const difficulty of ['learning', 'standard', 'strict'] as Difficulty[]) {
      let state = createEngineState();
      const out1 = respond(state, { text: 'Здравствуйте. Из чего состоит узел?', seed: 3, difficulty }, scenario);
      expect(out1.reply.factIds, difficulty).toContain('obj_flow');
      state = out1.state;
      const out2 = respond(state, { text: 'Какая температура воды нужна на мойку?', seed: 3, difficulty }, scenario);
      state = out2.state;
      const out3 = respond(state, { text: 'Какое отклонение от 60 °C допускается?', seed: 3, difficulty }, scenario);
      expect(out3.reply.factIds, difficulty).toContain('temp_tolerance');
    }
  });

  it('после повторного аудита: «что стоит на насосе», «как устроен узел», «если воды нет»', () => {
    eachSeed(['Как будем управлять насосом?', 'А что сейчас стоит на насосе?'], ({ reply }) => {
      expect(reply.quality).toBe('unknown_found');
      expect(reply.text).not.toMatch(/спрашивайте отдельно/i);
    });
    eachSeed(['Как сейчас устроен узел горячей воды?'], ({ reply }) => expect(reply.factIds).toContain('obj_flow'));
    eachSeed(['Как у вас сейчас всё устроено?'], ({ reply }) => expect(reply.factIds).toContain('purpose_manual'));
    eachSeed(['Какая защита по расходу нужна?', 'А если воды нет?'], ({ reply }) => expect(reply.quality).not.toBe('unrecognized'));
  });

  it('после повторного аудита: числа, экран оператора, SCADA, IP шкафа, уставка, смена предмета', () => {
    // «70? 75?» — варианты, а не утверждение; «давление 0,30 … правильно?» сверяется с давлением, а не с частотой ПЧ.
    eachSeed(['Что происходит при перегреве?', 'я понял что нагрев снимаем. но при скольки градусах? 70? 75?'], ({ reply }) => expect(reply.quality).not.toBe('correction'));
    eachSeed(['давление 0,30 поддерживаем изменением оборотов насоса через частотник, правильно?'], ({ reply }) => expect(reply.text).not.toMatch(/Гц/));
    eachSeed(['Что должно быть на экране у оператора?', 'а ИБП для контроллера и панели ставить?'], ({ reply }) => expect(reply.intentId).not.toBe('hmi_main'));
    eachSeed(['Нужна ли связь системы с верхним уровнем или диспетчерской?'], ({ reply }) => {
      expect(reply.uncertainty?.id).toBe('scada');
      expect(reply.text).not.toMatch(/максимум/i);
    });
    eachSeed(['а для шкафа какой IP?'], ({ reply }) => expect(reply.intentId).not.toBe('env_cabinet'));
    eachSeed(['Какая уставка температуры горячей воды и допустимое отклонение?'], ({ reply }) => expect(reply.factIds).toEqual(expect.arrayContaining(['temp_setpoint', 'temp_tolerance'])));
    eachSeed(['Какой рабочий расход воды?', 'а электропитание какое там есть'], ({ reply }) => expect(reply.factIds).toContain('power_available'));
    eachSeed(['При какой температуре предупреждать оператора?', 'а по давлению воды когда авария'], ({ reply }) => expect(reply.factIds).not.toContain('temp_alarm'));
    eachSeed(['где будет пульт оператора? панель на шкафу?'], ({ reply }) => expect(reply.uncertainty?.kind).toBe('designer'));
    eachSeed(['а если вода наоборот холодная, тоже предупреждать?'], ({ reply }) => expect(reply.factIds).not.toContain('temp_warning'));
    eachSeed(['При каком давлении после насоса выдавать предупреждение оператору, до аварийных 0,45 МПа?'], ({ reply }) => expect(reply.factIds).toContain('press_out_warning'));
    eachSeed(['расскажите про теплообменник. что за теплоноситель, пар или горячая вода?'], ({ reply }) => {
      expect(reply.factIds).toContain('hx_type');
      expect(reply.uncertainty?.id).toBe('hc_medium');
    });
  });

  it('replyTo: ответ на встречный вопрос о давлении', () => {
    const [ask] = talk(['Какое давление?']);
    const out = respond(ask.state, { text: 'после насоса', seed: 1, difficulty: 'standard', replyTo: { topic: null, factIds: [], intentId: null } }, scenario);
    expect(out.reply.factIds).toContain('press_out_setpoint');
  });

  it('встречный вопрос не повторяется по кругу', () => {
    const turns = talk(['Какая нужна предупредительная сигнализация?', 'по температуре воды', 'да про воду на мойку']);
    expect(turns.at(-1)!.reply.quality).not.toBe('clarify');
    expect(last(['Какая нужна предупредительная сигнализация?', 'по температуре воды']).reply.factIds).toContain('temp_warning');
  });
});
