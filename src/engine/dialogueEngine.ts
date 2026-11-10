// Логика заказчика. Чистая функция: состояние + вопрос → новое состояние + ответ.
import type {
  Ambiguity,
  Difficulty,
  EngineReply,
  EngineState,
  Intent,
  MessageQuality,
  ReplyStep,
  Scenario,
  ScenarioFact,
  Unit,
} from '../types';
import { discloseFacts, factById, isDisclosed, missingPrerequisites } from './factTracker';
import { analyze, findAmbiguity, matchByExample, MIN_INTENT_SCORE, rankIntents, type Analysis, type MatchContext } from './intentMatcher';
import type { ParsedNumber } from './normalizeText';
import { fillTemplate, pickVariant } from './responseSelector';

export type DialogueInput = {
  text: string;
  seed: number;
  difficulty: Difficulty;
  /** Студент уточняет конкретное сообщение: контекст берётся из него. */
  replyTo?: { topic?: string | null; factIds?: string[]; intentId?: string | null } | null;
};

export function createEngineState(): EngineState {
  return {
    turn: 0,
    disclosed: [],
    askedIntents: {},
    topic: null,
    lastIntentId: null,
    lastFactIds: [],
    lastAttributes: [],
    pending: null,
    usedVariants: {},
    patience: 5,
    counters: {
      repeats: 0,
      general: 0,
      unrecognized: 0,
      clarifications: 0,
      corrections: 0,
      confusedPressure: 0,
      confusedWarnAlarm: 0,
      askedMandatory: 0,
    },
  };
}

const CLAIM_CUE = /(?:^|\s)(значит|верно|правильно|то есть|тоесть|так|получается|подтвердите|понял|понимаю|записываю|запишу|итого|согласны|выходит)(?:\s|$)/;

function bump(state: EngineState, key: keyof EngineState['counters'], by = 1): EngineState {
  return { ...state, counters: { ...state.counters, [key]: state.counters[key] + by } };
}

function setPatience(state: EngineState, delta: number): EngineState {
  return { ...state, patience: Math.max(0, Math.min(6, state.patience + delta)) };
}

// --- Сверка чисел ---

type ClaimCheck =
  | { status: 'ok'; fact: ScenarioFact; given: ParsedNumber[] }
  | { status: 'wrong'; fact: ScenarioFact; given: ParsedNumber; sibling: ScenarioFact | null }
  | { status: 'none' };

function numberFits(fact: ScenarioFact, value: number): boolean {
  const claim = fact.claim;
  if (!claim) return false;
  if (claim.range) return value >= claim.values[0] - 1e-9 && value <= claim.values[1] + 1e-9;
  return claim.values.some((item) => Math.abs(item - value) < 1e-9);
}

function unitWord(unit: Unit | null): string {
  switch (unit) {
    case 'c':
      return '°C';
    case 'mpa':
      return 'МПа';
    case 'm3h':
      return 'м³/ч';
    case 'kw':
      return 'кВт';
    case 'hz':
      return 'Гц';
    case 'v':
      return 'В';
    case 's':
      return 'с';
    case 'm':
      return 'м';
    case 'dn':
      return '';
    default:
      return '';
  }
}

