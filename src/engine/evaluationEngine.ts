// Локальная оценка попытки: сверка диалога, реестра и текста ТЗ со скрытой моделью.
import {
  brandJustification,
  brandPatterns,
  copiedShingle,
  fullCoverageShare,
  gradeScale,
  minSectionWords,
  penalties as penaltyRules,
  speechMarkers,
  weights,
} from '../data/evaluation';
import type {
  Attempt,
  Contradiction,
  EtalonRow,
  EvaluationPart,
  EvaluationResult,
  Penalty,
  QuestionRef,
  Scenario,
  ScenarioFact,
} from '../types';
import { checkClaim } from './dialogueEngine';
import { categoryProgress } from './factTracker';
import { extractConcepts } from './intentMatcher';
import { extractNumbers, normalizeText, splitSentences, tokenize } from './normalizeText';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const percent = (value: number) => Math.round(clamp01(value) * 100);

function hasStems(tokens: string[], normalized: string, alias: string): boolean {
  return alias.split('+').every((part) => {
    if (part.includes(' ')) return normalized.includes(part);
    return tokens.some((token) => token.startsWith(part));
  });
}

/** Факт отражён в тексте: одно предложение (или пара соседних) содержит признаки и нужные числа. */
export function factInText(fact: ScenarioFact, text: string): boolean {
  const sentences = splitSentences(text);
  const windows = [...sentences, ...sentences.slice(0, -1).map((sentence, index) => `${sentence} ${sentences[index + 1]}`)];
  return windows.some((part) => {
    const normalized = normalizeText(part);
    const tokens = tokenize(normalized);
    if (fact.numbers?.length) {
      const values = extractNumbers(normalized).map((item) => item.value);
      if (!fact.numbers.every((expected) => values.some((value) => Math.abs(value - expected) < 1e-6))) return false;
    }
    return fact.aliases.some((alias) => hasStems(tokens, normalized, alias));
  });
}

/** Значения с единицами: доля чисел обязательных фактов в ТЗ, записанных с единицей. */
function numbersWithUnits(text: string, scenario: Scenario): { withUnit: number; total: number } {
  const expected = new Set(
    scenario.facts.filter((fact) => fact.requirementType === 'mandatory').flatMap((fact) => fact.numbers ?? []),
  );
  let withUnit = 0;
  let total = 0;
  for (const sentence of splitSentences(text)) {
    for (const item of extractNumbers(normalizeText(sentence))) {
      if (!expected.has(item.value)) continue;
      total++;
      if (item.unit) withUnit++;
    }
  }
  return { withUnit, total };
}

/** Марка без обоснования. */
export function findUnjustifiedBrands(text: string): string[] {
  return splitSentences(text).filter(
    (sentence) => brandPatterns.some((pattern) => pattern.test(sentence)) && !brandJustification.test(sentence),
  );
}

/** Разговорные обороты и фразы, скопированные у заказчика. */
export function findCopiedSpeech(text: string, customerTexts: string[]): string[] {
  const shingles = new Set<string>();
  for (const message of customerTexts) {
    const tokens = tokenize(normalizeText(message));
    for (let i = 0; i + copiedShingle <= tokens.length; i++) shingles.add(tokens.slice(i, i + copiedShingle).join(' '));
  }
  return splitSentences(text).filter((sentence) => {
    if (speechMarkers.some((pattern) => pattern.test(sentence))) return true;
    const tokens = tokenize(normalizeText(sentence));
    for (let i = 0; i + copiedShingle <= tokens.length; i++) {
      if (shingles.has(tokens.slice(i, i + copiedShingle).join(' '))) return true;
    }
    return false;
  });
}

/** Значения в тексте, противоречащие сказанному заказчиком. */
export function findValueConflicts(text: string, source: string, scenario: Scenario): Contradiction[] {
  const conflicts: Contradiction[] = [];
  for (const sentence of splitSentences(text)) {
    const normalized = normalizeText(sentence);
    const numbers = extractNumbers(normalized).filter((item) => item.unit);
    if (!numbers.length) continue;
    const concepts = extractConcepts(tokenize(normalized), scenario.lexicon);
    const check = checkClaim(concepts, numbers, scenario);
    if (check.status === 'wrong') {
      conflicts.push({
        source,
        text: sentence,
        detail: `${check.fact.label}: заказчик называл ${check.fact.claim?.display}, а здесь указано ${check.given.raw.replace('.', ',')}.`,
      });
    }
  }
  return conflicts;
}

