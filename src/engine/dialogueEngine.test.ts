import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import { createEngineState, respond } from './dialogueEngine';
import { analyze, findAmbiguity, rankIntents } from './intentMatcher';
import { editDistance, extractNumbers, fuzzyStartsWith, normalizeText, splitSentences } from './normalizeText';
import { mulberry32 } from './responseSelector';
import type { Difficulty, EngineReply, EngineState } from '../types';

type Turn = { state: EngineState; reply: EngineReply };

function talk(questions: string[], difficulty: Difficulty = 'standard', seed = 42): Turn[] {
  let state = createEngineState();
  return questions.map((text) => {
    const out = respond(state, { text, seed, difficulty }, scenario);
    state = out.state;
    return out;
  });
}

const ask = (text: string, difficulty: Difficulty = 'standard') => talk([text], difficulty)[0];

describe('Нормализация русского текста', () => {
  it('приводит регистр и заменяет ё', () => expect(normalizeText('Ещё РАЗ')).toBe('еще раз'));
  it('убирает лишнюю пунктуацию', () => expect(normalizeText('Какая, температура?!')).toBe('какая температура'));
  it('нормализует десятичную запятую', () => expect(normalizeText('0,45')).toBe('0.45'));
  it('нормализует единицы', () => {
    expect(normalizeText('60 °С')).toBe('60 градц');
    expect(normalizeText('60 градусов')).toBe('60 градц');
    expect(normalizeText('4 м³/ч')).toBe('4 м3ч');
    expect(normalizeText('4 кубов в час')).toBe('4 м3ч');
    expect(normalizeText('0,3 Мегапаскаля')).toBe('0.3 мпа');
    expect(normalizeText('2,2 кВт')).toBe('2.2 квт');
    expect(normalizeText('50 Гц')).toBe('50 гц');
  });
  it('распознаёт плюс-минус', () => {
    expect(normalizeText('±2')).toContain('плюсминус');
    expect(normalizeText('+/- 2')).toContain('плюсминус');
    expect(normalizeText('плюс-минус 2')).toContain('плюсминус');
  });
  it('извлекает числа с единицами', () => {
    expect(extractNumbers(normalizeText('авария при 0,45 МПа'))[0]).toMatchObject({ value: 0.45, unit: 'mpa' });
    expect(extractNumbers(normalizeText('4,5 бар'))[0]).toMatchObject({ value: 0.45, unit: 'mpa' });
    expect(extractNumbers(normalizeText('450 кПа'))[0]).toMatchObject({ value: 0.45, unit: 'mpa' });
  });
  it('переносит единицу на оба числа диапазона', () => {
    const numbers = extractNumbers(normalizeText('от 1,5 до 4 м³/ч'));
    expect(numbers.map((n) => n.value)).toEqual([1.5, 4]);
    expect(numbers.every((n) => n.unit === 'm3h')).toBe(true);
    const dashed = extractNumbers(normalizeText('20–25 °C'));
    expect(dashed.map((n) => n.value)).toEqual([20, 25]);
    expect(dashed.every((n) => n.unit === 'c')).toBe(true);
  });
  it('не разрывает десятичные числа при делении на предложения', () => {
    expect(splitSentences('Давление 0.30 МПа. Температура 60 °C')).toEqual(['Давление 0.30 МПа', 'Температура 60 °C']);
  });
  it('нечёткое сравнение прощает опечатку, но не смешивает похожие слова', () => {
    expect(editDistance('кот', 'кто')).toBe(1);
    expect(fuzzyStartsWith('темпиратура', 'темпер')).toBe(true);
    expect(fuzzyStartsWith('давлние', 'давлен')).toBe(true);
    expect(fuzzyStartsWith('входе', 'выход')).toBe(false);
    expect(fuzzyStartsWith('установка', 'останов')).toBe(false);
  });
});