/** Находит факт, о котором утверждает студент, и сверяет число. */
export function checkClaim(
  concepts: Set<string>,
  numbers: ParsedNumber[],
  scenario: Scenario,
  fallbackFacts: string[] = [],
  disclosed: string[] = [],
  allowLoose = false,
): ClaimCheck {
  const numeric = numbers.filter((item) => item.value !== undefined);
  if (!numeric.length) return { status: 'none' };
  const units = new Set(numeric.map((item) => item.unit).filter(Boolean));

  let candidates = scenario.facts.filter((fact) => {
    if (!fact.claim) return false;
    if (units.size && !units.has(fact.claim.unit)) return false;
    return fact.claim.concepts.every((group) => group.some((concept) => concepts.has(concept)));
  });
  if (!candidates.length && allowLoose) {
    candidates = scenario.facts.filter(
      (fact) =>
        fact.claim?.looseConcepts &&
        (!units.size || units.has(fact.claim.unit)) &&
        fact.claim.looseConcepts.every((group) => group.some((concept) => concepts.has(concept))),
    );
  }
  if (!candidates.length) {
    candidates = fallbackFacts
      .map((id) => factById(scenario, id))
      .filter((fact): fact is ScenarioFact => Boolean(fact?.claim))
      .filter((fact) => !units.size || units.has(fact.claim!.unit));
  }
  if (!candidates.length) return { status: 'none' };

  // Самый специфичный факт — с наибольшим числом групп понятий.
  candidates = [...candidates].sort((a, b) => (b.claim?.concepts.length ?? 0) - (a.claim?.concepts.length ?? 0));

  // В предложении бывает несколько значений («2,2 кВт, 400 В»): каждое сверяем с фактами своей единицы.
  const ownFacts = (item: ParsedNumber) => (item.unit ? candidates.filter((fact) => fact.claim?.unit === item.unit) : candidates);
  const wrong = numeric.find((item) => {
    const own = ownFacts(item);
    return own.length > 0 && !own.some((fact) => numberFits(fact, item.value));
  });
  if (!wrong) {
    const fitting = candidates.find((fact) => numeric.some((item) => numberFits(fact, item.value))) ?? candidates[0];
    return { status: 'ok', fact: fitting, given: numeric };
  }

  const own = ownFacts(wrong);
  const topSize = own[0].claim?.concepts.length ?? 0;
  const top = own.filter((item) => item.claim?.concepts.length === topSize);
  const fact = top.find((item) => disclosed.includes(item.id)) ?? top[0];
  const sibling =
    scenario.facts.find(
      (other) =>
        other.id !== fact.id &&
        other.claim?.unit === fact.claim?.unit &&
        numberFits(other, wrong.value) &&
        disclosed.includes(other.id),
    ) ?? null;
  return { status: 'wrong', fact, given: wrong, sibling };
}

function isPressureMixup(fact: ScenarioFact, sibling: ScenarioFact | null): boolean {
  if (!sibling) return false;
  const pair = [fact.id, sibling.id];
  return pair.some((id) => id.startsWith('press_in')) && pair.some((id) => id.startsWith('press_out'));
}

function isWarnAlarmMixup(fact: ScenarioFact, sibling: ScenarioFact | null): boolean {
  if (!sibling) return false;
  const pair = [fact.category, sibling.category];
  return pair.includes('warning') && pair.includes('protection');
}

// --- Сборка ответа ---

type Built = { state: EngineState; reply: EngineReply };

function finish(
  state: EngineState,
  text: string,
  quality: MessageQuality,
  intent: Intent | null,
  factIds: string[],
  topic: string | null,
): Built {
  return {
    state,
    reply: { text, intentId: intent?.id ?? null, topic, factIds, quality },
  };
}

function nextStep(state: EngineState, steps: ReplyStep[]): ReplyStep | null {
  return steps.find((step) => step.facts.some((id) => !isDisclosed(state, id))) ?? null;
}

function withImpatience(state: EngineState, input: DialogueInput, scenario: Scenario, text: string): { text: string; state: EngineState } {
  if (state.patience > 1) return { text, state };
  const picked = pickVariant(state, input.seed, 'meta:impatient', scenario.meta.impatient);
  return { text: `${picked.text} ${text}`, state: { ...picked.state, patience: 3 } };
}

/** Сам вопрос студента: нормализованный текст (для настоящих повторов) и спрошенная сторона темы. */
type Question = { key: string; aspect: string | null };