function mixups(text: string): { pressure: string[]; warnAlarm: string[] } {
  const pressure: string[] = [];
  const warnAlarm: string[] = [];
  for (const sentence of splitSentences(text)) {
    const normalized = normalizeText(sentence);
    const values = extractNumbers(normalized).map((item) => item.value);
    const has = (...list: number[]) => list.some((item) => values.includes(item));
    const before = /(до насоса|перед насосом|на входе|на всасывании|входное давление)/.test(normalized);
    const after = /(после насоса|за насосом|на выходе насоса|на нагнетании)/.test(normalized);
    if (/давлен/.test(normalized)) {
      if (before && !after && has(0.3, 0.27, 0.33, 0.4, 0.45)) pressure.push(sentence);
      if (after && !before && has(0.15, 0.25, 0.08)) pressure.push(sentence);
    }
    const warn = /предупр/.test(normalized);
    const alarm = /авари/.test(normalized);
    if (warn && !alarm && has(75, 0.45)) warnAlarm.push(sentence);
    if (alarm && !warn && has(70, 0.4)) warnAlarm.push(sentence);
  }
  return { pressure, warnAlarm };
}

const wordCount = (text: string) => tokenize(normalizeText(text)).length;

export function evaluateAttempt(attempt: Attempt, scenario: Scenario): EvaluationResult {
  const { engine, messages, requirements, tz } = attempt;
  const mandatory = scenario.facts.filter((fact) => fact.requirementType === 'mandatory');
  const unknowns = scenario.facts.filter((fact) => fact.customerConfidence === 'unknown');
  const reactions = mandatory.filter((fact) => fact.isReaction);
  const disclosed = new Set(engine.disclosed);

  const registryText = requirements.map((item) => item.text).join('\n');
  const tzText = scenario.tzSections.map((section) => tz[section.id] ?? '').join('\n');
  const customerTexts = messages.filter((m) => m.role === 'customer').map((m) => m.text);
  const students = messages.filter((m) => m.role === 'student');

  // --- Диалог ---
  const progress = categoryProgress(scenario, engine.disclosed);
  const covered = progress.filter((item) => item.found > 0);
  const missedCategories = progress.filter((item) => item.found === 0).map((item) => item.title);
  const categoryShare = covered.length / scenario.categories.length;

  const mandatoryDisclosed = mandatory.filter((fact) => disclosed.has(fact.id));
  const disclosedShare = mandatoryDisclosed.length / Math.max(1, mandatory.length);
  const unknownsFound = unknowns.filter((fact) => disclosed.has(fact.id));
  const unknownShare = unknownsFound.length / Math.max(1, unknowns.length);

  const useful = students.filter((m) => m.quality === 'useful' || m.quality === 'unknown_found');
  const substantive = students.filter((m) => m.quality && !['social', 'confirmation'].includes(m.quality));
  const qualityShare = substantive.length ? useful.length / substantive.length : 0;

  const generalQuestions: QuestionRef[] = students
    .filter((m) => m.quality === 'general' || m.quality === 'unrecognized')
    .map((m) => ({
      messageId: m.id,
      text: m.text,
      note: m.quality === 'general' ? 'Слишком общий вопрос' : 'Заказчик не понял вопрос',
    }));
  const usefulQuestions: QuestionRef[] = useful.map((m) => ({
    messageId: m.id,
    text: m.text,
    note: m.quality === 'unknown_found' ? 'Выявлено решение для проектировщика' : undefined,
  }));

  // --- Реестр и ТЗ ---
  const inRegistry = mandatory.filter((fact) => factInText(fact, registryText));
  const inTz = mandatory.filter((fact) => factInText(fact, tzText));
  const registryShare = inRegistry.length / Math.max(1, mandatory.length);
  const tzShare = inTz.length / Math.max(1, mandatory.length);

  const emptySections = scenario.tzSections
    .filter((section) => wordCount(tz[section.id] ?? '') < minSectionWords)
    .map((section) => section.id);
  const sectionsShare = (scenario.tzSections.length - emptySections.length) / scenario.tzSections.length;

  const { withUnit, total: totalNumbers } = numbersWithUnits(tzText, scenario);
  const numbersShare = totalNumbers ? withUnit / totalNumbers : 0;

  const warnFacts = scenario.evaluation?.warnAlarmFacts ?? ['temp_warning', 'press_out_warning', 'temp_alarm', 'press_out_alarm'];
  const warnFound = warnFacts.filter((id) => {
    const fact = scenario.facts.find((item) => item.id === id);
    return fact ? factInText(fact, tzText) : false;
  }).length;
  const textMixups = scenario.evaluation?.builtInMixups === false ? { pressure: [], warnAlarm: [] } : mixups(`${tzText}\n${registryText}`);
  const warnShare = (warnFacts.length ? warnFound / warnFacts.length : 1) * (textMixups.warnAlarm.length ? 0.5 : 1);

  const reactionsInTz = reactions.filter((fact) => factInText(fact, tzText));
  const reactionShare = reactionsInTz.length / Math.max(1, reactions.length);

  const copied = findCopiedSpeech(tzText, customerTexts);
  const tzSentences = splitSentences(tzText).length;
  const styleShare = tzSentences ? 1 - copied.length / tzSentences : 0;

  const scale = (share: number) => clamp01(share / fullCoverageShare);
  const parts: EvaluationPart[] = [
    { id: 'categoryCoverage', label: 'Охват тем', score: weights.categoryCoverage * categoryShare, max: weights.categoryCoverage, note: `${covered.length} из ${scenario.categories.length} категорий` },
    { id: 'mandatoryDisclosed', label: 'Обязательные требования в диалоге', score: weights.mandatoryDisclosed * scale(disclosedShare), max: weights.mandatoryDisclosed, note: `${mandatoryDisclosed.length} из ${mandatory.length}` },
    { id: 'unknownsFound', label: 'Сведения, которых не знает заказчик', score: weights.unknownsFound * scale(unknownShare * 1.4), max: weights.unknownsFound, note: `${unknownsFound.length} из ${unknowns.length}` },
    { id: 'questionQuality', label: 'Конкретность вопросов', score: weights.questionQuality * clamp01(qualityShare), max: weights.questionQuality, note: `${useful.length} полезных из ${substantive.length}` },
    { id: 'registry', label: 'Требования в реестре', score: weights.registry * scale(registryShare), max: weights.registry, note: `${inRegistry.length} из ${mandatory.length} обязательных` },
    { id: 'sections', label: 'Заполненные разделы ТЗ', score: weights.sections * sectionsShare, max: weights.sections, note: `${scenario.tzSections.length - emptySections.length} из ${scenario.tzSections.length}` },
    { id: 'tzFacts', label: 'Обязательные требования в ТЗ', score: weights.tzFacts * scale(tzShare), max: weights.tzFacts, note: `${inTz.length} из ${mandatory.length}` },
    { id: 'numbers', label: 'Числа с единицами измерения', score: weights.numbers * numbersShare * scale(tzShare), max: weights.numbers, note: totalNumbers ? `${withUnit} из ${totalNumbers} значений` : 'значений в ТЗ нет' },
    { id: 'warnAlarm', label: 'Разделение предупреждения и аварии', score: weights.warnAlarm * warnShare, max: weights.warnAlarm, note: `${warnFound} из ${warnFacts.length} порогов` },
    { id: 'reactions', label: 'Реакция системы на аварии', score: weights.reactions * scale(reactionShare), max: weights.reactions, note: `${reactionsInTz.length} из ${reactions.length}` },
    { id: 'style', label: 'Формальный стиль ТЗ', score: weights.style * clamp01(styleShare), max: weights.style, note: copied.length ? `Разговорных фраз: ${copied.length}` : tzSentences ? 'Разговорных фраз нет' : 'ТЗ не заполнено' },
  ].map((part) => ({ ...part, score: Math.round(part.score * 10) / 10 }));

  // --- Штрафы ---
  const penalties: Penalty[] = [];
  const addPenalty = (id: string, label: string, count: number, rule: { each: number; max: number; free?: number }, detail: string) => {
    const counted = Math.max(0, count - (rule.free ?? 0));
    if (counted > 0) penalties.push({ id, label, points: Math.min(rule.max, counted * rule.each), detail });
  };
  addPenalty('repeat', 'Повторные вопросы', engine.counters.repeats, penaltyRules.repeat, `Повторов: ${engine.counters.repeats}`);
  addPenalty('general', 'Слишком общие вопросы', engine.counters.general, penaltyRules.general, `Общих вопросов: ${engine.counters.general}`);
  addPenalty(
    'pressureMixup',
    'Путаница давления до и после насоса',
    engine.counters.confusedPressure + textMixups.pressure.length,
    penaltyRules.pressureMixup,
    textMixups.pressure[0] ?? 'В диалоге значения давления были перепутаны.',
  );
  addPenalty(
    'warnAlarmMixup',
    'Путаница предупреждения и аварии',
    engine.counters.confusedWarnAlarm + textMixups.warnAlarm.length,
    penaltyRules.warnAlarmMixup,
    textMixups.warnAlarm[0] ?? 'В диалоге пороги предупреждения и аварии были перепутаны.',
  );
  const brands = findUnjustifiedBrands(`${tzText}\n${registryText}`);
  addPenalty('brand', 'Модель оборудования без основания', brands.length, penaltyRules.brand, brands[0] ?? '');
  if (tzSentences > 0 && reactionsInTz.length === 0) {
    addPenalty('noReaction', 'В ТЗ не описана реакция системы', 1, penaltyRules.noReaction, 'Ни одна аварийная ситуация не связана с действием системы.');
  }
  addPenalty('speech', 'Разговорная речь в ТЗ', copied.length, penaltyRules.speech, copied[0] ?? '');

  const gross = parts.reduce((sum, part) => sum + part.score, 0);
  const lost = penalties.reduce((sum, item) => sum + item.points, 0);
  const total = Math.max(0, Math.min(100, Math.round(gross - lost)));
  const grade = gradeScale.find((item) => total >= item.from)?.label ?? gradeScale[gradeScale.length - 1].label;

  // --- Противоречия ---
  const contradictions: Contradiction[] = [
    ...requirements
      .filter((item) => item.conflict)
      .map((item) => ({ source: 'Отмечено студентом', text: item.text, detail: 'Запись в реестре отмечена как противоречие.' })),
    ...requirements.flatMap((item) => findValueConflicts(item.text, 'Реестр', scenario)),
    ...scenario.tzSections.flatMap((section) => findValueConflicts(tz[section.id] ?? '', `ТЗ, раздел ${section.id}`, scenario)),
  ];

  // --- Рекомендации ---
  const recommendations: string[] = [];
  const add = (condition: boolean, text: string) => {
    if (condition) recommendations.push(text);
  };
  add(missedCategories.length > 0, `Не обсуждены темы: ${missedCategories.join(', ').toLowerCase()}. Перед завершением проходите по чек-листу разделов ТЗ.`);
  add(disclosedShare < 0.6, 'Заказчик раскрыл меньше половины обязательных требований. Спрашивайте про каждый параметр отдельно: значение, допуск, предупреждение, авария, реакция.');
  add(engine.counters.general > 2, 'Много общих вопросов. Называйте параметр и точку измерения: «какое давление после насоса», а не «какое давление».');
  add(engine.counters.repeats > 2, 'Вы несколько раз спрашивали одно и то же. Сверяйтесь с реестром требований и фиксируйте ответы сразу.');
  add(unknownsFound.length < 5, 'Выясняйте, чего заказчик не знает: модели оборудования, резерв, архивирование, документация. Такие пункты вы оформляете как предложение исполнителя.');
  add(inRegistry.length < mandatory.length * 0.5, 'В реестр попало мало требований. Фиксируйте важный ответ сразу, переписав его формальным языком.');
  add(emptySections.length > 0, `Не заполнены разделы ТЗ: ${emptySections.join(', ')}.`);
  add(reactionShare < 0.5, 'Для каждой аварийной ситуации указывайте реакцию системы: что останавливается, что закрывается, что видит оператор.');
  add(warnFound < warnFacts.length, 'Указывайте порог предупреждения и порог аварии отдельно для каждого параметра.');
  add(totalNumbers > 0 && numbersShare < 1, 'Часть значений записана без единиц измерения.');
  add(copied.length > 1, 'В ТЗ есть разговорная речь. Перепишите фразы заказчика как требования: «Система должна…».');
  add(brands.length > 0, 'Не указывайте конкретные модели без обоснования. Сформулируйте характеристики или отметьте «или аналог».');
  add(contradictions.length > 0, 'В записях есть противоречия со словами заказчика. Сверьте значения с перепиской.');
  if (recommendations.length === 0) recommendations.push('Работа выполнена хорошо. Перечитайте итоговое ТЗ ещё раз: проверьте формулировки и значения.');

  // --- Эталон ---
  const etalon: EtalonRow[] = scenario.facts.map((fact) => ({
    factId: fact.id,
    section: fact.section,
    category: scenario.categories.find((category) => category.id === fact.category)?.title ?? fact.category,
    label: fact.label,
    value: fact.value,
    requirementType: fact.requirementType,
    customerConfidence: fact.customerConfidence,
    disclosed: disclosed.has(fact.id),
    inRegistry: factInText(fact, registryText),
    inTz: factInText(fact, tzText),
  }));

  // Полнота диалога и ТЗ — вспомогательные проценты для шапки результата.
  const dialogueCompleteness = percent(categoryShare * 0.3 + scale(disclosedShare) * 0.55 + scale(unknownShare * 1.4) * 0.15);
  const tzCompleteness = percent(sectionsShare * 0.3 + scale(tzShare) * 0.7);

  return {
    total,
    grade,
    dialogueCompleteness,
    tzCompleteness,
    foundRequirements: mandatoryDisclosed.length + scenario.facts.filter((f) => f.requirementType === 'preference' && disclosed.has(f.id)).length,
    mandatoryTotal: mandatory.length,
    mandatoryDisclosed: mandatoryDisclosed.length,
    mandatoryInRegistry: inRegistry.length,
    mandatoryInTz: inTz.length,
    unknownsFound: unknownsFound.length,
    unknownsTotal: unknowns.length,
    parts,
    penalties,
    coveredCategories: covered.map((item) => item.title),
    missedCategories,
    emptySections,
    contradictions,
    generalQuestions,
    usefulQuestions,
    recommendations,
    etalon,
  };
}