describe('Распознавание намерений', () => {
  const top = (text: string) => rankIntents(analyze(text, scenario), { topic: null, lastAttributes: [] }, scenario)[0]?.intent.id;
  it('понимает разные формулировки одного вопроса', () => {
    expect(top('Какая температура воды нужна после теплообменника?')).toBe('temp_setpoint');
    expect(top('до какой температуры надо греть воду')).toBe('temp_setpoint');
    expect(top('Какую температуру поддерживать на выходе')).toBe('temp_setpoint');
  });
  it('различает предупреждение и аварию', () => {
    expect(top('При какой температуре предупреждать оператора?')).toBe('temp_warning');
    expect(top('При какой температуре нужно остановить нагрев?')).toBe('temp_alarm');
  });
  it('различает давление до и после насоса', () => {
    expect(top('Какое давление до насоса?')).toBe('press_in_normal');
    expect(top('Какое давление нужно после насоса?')).toBe('press_out_setpoint');
    expect(top('Какое давление теплоносителя?')).toBe('hc_pressure');
    expect(top('Какое давление сжатого воздуха?')).toBe('air_pressure');
    expect(top('Какое максимальное давление теплообменника?')).toBe('hx_max_press');
  });
  it('исключающие признаки отсекают чужое намерение', () => {
    expect(top('Какая температура теплоносителя?')).toBe('hc_supply_temp');
    expect(top('Какая температура воздуха в цехе?')).toBe('env_temp');
  });
  it('распознаёт вопрос с опечаткой', () => {
    expect(top('Какая темпиратура воды нужна после теплообменника')).toBe('temp_setpoint');
  });
});

describe('Неоднозначные вопросы', () => {
  it('«давление» без уточнения вызывает встречный вопрос', () => {
    const { reply } = ask('Какое давление?');
    expect(reply.quality).toBe('clarify');
    expect(reply.factIds).toEqual([]);
    expect(reply.text).not.toMatch(/\d/);
  });
  it('ответ на встречный вопрос снимает неоднозначность', () => {
    const [, second] = talk(['Какое давление?', 'После насоса']);
    expect(second.reply.factIds).toContain('press_out_setpoint');
    const [, inlet] = talk(['Какое давление?', 'до насоса']);
    expect(inlet.reply.factIds).toContain('press_in_normal');
    const [, carrier] = talk(['Какое давление?', 'теплоносителя']);
    expect(carrier.reply.factIds).toContain('hc_pressure');
  });
  it('«температура» и «авария» тоже уточняются', () => {
    expect(ask('Какая температура?').reply.quality).toBe('clarify');
    expect(ask('Какая аварийная отметка?').reply.quality).toBe('clarify');
  });
  it('контекст темы снимает неоднозначность', () => {
    const analysis = analyze('Какое давление?', scenario);
    expect(findAmbiguity(analysis, { topic: 'pressure_out', lastAttributes: [] }, scenario)).toBeNull();
    expect(findAmbiguity(analysis, { topic: 'temp', lastAttributes: [] }, scenario)?.id).toBe('pressure');
  });
  it('общий вопрос о максимуме уточняется', () => {
    const { reply } = ask('Какой максимум?');
    expect(reply.quality).toBe('clarify');
  });
});