/** Ответ на намерение с фактами: следующий шаг раскрытия, предпосылка или повтор. */
function answerIntent(state: EngineState, intent: Intent, input: DialogueInput, scenario: Scenario, reminder: boolean, question?: Question): Built {
  const steps = scenario.replies[intent.id] ?? [];
  const asked = state.askedIntents[intent.id] ?? 0;
  const key = question?.key ?? '';
  const askedTexts = state.askedTexts?.[intent.id] ?? [];
  // Повтор — это тот же вопрос теми же словами; другая формулировка той же темы повтором не считается.
  const sameQuestion = reminder || (key !== '' && askedTexts.includes(key));
  const aspect = question?.aspect ?? null;
  const aspectVariants = aspect ? scenario.aspectReplies?.[intent.id]?.[aspect] : undefined;
  let current: EngineState = {
    ...state,
    askedIntents: { ...state.askedIntents, [intent.id]: asked + 1 },
    askedTexts: key && !askedTexts.includes(key) ? { ...state.askedTexts, [intent.id]: [...askedTexts, key] } : state.askedTexts,
    topic: intent.topic,
    lastIntentId: intent.id,
    pending: null,
  };

  // Общий ответ без фактов: первый раз подробнее, потом короче.
  if (steps.length > 0 && steps.every((step) => step.facts.length === 0)) {
    const step = steps[Math.min(asked, steps.length - 1)];
    const group = asked === 0 ? step.variants : step.short;
    const picked = pickVariant(current, input.seed, `${intent.id}:${asked === 0 ? 'first' : 'short'}`, group);
    current = picked.state;
    if (intent.kind === 'general') {
      current = setPatience(bump(current, 'general'), -1);
      const decorated = withImpatience(current, input, scenario, picked.text);
      return finish(decorated.state, decorated.text, 'general', intent, [], intent.topic);
    }
    return finish({ ...current, lastFactIds: [] }, picked.text, 'social', intent, [], intent.topic);
  }

  const step = nextStep(current, steps);
  if (step) {
    // Для связанных значений порядок важен: без предпосылки факт не выдаём.
    const fresh = step.facts.filter((id) => !isDisclosed(current, id));
    for (const id of fresh) {
      const fact = factById(scenario, id);
      if (!fact) continue;
      const missing = missingPrerequisites(current, fact);
      if (missing.length) {
        const prerequisite = factById(scenario, missing[0]);
        const picked = pickVariant(current, input.seed, 'meta:prerequisite', scenario.meta.prerequisiteBlock);
        const text = fillTemplate(picked.text, {
          need: prerequisite?.askLabel ?? prerequisite?.label ?? 'исходное значение',
        });
        return finish({ ...picked.state, lastFactIds: [] }, text, 'blocked', intent, [], intent.topic);
      }
    }
    const stepIndex = steps.indexOf(step);
    const picked = aspectVariants
      ? pickVariant(current, input.seed, `${intent.id}:a:${aspect}`, aspectVariants)
      : pickVariant(current, input.seed, `${intent.id}:${stepIndex}`, step.variants);
    current = discloseFacts(picked.state, step.facts);
    current = { ...current, lastFactIds: step.facts };
    const onlyUnknown = step.facts.every((id) => factById(scenario, id)?.customerConfidence === 'unknown');
    if (intent.kind === 'general') {
      // Общий вопрос открывает только общие сведения и считается слишком общим.
      current = setPatience(bump(current, 'general'), -1);
      const decorated = withImpatience(current, input, scenario, picked.text);
      return finish(decorated.state, decorated.text, 'general', intent, step.facts, intent.topic);
    }
    current = setPatience(current, 1);
    const mandatory = step.facts.filter((id) => factById(scenario, id)?.requirementType === 'mandatory').length;
    current = bump(current, 'askedMandatory', mandatory);
    return finish(current, picked.text, onlyUnknown ? 'unknown_found' : 'useful', intent, step.facts, intent.topic);
  }

  // Этот вопрос задан впервые, а сведения уже прозвучали в другом ответе: это не повтор.
  if (asked === 0 && steps.length > 0) {
    const first = steps[0];
    const picked = aspectVariants
      ? pickVariant(current, input.seed, `${intent.id}:a:${aspect}`, aspectVariants)
      : pickVariant(current, input.seed, `${intent.id}:0`, first.variants);
    const facts = steps.flatMap((item) => item.facts);
    if (intent.kind === 'general') {
      current = setPatience(bump({ ...picked.state, lastFactIds: facts }, 'general'), -1);
      const decorated = withImpatience(current, input, scenario, picked.text);
      return finish(decorated.state, decorated.text, 'general', intent, facts, intent.topic);
    }
    return finish({ ...picked.state, lastFactIds: facts }, picked.text, 'confirmation', intent, facts, intent.topic);
  }

  // Другая формулировка той же темы: отвечаем полно и без упрёка, как на новый вопрос.
  if (!sameQuestion && key) {
    const variants = aspectVariants ?? steps.flatMap((item) => item.variants);
    if (variants.length) {
      // У намерения с одним шагом группа общая с первым ответом: иначе тот же вариант прозвучит дважды подряд.
      const groupKey = aspect && aspectVariants ? `${intent.id}:a:${aspect}` : steps.length === 1 ? `${intent.id}:0` : `${intent.id}:alt`;
      const picked = pickVariant(current, input.seed, groupKey, variants);
      const facts = steps.flatMap((item) => item.facts);
      return finish({ ...picked.state, lastFactIds: facts }, picked.text, 'confirmation', intent, facts, intent.topic);
    }
  }

  // Всё уже раскрыто: короткий повтор, при явной просьбе напомнить — без упрёка.
  const shortSteps = steps.length ? steps : [];
  const short = aspectVariants ?? shortSteps.flatMap((item) => item.short);
  const shortKey = `${intent.id}:short`;
  const lastStep = shortSteps[shortSteps.length - 1];
  const shortPicked = pickVariant(current, input.seed, shortKey, short.length ? short : lastStep?.variants ?? ['Мы это уже обсуждали.']);
  current = shortPicked.state;
  const templates = reminder
    ? scenario.meta.reminderTemplates
    : asked >= 2
      ? scenario.meta.repeatAgainTemplates
      : scenario.meta.repeatTemplates;
  const templatePicked = pickVariant(current, input.seed, reminder ? 'meta:reminder' : asked >= 2 ? 'meta:repeatAgain' : 'meta:repeat', templates);
  current = templatePicked.state;
  const facts = steps.flatMap((item) => item.facts);
  current = { ...current, lastFactIds: facts };
  if (!reminder) current = bump(current, 'repeats');
  const text = fillTemplate(templatePicked.text, { short: shortPicked.text });
  const decorated = { text, state: current };
  return finish(decorated.state, decorated.text, reminder ? 'social' : 'repeat', intent, facts, intent.topic);
}

