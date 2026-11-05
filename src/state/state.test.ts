import { beforeEach, describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import { evaluateAttempt, factInText, findCopiedSpeech, findUnjustifiedBrands, findValueConflicts } from '../engine/evaluationEngine';
import type { Attempt } from '../types';
import {
  addRequirement,
  createAttempt,
  finishAttempt,
  mergeRequirements,
  moveRequirementsToSection,
  removeRequirement,
  sendQuestion,
  setTzText,
  updateRequirement,
  validateAttempt,
} from './attempt';
import { parseProgress, progressFileName, toMarkdown, toPlainText, toProgressJson, toResultJson } from './exporters';
import { clearAttempt, loadAttempt, saveAttempt, STORAGE_KEY } from './storage';

const fresh = () => createAttempt(scenario, 'Анна Студент', 'standard', 2024);

function dialog(attempt: Attempt, questions: string[]): Attempt {
  return questions.reduce((acc, text) => sendQuestion(acc, scenario, text).attempt, attempt);
}

const fact = (id: string) => scenario.facts.find((item) => item.id === id)!;

/** Хороший ТЗ, написанный формальным языком. */
const GOOD_TZ: Record<number, string> = {
  1: 'Система автоматического управления узлом приготовления горячей воды моечной линии.',
  2: 'Основание для разработки: заявка заказчика. Реквизиты документа подлежат согласованию с заказчиком.',
  3: 'Система обеспечивает подачу воды на мойку с заданной температурой и давлением и исключает ручное регулирование оператором. Сейчас параметры регулируются вручную.',
  4: 'Вода проходит через пластинчатый теплообменник, нагревается теплоносителем и насосом подаётся на мойку. Температура входной воды зимой 10 °C, летом 20–25 °C. Мощность теплообменника до 300 кВт. Предельное давление теплообменника 1 МПа. Предельная температура теплообменника 110 °C. Присоединение по воде DN32, по теплоносителю DN40. Температура подачи теплоносителя 95 °C. Обратка теплоносителя 70 °C. Рабочее давление теплоносителя 0,6 МПа. Максимальное давление теплоносителя 0,8 МПа.',
  5: 'Рабочий расход воды 1,5–4 м³/ч. Максимальный расход 4 м³/ч. Расход отображается оператору. Давление до насоса в норме 0,15–0,25 МПа.',
  6: 'Температура воды после теплообменника поддерживается на уровне 60 °C с отклонением ±2 °C. Требуемое давление после насоса 0,30 МПа, нормальный диапазон давления после насоса 0,27–0,33 МПа. Частота преобразователя 20–50 Гц. Регулирование клапаном плавное.',
  7: 'Система имеет автоматический режим, ручной режим и режим обслуживания. Защиты действуют во всех режимах. В режиме обслуживания механизмы проверяются отдельно. Режим обслуживания не запускает весь процесс.',
  8: 'Предупреждение по температуре при 70 °C. Авария по температуре при 75 °C, нагрев прекращается. Предупреждение по давлению после насоса 0,40 МПа. Авария по давлению после насоса 0,45 МПа, при 0,45 МПа насос останавливается. Расход ниже 0,8 м³/ч более 5 секунд означает отсутствие циркуляции: при этом нагрев запрещается. При давлении на входе ниже 0,08 МПа запуск запрещён. Работающий насос останавливается, если давление на входе ниже 0,08 МПа.',
  9: 'Насос центробежный, двигатель 2,2 кВт, питание двигателя насоса 400 В, 50 Гц. Номинальная подача 5 м³/ч, напор 32 м. Управление через преобразователь частоты. Клапан закрывается при потере питания. Клапан закрывается при потере сжатого воздуха. Сжатый воздух КИП 0,4–0,6 МПа. Перепад давления на клапане 0,08 МПа.',
  10: 'На экране отображается температура, давление до насоса, давление после насоса, расход, состояние насоса, авария насоса, положение клапана и текущий режим. Оператор изменяет уставки в безопасных пределах. Предусмотрены понятные текстовые сообщения. Журнал аварий содержит дату и время аварии. Тренд температуры и тренд давления.',
  11: 'Доступное питание 400/230 В, цепи автоматики 24 В постоянного тока. Установка внутри цеха. Температура воздуха от 5 до 40 °C. Взрывоопасной зоны нет. Степень защиты приборов IP65. Расстояние до шкафа до 30 м. Применяется промышленный ПЛК с резервом входов и выходов.',
  12: 'Оборудование промышленное. При аварийном останове насос останавливается, клапан теплоносителя закрывается, нагрев прекращается, причина показывается оператору. Автоматический повторный запуск запрещён. Оператор устраняет причину и подтверждает сброс. При потере сигнала датчика температуры закрывается клапан и формируется авария. При потере сигнала датчика давления насос останавливается. При потере сигнала расходомера нагрев запрещается. Модели выбираются после согласования ТЗ.',
  13: 'Перечень документации предлагает исполнитель и согласует его с заказчиком.',
};

describe('Сохранение состояния', () => {
  beforeEach(() => window.localStorage.clear());

  it('сохраняет и восстанавливает всю попытку', () => {
    let attempt = dialog(fresh(), ['Какая температура воды нужна после теплообменника?']);
    attempt = addRequirement(attempt, { text: 'Температура 60 °C', category: 'regulated', needsClarification: true, sourceMessageId: attempt.messages[2].id });
    attempt = setTzText(attempt, 3, 'Цель системы');
    expect(saveAttempt(attempt)).toBe(true);
    const loaded = loadAttempt(scenario)!;
    expect(loaded.studentName).toBe('Анна Студент');
    expect(loaded.difficulty).toBe('standard');
    expect(loaded.seed).toBe(2024);
    expect(loaded.messages).toHaveLength(attempt.messages.length);
    expect(loaded.engine.disclosed).toEqual(['temp_setpoint']);
    expect(loaded.requirements[0].needsClarification).toBe(true);
    expect(loaded.tz[3]).toBe('Цель системы');
  });

  it('продолжение после восстановления совпадает с непрерывным диалогом', () => {
    const questions = ['Какая температура воды нужна после теплообменника?', 'Какое отклонение допустимо?', 'Какое давление?', 'до насоса'];
    const whole = dialog(fresh(), questions);
    const partial = dialog({ ...fresh(), messages: whole.messages.slice(0, 1) }, questions.slice(0, 2));
    saveAttempt(partial);
    const resumed = dialog(loadAttempt(scenario)!, questions.slice(2));
    expect(resumed.messages.map((m) => m.text)).toEqual(whole.messages.map((m) => m.text));
    expect(resumed.engine.disclosed).toEqual(whole.engine.disclosed);
  });

  it('не ломается на повреждённых данных', () => {
    window.localStorage.setItem(STORAGE_KEY, '{нет');
    expect(loadAttempt(scenario)).toBeNull();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 9 }));
    expect(loadAttempt(scenario)).toBeNull();
  });

  it('очищает сохранение', () => {
    saveAttempt(fresh());
    clearAttempt();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('Реестр требований', () => {
  it('добавляет, редактирует, удаляет, отмечает, меняет категорию', () => {
    let attempt = addRequirement(fresh(), { text: '  Текст  ', category: 'purpose', needsClarification: false });
    const { id } = attempt.requirements[0];
    expect(attempt.requirements[0].text).toBe('Текст');
    expect(attempt.requirements[0].createdAt).toBeTruthy();
    attempt = updateRequirement(attempt, id, { text: 'Новый', category: 'object', conflict: true });
    expect(attempt.requirements[0]).toMatchObject({ text: 'Новый', category: 'object', conflict: true });
    expect(removeRequirement(attempt, id).requirements).toHaveLength(0);
  });

  it('хранит сообщение-источник', () => {
    const attempt = dialog(fresh(), ['Какая температура воды нужна после теплообменника?']);
    const source = attempt.messages[2];
    const next = addRequirement(attempt, { text: 'Т', category: 'regulated', needsClarification: false, sourceMessageId: source.id });
    expect(next.requirements[0].sourceMessageId).toBe(source.id);
    expect(next.requirements[0].sourceQuote).toBe(source.text);
  });

  it('объединяет записи', () => {
    let attempt = addRequirement(fresh(), { text: 'А', category: 'purpose', needsClarification: true });
    attempt = addRequirement(attempt, { text: 'Б', category: 'purpose', needsClarification: false });
    attempt = addRequirement(attempt, { text: 'В', category: 'object', needsClarification: false });
    const ids = attempt.requirements.slice(0, 2).map((item) => item.id);
    const merged = mergeRequirements(attempt, ids, 'А и Б');
    expect(merged.requirements).toHaveLength(2);
    expect(merged.requirements[0]).toMatchObject({ text: 'А и Б', needsClarification: true });
    expect(merged.requirements[1].text).toBe('В');
  });

  it('переносит требования в раздел ТЗ, не затирая текст', () => {
    let attempt = addRequirement(fresh(), { text: 'Поддерживать 60 °C', category: 'regulated', needsClarification: false });
    attempt = setTzText(attempt, 6, 'Вступление');
    const moved = moveRequirementsToSection(attempt, 6, [attempt.requirements[0].id]);
    expect(moved.tz[6]).toBe('Вступление\n— Поддерживать 60 °C');
    expect(moved.requirements[0].movedToSections).toEqual([6]);
  });
});

describe('Расчёт результата', () => {
  const allQuestions = scenario.intents
    .filter((intent) => intent.kind === 'fact' || intent.kind === 'unknown')
    .flatMap((intent) => [intent.examples[0], intent.examples[0], intent.examples[0]]);

  it('пустая попытка получает низкую оценку и список пропусков', () => {
    const result = evaluateAttempt(fresh(), scenario);
    expect(result.total).toBe(0);
    expect(result.missedCategories).toHaveLength(13);
    expect(result.emptySections).toHaveLength(13);
    expect(result.recommendations.length).toBeGreaterThan(2);
  });

  it('полная работа получает высокую оценку', () => {
    let attempt = dialog(fresh(), [...new Set(allQuestions)]);
    attempt = dialog(attempt, ['Что ещё?', 'Что ещё?']);
    for (const [id, text] of Object.entries(GOOD_TZ)) attempt = setTzText(attempt, Number(id), text);
    for (const [id, text] of Object.entries(GOOD_TZ)) {
      attempt = addRequirement(attempt, { text, category: 'object', needsClarification: false, sourceMessageId: null });
      expect(id).toBeTruthy();
    }
    const result = evaluateAttempt(attempt, scenario);
    expect(result.missedCategories).toEqual([]);
    expect(result.emptySections).toEqual([]);
    expect(result.contradictions).toEqual([]);
    expect(result.mandatoryInTz).toBeGreaterThan(result.mandatoryTotal * 0.8);
    expect(result.total).toBeGreaterThanOrEqual(80);
  });

  it('оценка не зависит только от количества сообщений', () => {
    const many = dialog(fresh(), Array.from({ length: 40 }, () => 'Какая температура воды нужна после теплообменника?'));
    expect(evaluateAttempt(many, scenario).total).toBeLessThan(10);
    expect(evaluateAttempt(many, scenario).penalties.some((item) => item.id === 'repeat')).toBe(true);
  });

  it('штрафует постоянные общие вопросы', () => {
    const attempt = dialog(fresh(), ['Расскажите всё про установку', 'Расскажите про температуру', 'Расскажите про расход', 'Расскажите про насос', 'Расскажите про теплоноситель']);
    const result = evaluateAttempt(attempt, scenario);
    expect(result.penalties.some((item) => item.id === 'general')).toBe(true);
    expect(result.generalQuestions.length).toBeGreaterThanOrEqual(4);
  });

  it('распознаёт факт в формальном тексте', () => {
    expect(factInText(fact('temp_setpoint'), 'Температура воды поддерживается на уровне 60 °C.')).toBe(true);
    expect(factInText(fact('temp_setpoint'), 'Температура воды поддерживается на уровне 65 °C.')).toBe(false);
    expect(factInText(fact('temp_warning'), 'Предупреждение при 70 °C.')).toBe(true);
    expect(factInText(fact('temp_alarm'), 'Предупреждение при 70 °C.')).toBe(false);
    expect(factInText(fact('press_out_alarm'), 'Аварийный останов при давлении после насоса 0,45 МПа.')).toBe(true);
  });

  it('штрафует путаницу предупреждения и аварии, давления до и после насоса', () => {
    let attempt = setTzText(fresh(), 8, 'Авария по температуре при 70 °C. Предупреждение по температуре при 75 °C.');
    attempt = setTzText(attempt, 5, 'Давление до насоса 0,30 МПа.');
    const result = evaluateAttempt(attempt, scenario);
    expect(result.penalties.map((item) => item.id)).toEqual(expect.arrayContaining(['warnAlarmMixup', 'pressureMixup']));
    expect(result.contradictions.length).toBeGreaterThan(0);
  });

  it('находит модели оборудования без основания', () => {
    expect(findUnjustifiedBrands('Применить контроллер Siemens S7-1200.')).toHaveLength(1);
    expect(findUnjustifiedBrands('Применить контроллер Siemens S7-1200 или аналог.')).toHaveLength(0);
    expect(findUnjustifiedBrands('Применить промышленный ПЛК.')).toHaveLength(0);
    const attempt = setTzText(fresh(), 11, 'Контроллер ОВЕН ПЛК 210.');
    expect(evaluateAttempt(attempt, scenario).penalties.some((item) => item.id === 'brand')).toBe(true);
  });

  it('находит разговорную речь и скопированные фразы', () => {
    const quotes = ['Плюс-минус 2 градуса нас устраивает.'];
    expect(findCopiedSpeech('Плюс-минус 2 градуса нас устраивает.', quotes)).toHaveLength(1);
    expect(findCopiedSpeech('Отклонение температуры не более ±2 °C.', quotes)).toHaveLength(0);
    expect(findCopiedSpeech('Обычно нам нужно около 60 градусов.', [])).toHaveLength(1);
  });

  it('находит значения, противоречащие заказчику', () => {
    expect(findValueConflicts('Аварийная температура 80 °C.', 'ТЗ', scenario)).toHaveLength(1);
    expect(findValueConflicts('Аварийная температура 75 °C.', 'ТЗ', scenario)).toHaveLength(0);
    expect(findValueConflicts('Система поддерживает температуру воды 60 °C с допустимым отклонением ±2 °C.', 'ТЗ', scenario)).toHaveLength(0);
    expect(findValueConflicts('Предупреждение по температуре 70 °C, авария по температуре 75 °C.', 'ТЗ', scenario)).toHaveLength(0);
    expect(findValueConflicts('Температура воды поддерживается на уровне 65 °C с отклонением ±2 °C.', 'ТЗ', scenario)).toHaveLength(1);
  });

  it('штрафует отсутствие реакции системы', () => {
    const attempt = setTzText(fresh(), 8, 'Авария по температуре при 75 °C.');
    expect(evaluateAttempt(attempt, scenario).penalties.some((item) => item.id === 'noReaction')).toBe(true);
  });

  it('эталон содержит все факты и появляется в результате', () => {
    const finished = finishAttempt(fresh(), scenario);
    expect(finished.finishedAt).toBeTruthy();
    expect(finished.screen).toBe('result');
    expect(finished.result?.etalon).toHaveLength(scenario.facts.length);
  });
});

describe('Экспорт и импорт', () => {
  function finished(): Attempt {
    let attempt = dialog(fresh(), ['Какая температура воды нужна после теплообменника?']);
    attempt = addRequirement(attempt, { text: 'Поддерживать 60 °C', category: 'regulated', needsClarification: true });
    attempt = setTzText(attempt, 1, 'Система управления');
    return finishAttempt(attempt, scenario);
  }

  it('Markdown содержит оценку, ТЗ, реестр, переписку и эталон', () => {
    const md = toMarkdown(finished(), scenario);
    expect(md).toContain('# ТЗ Практикум');
    expect(md).toContain('Анна Студент');
    expect(md).toMatch(/## Оценка: \d+ из 100/);
    expect(md).toContain('### 13. Требования к разрабатываемой документации');
    expect(md).toContain('Поддерживать 60 °C (требует уточнения)');
    expect(md).toContain('Какая температура воды нужна после теплообменника?');
    expect(md).toContain('## Эталон сведений');
  });

  it('TXT не содержит разметки', () => {
    const txt = toPlainText(finished(), scenario);
    expect(txt).not.toMatch(/^#/m);
    expect(txt).not.toContain('**');
    expect(txt).toContain('Система управления');
  });

  it('JSON результата разбирается и содержит оценку', () => {
    const json = JSON.parse(toResultJson(finished(), scenario));
    expect(json.result.total).toBeGreaterThanOrEqual(0);
    expect(json.tz).toHaveLength(13);
    expect(json.messages.length).toBeGreaterThan(1);
    expect(json.messages[0]).not.toHaveProperty('factIds');
  });

  it('файл прогресса загружается обратно без потерь', () => {
    const attempt = finished();
    const parsed = parseProgress(toProgressJson(attempt), scenario);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.attempt).toEqual(attempt);
    expect(progressFileName(attempt)).toBe('progress-Анна_Студент-2024.json');
  });

  it('отклоняет чужие и повреждённые файлы с понятной ошибкой', () => {
    expect(parseProgress('не json', scenario)).toEqual({ ok: false, error: expect.stringContaining('JSON') });
    expect(parseProgress('{}', scenario).ok).toBe(false);
    expect(validateAttempt({ ...fresh(), scenarioId: 'другой' }, scenario)).toEqual({ ok: false, error: expect.stringContaining('кейс') });
    expect(validateAttempt({ ...fresh(), messages: 'x' }, scenario).ok).toBe(false);
  });
});