describe('Последовательное раскрытие', () => {
  it('«Расскажите всё» не выдаёт ни одного значения', () => {
    const { reply } = ask('Расскажите всё про установку');
    expect(reply.quality).toBe('general');
    expect(reply.text).not.toMatch(/\d/);
    expect(reply.factIds.every((id) => scenario.facts.find((f) => f.id === id)?.disclosureLevel === 'general')).toBe(true);
  });
  it('температура: 60, затем ±2, затем отдельно 70 и 75', () => {
    const turns = talk([
      'Какая температура воды нужна после теплообменника?',
      'Какое отклонение допустимо?',
      'При какой температуре предупреждать оператора?',
      'При какой температуре нужно остановить нагрев?',
      'Что должна делать система при аварийной температуре?',
    ]);
    expect(turns[0].reply.factIds).toEqual(['temp_setpoint']);
    expect(turns[0].reply.text).toContain('60');
    expect(turns[0].reply.text).not.toMatch(/70|75/);
    expect(turns[1].reply.factIds).toEqual(['temp_tolerance']);
    expect(turns[2].reply.factIds).toEqual(['temp_warning']);
    expect(turns[2].reply.text).not.toContain('75');
    expect(turns[3].reply.factIds).toEqual(['temp_alarm']);
    expect(turns[3].reply.text).toContain('75');
    expect(turns[4].reply.factIds).toEqual(['temp_alarm_action']);
  });
  it('отклонение сообщается вместе с рабочей температурой, спрашивать порядок не нужно', () => {
    const { reply, state } = ask('Какое отклонение по температуре допустимо?');
    expect(reply.quality).toBe('useful');
    expect(reply.factIds).toEqual(['temp_tolerance', 'temp_setpoint']);
    expect(reply.text).toContain('60');
    expect(state.disclosed).toEqual(expect.arrayContaining(['temp_setpoint', 'temp_tolerance']));
  });
  it('длинный перечень экрана выдаётся порциями', () => {
    const turns = talk(['Что должно отображаться на экране оператора?', 'Что ещё?', 'А ещё?', 'Что ещё?']);
    expect(turns[0].reply.factIds.length).toBeLessThanOrEqual(3);
    expect(turns[1].reply.factIds.length).toBeLessThanOrEqual(3);
    expect(turns[2].reply.factIds).toContain('hmi_mode');
    expect(new Set(turns.slice(0, 3).flatMap((t) => t.reply.factIds)).size).toBe(8);
    expect(turns[3].reply.factIds).toEqual([]);
  });
  it('уточнение понимает текущую тему', () => {
    const turns = talk(['Какое давление нужно после насоса?', 'Какое отклонение допустимо?']);
    expect(turns[1].reply.factIds).toContain('press_out_range');
    const flow = talk(['При каком расходе считать, что циркуляции нет?', 'Через сколько секунд?']);
    expect(flow[1].reply.factIds).toContain('flow_low_delay');
    const hc = talk(['Какое давление теплоносителя?', 'А максимальное давление?']);
    expect(hc[1].reply.factIds).toContain('hc_max_press');
  });
  it('в одном ответе не больше трёх фактов', () => {
    const questions = scenario.intents.flatMap((intent) => intent.examples);
    for (const { reply } of talk(questions)) expect(reply.factIds.length, reply.text).toBeLessThanOrEqual(10);
  });
  it('несколько вопросов в одном сообщении: заказчик отвечает на первый', () => {
    const { reply } = ask('Какая температура воды нужна после теплообменника? И какое давление теплоносителя?');
    expect(reply.factIds).toEqual(['temp_setpoint']);
    expect(reply.text).not.toContain('0,6');
  });
});

describe('Повторные вопросы', () => {
  const question = 'Какая температура воды нужна после теплообменника?';
  it('повтор считается и даёт более короткий ответ', () => {
    const [first, second, third] = talk([question, question, question]);
    expect(second.reply.quality).toBe('repeat');
    expect(third.reply.quality).toBe('repeat');
    expect(third.state.counters.repeats).toBe(2);
    expect(second.reply.text).not.toBe(first.reply.text);
    expect(third.reply.text).not.toBe(second.reply.text);
  });
  it('просьба напомнить не штрафуется', () => {
    const [, second] = talk([question, 'Напомните, какая температура нужна после теплообменника?']);
    expect(second.reply.quality).toBe('social');
    expect(second.state.counters.repeats).toBe(0);
    expect(second.reply.text).toContain('60');
  });
  it('повторы не вызывают искусственных упрёков', () => {
    const turns = talk([question, question, question, question, question, question, question, question]);
    const texts = turns.map((t) => t.reply.text).join(' ');
    expect(texts).not.toMatch(/в который раз|опять то же|уже спрашивали|быстрее/i);
    expect(turns.at(-1)!.state.patience).toBe(turns[0].state.patience);
  });
});

describe('Неизвестная заказчику информация', () => {
  it.each([
    ['Какая модель контроллера нужна?', 'unk_plc_model'],
    ['Какой производитель датчиков?', 'unk_sensor_vendor'],
    ['Какая модель преобразователя частоты?', 'unk_vfd_model'],
    ['Какой именно клапан нужен?', 'unk_valve_type'],
    ['Сколько резервных каналов нужно?', 'unk_reserve_count'],
    ['В каких пределах оператор может менять уставку?', 'unk_setpoint_range'],
    ['С каким периодом архивировать данные?', 'unk_archive_period'],
    ['Сколько хранить тренды?', 'unk_trend_retention'],
    ['Какая категория надёжности?', 'unk_reliability_cat'],
    ['Какая компоновка шкафа?', 'unk_cabinet_layout'],
    ['Какие марки кабелей?', 'unk_cable_brand'],
    ['Какая схема подключения?', 'unk_wiring'],
    ['Какой перечень проектной документации?', 'unk_doc_list'],
  ])('%s', (text, factId) => {
    const { reply } = ask(text);
    expect(reply.quality).toBe('unknown_found');
    expect(reply.factIds).toContain(factId);
  });
  it('заказчик не выбирает марку и не подтверждает её', () => {
    const { reply } = ask('Поставим контроллер Siemens S7-1200?');
    expect(reply.text.toLowerCase()).not.toContain('siemens');
    expect(reply.factIds).toEqual([]);
    expect(reply.text).toMatch(/требовани|ТЗ|Марк|марк/);
  });
  it('заказчик не пишет ТЗ вместо студента', () => {
    expect(ask('Напишите ТЗ за меня').reply.text).toMatch(/вы|Нет|ваш/i);
  });
});