function answerAmbiguity(
  state: EngineState,
  ambiguity: Ambiguity,
  analysis: Analysis,
  input: DialogueInput,
): Built {
  const group = input.difficulty === 'strict' ? ambiguity.strictQuestions : ambiguity.questions;
  const picked = pickVariant(state, input.seed, `amb:${ambiguity.id}:${input.difficulty === 'strict' ? 's' : 'n'}`, group);
  const current: EngineState = bump(
    {
      ...picked.state,
      pending: { ambiguityId: ambiguity.id, concepts: [...analysis.concepts] },
    },
    'clarifications',
  );
  return finish(current, picked.text, 'clarify', null, [], current.topic);
}

function answerFallback(state: EngineState, input: DialogueInput, scenario: Scenario): Built {
  let current = setPatience(bump({ ...state, pending: null }, 'unrecognized'), -1);
  if (input.difficulty === 'strict') {
    const picked = pickVariant(current, input.seed, 'meta:fallbackStrict', scenario.meta.fallbackStrict);
    return finish(picked.state, picked.text, 'unrecognized', null, [], current.topic);
  }
  const picked = pickVariant(current, input.seed, 'meta:fallback', scenario.meta.fallback);
  current = picked.state;
  const decorated = withImpatience(current, input, scenario, picked.text);
  return finish(decorated.state, decorated.text, 'unrecognized', null, [], current.topic);
}