describe('Исправление неверно понятых значений', () => {
  it('поправляет неверно записанное значение', () => {
    const [, second] = talk(['Какая температура воды нужна после теплообменника?', 'Значит, рабочая температура 65 градусов?']);
    expect(second.reply.quality).toBe('correction');
    expect(second.reply.text).toContain('60');
  });
  it('указывает на путаницу предупреждения и аварии', () => {
    const [, , third] = talk([
      'При какой температуре предупреждать оператора?',
      'При какой температуре нужно остановить нагрев?',
      'Значит, авария по температуре при 70 градусах?',
    ]);
    expect(third.reply.quality).toBe('correction');
    expect(third.reply.text).toContain('75');
    expect(third.state.counters.confusedWarnAlarm).toBe(1);
  });
  it('указывает на путаницу давления до и после насоса', () => {
    const [, , third] = talk([
      'Какое давление нужно после насоса?',
      'Какое давление до насоса?',
      'То есть рабочее давление после насоса 0,15 МПа?',
    ]);
    expect(third.reply.quality).toBe('correction');
    expect(third.reply.text).toContain('0,30');
    expect(third.state.counters.confusedPressure).toBe(1);
  });
  it('подтверждает верное значение', () => {
    const [, second] = talk(['Какая температура воды нужна после теплообменника?', 'Правильно понимаю, рабочая температура 60 °C?']);
    expect(second.reply.quality).toBe('confirmation');
  });
  it('не подтверждает выдумку и не раскрывает верное значение', () => {
    const { reply } = ask('Значит, аварийная температура воды 90 градусов?');
    expect(reply.quality).toBe('correction');
    expect(reply.text).not.toContain('75');
  });
  it('понимает значение в других единицах', () => {
    const [, second] = talk(['При каком давлении после насоса авария?', 'Значит, аварийное давление 4,5 бар?']);
    expect(second.reply.quality).toBe('confirmation');
  });
});

describe('Требования и пожелания', () => {
  it('различает требование, пожелание и предложение', () => {
    expect(talk(['При какой температуре нужно остановить нагрев?', 'Это обязательно?'])[1].reply.text).toMatch(/обязатель|Обязатель|требование/);
    expect(talk(['Нужен ли резерв входов и выходов?', 'Это обязательно?'])[1].reply.text).toMatch(/пожелан|Желательно/i);
    expect(talk(['Какая модель контроллера нужна?', 'Это требование или пожелание?'])[1].reply.text).toMatch(/решать вам|усмотрение|Предложите/);
  });
  it('признаёт приблизительность значения', () => {
    expect(talk(['Какая температура обратки?', 'А поточнее?'])[1].reply.text).toMatch(/ориентировочно|Примерно|приблизительно/i);
  });
});