function answerClaim(state: EngineState, check: ClaimCheck, input: DialogueInput, scenario: Scenario): Built | null {
  if (check.status === 'none') return null;
  if (check.status === 'ok') {
    const picked = pickVariant(state, input.seed, 'meta:confirm', scenario.meta.confirmCorrect);
    const display = check.fact.claim?.display ?? '';
    let current = discloseFacts(picked.state, [check.fact.id]);
    current = { ...current, lastFactIds: [check.fact.id], pending: null };
    return finish(current, fillTemplate(picked.text, { value: display, label: check.fact.label.toLowerCase() }), 'confirmation', null, [check.fact.id], state.topic);
  }
  let current = setPatience(bump(state, 'corrections'), 0);
  if (isPressureMixup(check.fact, check.sibling)) current = bump(current, 'confusedPressure');
  if (isWarnAlarmMixup(check.fact, check.sibling)) current = bump(current, 'confusedWarnAlarm');
  const given = `${check.given.raw.replace('.', ',')} ${unitWord(check.given.unit ?? check.fact.claim?.unit ?? null)}`.trim();
  const correct = check.fact.claim?.display ?? '';
  const label = check.fact.label.toLowerCase();
  const known = isDisclosed(current, check.fact.id);
  if (known && check.sibling) {
    const picked = pickVariant(current, input.seed, 'meta:misheardCrossed', scenario.meta.misheardCrossed);
    const text = fillTemplate(picked.text, { given, correct, label, other: check.sibling.label.toLowerCase() });
    return finish({ ...picked.state, lastFactIds: [check.fact.id], pending: null }, text, 'correction', null, [check.fact.id], state.topic);
  }
  if (known) {
    const picked = pickVariant(current, input.seed, 'meta:misheardDisclosed', scenario.meta.misheardDisclosed);
    const text = fillTemplate(picked.text, { given, correct, label });
    return finish({ ...picked.state, lastFactIds: [check.fact.id], pending: null }, text, 'correction', null, [check.fact.id], state.topic);
  }
  // Значение ещё не называлось: заказчик не подтверждает выдумку и не раскрывает верное.
  const picked = pickVariant(current, input.seed, 'meta:misheardUndisclosed', scenario.meta.misheardUndisclosed);
  return finish({ ...picked.state, pending: null }, fillTemplate(picked.text, { given, label }), 'correction', null, [], state.topic);
}

// --- Мета-намерения ---

function answerMeta(state: EngineState, intent: Intent, input: DialogueInput, scenario: Scenario, ctxFacts: string[], ctxIntentId: string | null): Built {
  const meta = scenario.meta;
  const lastFact = ctxFacts.length ? factById(scenario, ctxFacts[0]) : undefined;
  const keepTopic = state.topic;

  switch (intent.id) {
    case 'followup_more': {
      const lastIntent = scenario.intents.find((item) => item.id === ctxIntentId);
      const steps = lastIntent ? scenario.replies[lastIntent.id] ?? [] : [];
      if (lastIntent && nextStep(state, steps)) return answerIntent(state, lastIntent, input, scenario, false);
      const picked = pickVariant(state, input.seed, 'meta:noMore', meta.noMore);
      return finish(picked.state, picked.text, 'social', intent, [], keepTopic);
    }
    case 'followup_precise': {
      if (!lastFact) {
        const picked = pickVariant(state, input.seed, 'meta:noContext', meta.noContext);
        return finish(picked.state, picked.text, 'social', intent, [], keepTopic);
      }
      const picked = pickVariant(state, input.seed, `meta:precise:${lastFact.customerConfidence}`, meta.precise[lastFact.customerConfidence]);
      return finish(picked.state, picked.text, 'social', intent, ctxFacts, keepTopic);
    }
    case 'is_mandatory': {
      if (!lastFact) {
        const picked = pickVariant(state, input.seed, 'meta:noContext', meta.noContext);
        return finish(picked.state, picked.text, 'social', intent, [], keepTopic);
      }
      const picked = pickVariant(state, input.seed, `meta:mandatory:${lastFact.requirementType}`, meta.mandatory[lastFact.requirementType]);
      return finish(picked.state, picked.text, 'social', intent, ctxFacts, keepTopic);
    }
    case 'followup_why': {
      const picked = pickVariant(state, input.seed, 'meta:why', meta.why);
      return finish(picked.state, picked.text, 'social', intent, ctxFacts, keepTopic);
    }
    case 'repeat_last': {
      const lastIntent = scenario.intents.find((item) => item.id === ctxIntentId);
      if (lastIntent) {
        const steps = scenario.replies[lastIntent.id] ?? [];
        const short = steps.filter((step) => step.facts.some((id) => isDisclosed(state, id))).flatMap((step) => step.short);
        if (short.length) {
          const picked = pickVariant(state, input.seed, `${lastIntent.id}:short`, short);
          const wrapped = pickVariant(picked.state, input.seed, 'meta:repeatLast', meta.repeatLast);
          return finish(wrapped.state, fillTemplate(wrapped.text, { short: picked.text }), 'social', intent, ctxFacts, keepTopic);
        }
      }
      const picked = pickVariant(state, input.seed, 'meta:noContext', meta.noContext);
      return finish(picked.state, picked.text, 'social', intent, [], keepTopic);
    }
    default:
      return answerIntent(state, intent, input, scenario, false);
  }
}

const REMINDER_CUE = /(напомн|повтор|еще раз|забыл)/;

// --- Главная функция ---