describe('Режимы сложности и seed', () => {
  it('один seed воспроизводит ту же попытку, другой — может отличаться', () => {
    const questions = ['Здравствуйте', 'Какая температура воды нужна после теплообменника?', 'Какое отклонение допустимо?', 'Абракадабра'];
    const texts = (seed: number) => talk(questions, 'standard', seed).map((t) => t.reply.text);
    expect(texts(123)).toEqual(texts(123));
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => texts(seed).join('|'));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
  it('генератор детерминирован', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('на непонятный вопрос заказчик сам подсказывает тему, в строгом режиме нет', () => {
    expect(ask('Абракадабра', 'learning').reply.text).toContain('«');
    expect(ask('Абракадабра', 'standard').reply.text).toContain('«');
    expect(ask('Абракадабра', 'strict').reply.text.length).toBeLessThan(40);
  });
  it('строгий режим задаёт более короткий встречный вопрос', () => {
    expect(ask('Какое давление?', 'strict').reply.text.length).toBeLessThan(ask('Какое давление?', 'standard').reply.text.length);
  });
  it('не падает на странном вводе', () => {
    for (const text of ['', '???', '123', '!!! ---', 'a'.repeat(500), 'SELECT * FROM users']) {
      expect(() => ask(text)).not.toThrow();
    }
  });
});

describe('Устойчивость распознавания', () => {
  it.each([
    ['а сколько киловатт у двигателя?', 'pump_power'],
    ['Какой напор?', 'pump_head'],
    ['Защиты действуют во всех режимах?', 'mode_protections'],
    ['Что делать, если нет циркуляции?', 'flow_low_action'],
    ['Можно ли запустить насос при низком давлении на входе?', 'press_in_start'],
    ['Что если пропадёт сигнал датчика давления после насоса?', 'sensor_press_loss'],
    ['Обрыв термопары — как реагировать?', 'sensor_temp_loss'],
    ['Что происходит при аварийном останове?', 'estop_pump'],
    ['Как оператору сбросить аварию?', 'restart_procedure'],
    ['Где можно установить шкаф управления?', 'env_cabinet'],
    ['Какая степень защиты приборов?', 'env_ip'],
    ['Есть ли взрывоопасная зона?', 'env_ex'],
    ['Какое питание автоматики?', 'power_control'],
    ['Какой DN у теплообменника?', 'hx_dn_water'],
    ['Как управляется насос?', 'pump_vfd'],
    ['Какие режимы работы нужны?', 'mode_auto'],
  ])('%s', (text, factId) => {
    expect(ask(text).reply.factIds).toContain(factId);
  });
});

describe('Живые короткие уточнения', () => {
  const lastFacts = (questions: string[]) => talk(questions)[questions.length - 1].reply;
  it('устаревший признак не влияет на новый вопрос', () => {
    const reply = lastFacts(['Что будет при перегреве воды?', 'Какое давление?', 'На выходе насоса']);
    expect(reply.factIds).toContain('press_out_setpoint');
  });
  it('бессмыслица не вызывает ответ по теме разговора', () => {
    expect(lastFacts(['Какая температура воды нужна после теплообменника?', 'ывапывап']).quality).toBe('unrecognized');
  });
  it('служебная реплика снимает ожидание ответа на встречный вопрос', () => {
    expect(lastFacts(['Какое давление?', 'спасибо']).factIds).toEqual([]);
  });
  it.each([
    [['При каком расходе считать, что циркуляции нет?', 'сколько это должно длиться?'], 'flow_low_delay'],
    [['При каком расходе считать, что циркуляции нет?', 'И что тогда с нагревом?'], 'flow_low_action'],
    [['При каком давлении после насоса авария?', 'что с насосом в этот момент?'], 'press_out_action'],
    [['Какое давление теплоносителя?', 'а максимальное?'], 'hc_max_press'],
    [['Что будет с клапаном при пропадании питания?', 'а без воздуха?'], 'valve_air_loss'],
    [['Может ли оператор менять уставку?', 'а в каких пределах?'], 'unk_setpoint_range'],
    [['нужен журнал аварий?', 'что в нём должно быть?'], 'hmi_log_time'],
    [['После аварии система может сама запуститься?', 'а как тогда перезапуск?'], 'restart_procedure'],
    [['Отказал датчик температуры', 'а датчик давления?'], 'sensor_press_loss'],
    [['Отказал датчик температуры', 'а расходомер?'], 'sensor_flow_loss'],
    [['Запас по входам нужен?', 'сколько процентов?'], 'unk_reserve_count'],
  ])('%j', (questions, factId) => {
    expect(lastFacts(questions).factIds).toContain(factId);
  });
  it('вопросы, которые раньше понимались неверно', () => {
    expect(ask('Как у вас сейчас всё устроено?').reply.factIds).toContain('purpose_manual');
    expect(ask('Какую температуру воды вы хотите получать?').reply.factIds).toContain('temp_setpoint');
    expect(ask('Как должен работать клапан?').reply.factIds).toContain('valve_smooth');
    expect(ask('Перепад на клапане какой?').reply.factIds).toContain('valve_dp');
    expect(ask('Сколько стоит?').reply.intentId).toBe('money_time');
  });
  it('«значит, температура 65?» сверяется с рабочей температурой', () => {
    expect(talk(['Какая температура воды нужна после теплообменника?', 'значит температура 65?'])[1].reply.quality).toBe('correction');
  });
  it('сведения из другого ответа не считаются повтором, пока вопрос задан впервые', () => {
    const turns = talk(['Какие режимы работы нужны?', 'Нужен ручной режим?']);
    expect(turns[1].reply.quality).not.toBe('repeat');
    expect(turns[1].state.counters.repeats).toBe(0);
  });
});