export function respond(previous: EngineState, input: DialogueInput, scenario: Scenario): { state: EngineState; reply: EngineReply } {
  let state: EngineState = { ...previous, turn: previous.turn + 1 };
  // В сообщении несколько вопросов: разбираем первый, про остальные заказчик скажет отдельно.
  const questionParts = input.text.split(/(?<=\?)\s+/).map((part) => part.trim()).filter(Boolean);
  const severalQuestions = questionParts.length >= 2 && questionParts.every((part) => part.length > 8);
  const questionText = severalQuestions ? questionParts[0] : input.text;
  const analysis = analyze(questionText, scenario);
  const question: Question = { key: analysis.normalized, aspect: analysis.frame.aspect };

  const baseCtx: MatchContext = { topic: input.replyTo?.topic ?? state.topic, lastAttributes: input.replyTo ? [] : state.lastAttributes };
  const rawTop = rankIntents(analysis, baseCtx, scenario)[0];
  const rawIsService = rawTop && rawTop.score >= 3 && (rawTop.intent.kind === 'social' || rawTop.intent.kind === 'meta');
  // Ответ на встречный вопрос дополняет прошлый вопрос, только если в нём есть что-то по делу.
  const pendingSubjects = scenario.subjectConcepts.filter((c) => state.pending?.concepts.includes(c));
  const changesSubject = scenario.subjectConcepts.some((c) => analysis.concepts.has(c) && !pendingSubjects.includes(c) && !['hc', 'air'].includes(c));
  // «Перегрев» и «нагрев» — это про температуру, даже если слова «температура» в вопросе нет.
  const newTemperature = ['heat', 'overheat'].some((c) => analysis.concepts.has(c) && !state.pending?.concepts.includes(c));
  const usePending = state.pending && analysis.concepts.size > 0 && !rawIsService && !changesSubject && !newTemperature;
  if (state.pending && !usePending) state = { ...state, pending: null };
  const ctx: MatchContext = { ...baseCtx, extraConcepts: usePending ? state.pending!.concepts : undefined };
  const ctxFacts = input.replyTo?.factIds?.length ? input.replyTo.factIds : state.lastFactIds;
  const ctxIntent = input.replyTo?.intentId ?? state.lastIntentId;

  const concepts = new Set([...analysis.concepts, ...(ctx.extraConcepts ?? [])]);
  const fullAnalysis: Analysis = { ...analysis, concepts };

  // Запоминаем признак вопроса, чтобы понять следующее короткое уточнение.
  const attributes = scenario.attributeConcepts.filter((concept) => concepts.has(concept));
  const rememberAttributes = (result: Built): Built => ({
    ...result,
    state: { ...result.state, lastAttributes: attributes },
  });

  let reason = 'Правила и контекст';
  let score: number | null = null;
  const update = (result: Built): Built => rememberAttributes({ ...result, reply: { ...result.reply, diagnostic: { reason, score } } });

  // Смысловые ограничения действуют до приоритетных примеров пакета.
  const frame = analysis.frame;
  const framedAnswer = (id: string) => {
    reason = 'Смысл вопроса: время и предмет';
    return update(answerIntent({ ...state, pending: null }, scenario.intents.find((item) => item.id === id)!, input, scenario, false, question));
  };
  if (frame.currentPump || frame.responsibility || frame.mixedModes) {
    reason = 'Недостаточно исходных данных / уточнение времени';
    const text = frame.currentPump
      ? 'Способ управления существующим насосом у меня не уточнён. Это нужно проверить на объекте; требование к будущему управлению обсудим отдельно.'
      : frame.responsibility
        ? 'Предложите подходящее оборудование по требованиям и согласуйте с нами. Точное распределение ответственности у меня не определено.'
        : 'Вы спрашиваете, как узел работает сейчас, или какие режимы предусмотреть после автоматизации?';
    return update(finish({ ...state, pending: null, topic: null, lastFactIds: [], lastIntentId: null }, text, frame.mixedModes ? 'clarify' : 'unknown_found', null, [], null));
  }
  if (frame.currentOperation && !analysis.numbers.length) return framedAnswer('purpose_current');
  if (frame.inventory) {
    const result = framedAnswer('object_desc');
    if (frame.aspect && scenario.aspectReplies?.object_desc?.[frame.aspect]) return result;
    return { ...result, reply: { ...result.reply, text: `${result.reply.text} Полный перечень установленных приборов и исполнительных устройств нужно уточнить на объекте.` } };
  }
  if (frame.goal) return framedAnswer('purpose_goal');

  // 1. Утверждение с числом: сверяем и при необходимости поправляем студента.
  const isClaim =
    analysis.numbers.length > 0 &&
    !concepts.has('propose') &&
    !concepts.has('mandatoryw') &&
    (CLAIM_CUE.test(` ${analysis.normalized} `) || /\?\s*$/.test(questionText));
  if (isClaim) {
    const claimResult = answerClaim(state, checkClaim(concepts, analysis.numbers, scenario, ctxFacts, state.disclosed, true), input, scenario);
    if (claimResult) { reason = 'Проверка числового утверждения'; return update(claimResult); }
  }

  if (rawIsService && rawTop.intent.kind === 'social') {
    reason = 'Социальная реплика'; score = rawTop.score;
    return update(answerIntent({ ...state, pending: null }, rawTop.intent, input, scenario, false, question));
  }

  // Вопрос почти дословно совпадает с вопросом из файла преподавателя — отвечаем этой темой.
  const priority = matchByExample(analysis, scenario, { priority: true, min: 0.6 });
  if (priority) {
    reason = 'Вопрос из пакета ответов (сходство)';
    score = priority.similarity;
    const chosen = priority.intent;
    if (chosen.kind === 'meta') return update(answerMeta(state, chosen, input, scenario, ctxFacts, ctxIntent));
    return update(answerIntent({ ...state, pending: null }, chosen, input, scenario, REMINDER_CUE.test(analysis.normalized), question));
  }

  const ranked = rankIntents(analysis, ctx, scenario);
  const top = ranked[0];
  score = top?.score ?? null;
  const topIsStrong = top && top.score >= MIN_INTENT_SCORE;

  // 2. Служебные реплики и уточнения не требуют разбора неоднозначности.
  if (topIsStrong && (top.intent.kind === 'social' || top.intent.kind === 'meta') && top.score >= 3) {
    if (top.intent.kind === 'meta') return update(answerMeta(state, top.intent, input, scenario, ctxFacts, ctxIntent));
    return update(answerIntent({ ...state, pending: null }, top.intent, input, scenario, false, question));
  }

  // 3. Неоднозначный предмет — встречный вопрос вместо угадывания.
  const ambiguity = findAmbiguity(fullAnalysis, ctx, scenario);
  if (ambiguity) { reason = `Неоднозначность: ${ambiguity.id}`; return update(answerAmbiguity(state, ambiguity, analysis, input)); }

  // 4. Правила ничего не нашли: пробуем самый похожий пример формулировки.
  if (!topIsStrong) {
    const similar = matchByExample(analysis, scenario, { priority: false, min: 0.5 });
    if (similar && similar.intent.kind !== 'meta') {
      reason = 'Пример сценария (сходство)'; score = similar.similarity;
      return update(answerIntent({ ...state, pending: null }, similar.intent, input, scenario, false, question));
    }
    // «А летом?» без предмета в разговоре: переспрашиваем, а не отвечаем, что мы говорим о разном.
    const fragment = /^(?:а |и )?(летом|зимой|после насоса|до насоса|на входе|на выходе)$/.exec(analysis.normalized);
    if (fragment) {
      reason = 'Обрывочный вопрос без предмета';
      const picked = pickVariant(state, input.seed, 'meta:needSubject', scenario.meta.needSubject);
      const text = fillTemplate(picked.text, { piece: fragment[1] });
      return update(finish(bump({ ...picked.state, pending: null }, 'clarifications'), text, 'clarify', null, [], state.topic));
    }
    reason = 'Нет подходящего правила или примера';
    return update(answerFallback(state, input, scenario));
  }

  // 5. В одном сообщении несколько предметов: отвечаем только на первый.
  const reminder = REMINDER_CUE.test(analysis.normalized);
  const result = answerIntent(state, top.intent, input, scenario, reminder, question);
  const subjects = scenario.subjectConcepts.filter((concept) => analysis.concepts.has(concept));
  const second = ranked.find(
    (item) =>
      item.intent.topic !== top.intent.topic &&
      !item.viaContext &&
      (item.intent.kind === 'fact' || item.intent.kind === 'unknown') &&
      item.score >= top.score - 1.5,
  );
  const joined = subjects.length >= 2 && Boolean(second) && /(^|\s)и(\s|$)/.test(analysis.normalized);
  if ((severalQuestions || joined) && result.reply.quality !== 'general') {
    const picked = pickVariant(result.state, input.seed, 'meta:multi', scenario.meta.multiQuestion);
    return update({
      state: picked.state,
      reply: { ...result.reply, text: `${result.reply.text} ${picked.text}` },
    });
  }
  return update(result);
}

/**
 * Один вопрос без истории диалога (проверка в панели преподавателя).
 * Если вопрос упёрся в «сначала спросите другое», его предпосылки считаются известными:
 * иначе по одиночному вопросу про допуск температуры никогда не увидеть сам ответ.
 */
export function respondIsolated(input: DialogueInput, scenario: Scenario): { state: EngineState; reply: EngineReply } {
  let base = createEngineState();
  let out = respond(base, input, scenario);
  for (let guard = 0; out.reply.quality === 'blocked' && guard < 5; guard++) {
    const needed = (scenario.replies[out.reply.intentId ?? ''] ?? [])
      .flatMap((step) => step.facts)
      .flatMap((id) => factById(scenario, id)?.prerequisites ?? []);
    if (!needed.length) break;
    base = discloseFacts(base, needed);
    out = respond(base, input, scenario);
  }
  return out;
}
