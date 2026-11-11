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
  GlossaryEntry,
  SpecGroup,
  SpecItem,
  UnknownTopic,
  Unit,
} from '../types';
import { discloseFacts, factById, isDisclosed, missingPrerequisites } from './factTracker';
import { analyze, contextConcepts, findAmbiguity, matchByExample, MIN_INTENT_SCORE, rankIntents, type Analysis, type MatchContext } from './intentMatcher';
import { prepareMessage } from './messagePrep';
import { normalizeText } from './normalizeText';
import { detectQuestionFrame, frameAction, withoutDomainFrames } from './questionFrame';
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

/** Шаг ответа, который раскрывает нужную предпосылку (с самим намерением, чтобы выбрать вариант реплики). */
function prerequisiteSource(scenario: Scenario, factId: string): { intentId: string; index: number; step: ReplyStep } | null {
  for (const intent of scenario.intents) {
    if (intent.kind === 'general' || intent.kind === 'meta' || intent.kind === 'social') continue;
    const steps = scenario.replies[intent.id] ?? [];
    const index = steps.findIndex((step) => step.facts.includes(factId));
    if (index < 0) continue;
    return { intentId: intent.id, index, step: steps[index] };
  }
  return null;
}

function withImpatience(state: EngineState, input: DialogueInput, scenario: Scenario, text: string): { text: string; state: EngineState } {
  if (state.patience > 1) return { text, state };
  const picked = pickVariant(state, input.seed, 'meta:impatient', scenario.meta.impatient);
  return { text: `${picked.text} ${text}`, state: { ...picked.state, patience: 3 } };
}

/** Сам вопрос студента: нормализованный текст (для настоящих повторов) и спрошенная сторона темы. */
type Question = { key: string; aspect: string | null };

/** Выбор варианта из нескольких шагов: вместе с текстом возвращается шаг, чьи сведения реально прозвучали. */
function pickFromSteps(
  state: EngineState,
  seed: number,
  groupKey: string,
  steps: ReplyStep[],
  field: 'variants' | 'short',
): { text: string; state: EngineState; facts: string[] } {
  const flat = steps.flatMap((item) => item[field].map((text) => ({ text, facts: item.facts })));
  const picked = pickVariant(state, seed, groupKey, flat.map((item) => item.text));
  const facts = flat.find((item) => item.text === picked.text)?.facts ?? [];
  return { ...picked, facts };
}

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
    lastSpec: null,
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
    // Связанные значения заказчик сообщает сам: сначала то, от чего зависит ответ, затем сам ответ.
    // Студенту не нужно угадывать порядок вопросов.
    const lead: string[] = [];
    const leadFacts: string[] = [];
    for (let guard = 0; guard < 5; guard++) {
      const missing = step.facts
        .map((id) => factById(scenario, id))
        .flatMap((fact) => (fact ? missingPrerequisites(current, fact) : []));
      if (!missing.length) break;
      const source = prerequisiteSource(scenario, missing[0]);
      if (!source) {
        const prerequisite = factById(scenario, missing[0]);
        const picked = pickVariant(current, input.seed, 'meta:prerequisite', scenario.meta.prerequisiteBlock);
        const text = fillTemplate(picked.text, {
          need: prerequisite?.askLabel ?? prerequisite?.label ?? 'исходное значение',
        });
        return finish({ ...picked.state, lastFactIds: [] }, text, 'blocked', intent, [], intent.topic);
      }
      const spoken = pickVariant(current, input.seed, `${source.intentId}:${source.index}`, source.step.variants);
      current = discloseFacts(spoken.state, source.step.facts);
      lead.push(spoken.text);
      leadFacts.push(...source.step.facts);
    }
    const stepIndex = steps.indexOf(step);
    const mainPicked = aspectVariants
      ? pickVariant(current, input.seed, `${intent.id}:a:${aspect}`, aspectVariants)
      : pickVariant(current, input.seed, `${intent.id}:${stepIndex}`, step.variants);
    const picked = lead.length ? { ...mainPicked, text: `${lead.join(' ')} ${mainPicked.text}` } : mainPicked;
    current = discloseFacts(picked.state, step.facts);
    const spokenFacts = [...step.facts, ...leadFacts];
    current = { ...current, lastFactIds: spokenFacts };
    const onlyUnknown = step.facts.every((id) => factById(scenario, id)?.customerConfidence === 'unknown');
    if (intent.kind === 'general') {
      // Общий вопрос открывает только общие сведения и считается слишком общим.
      current = setPatience(bump(current, 'general'), -1);
      const decorated = withImpatience(current, input, scenario, picked.text);
      return finish(decorated.state, decorated.text, 'general', intent, spokenFacts, intent.topic);
    }
    current = setPatience(current, 1);
    const mandatory = step.facts.filter((id) => factById(scenario, id)?.requirementType === 'mandatory').length;
    current = bump(current, 'askedMandatory', mandatory);
    return finish(current, picked.text, onlyUnknown ? 'unknown_found' : 'useful', intent, spokenFacts, intent.topic);
  }

  // Этот вопрос задан впервые, а сведения уже прозвучали в другом ответе: это не повтор.
  if (asked === 0 && steps.length > 0) {
    const picked = aspectVariants
      ? { ...pickVariant(current, input.seed, `${intent.id}:a:${aspect}`, aspectVariants), facts: steps[0].facts }
      : { ...pickVariant(current, input.seed, `${intent.id}:0`, steps[0].variants), facts: steps[0].facts };
    if (intent.kind === 'general') {
      current = setPatience(bump({ ...picked.state, lastFactIds: picked.facts }, 'general'), -1);
      const decorated = withImpatience(current, input, scenario, picked.text);
      return finish(decorated.state, decorated.text, 'general', intent, picked.facts, intent.topic);
    }
    return finish({ ...picked.state, lastFactIds: picked.facts }, picked.text, 'confirmation', intent, picked.facts, intent.topic);
  }

  // Другая формулировка той же темы: отвечаем полно и без упрёка, как на новый вопрос.
  if (!sameQuestion && key) {
    // У намерения с одним шагом группа общая с первым ответом: иначе тот же вариант прозвучит дважды подряд.
    const picked = aspectVariants
      ? { ...pickVariant(current, input.seed, `${intent.id}:a:${aspect}`, aspectVariants), facts: steps[0]?.facts ?? [] }
      : steps.length === 1
        ? { ...pickVariant(current, input.seed, `${intent.id}:0`, steps[0].variants), facts: steps[0].facts }
        : pickFromSteps(current, input.seed, `${intent.id}:alt`, steps, 'variants');
    if (picked.text) return finish({ ...picked.state, lastFactIds: picked.facts }, picked.text, 'confirmation', intent, picked.facts, intent.topic);
  }

  // Всё уже раскрыто: короткий повтор, при явной просьбе напомнить — без упрёка.
  const shortPicked = aspectVariants
    ? { ...pickVariant(current, input.seed, `${intent.id}:short`, aspectVariants), facts: steps[0]?.facts ?? [] }
    : steps.length
      ? pickFromSteps(current, input.seed, `${intent.id}:short`, steps, 'short')
      : { ...pickVariant(current, input.seed, `${intent.id}:short`, ['Мы это уже обсуждали.']), facts: [] as string[] };
  current = shortPicked.state;
  const templates = reminder
    ? scenario.meta.reminderTemplates
    : asked >= 2
      ? scenario.meta.repeatAgainTemplates
      : scenario.meta.repeatTemplates;
  const templatePicked = pickVariant(current, input.seed, reminder ? 'meta:reminder' : asked >= 2 ? 'meta:repeatAgain' : 'meta:repeat', templates);
  current = templatePicked.state;
  current = { ...current, lastFactIds: shortPicked.facts };
  if (!reminder) current = bump(current, 'repeats');
  const text = fillTemplate(templatePicked.text, { short: shortPicked.text });
  return finish(current, text, reminder ? 'social' : 'repeat', intent, shortPicked.facts, intent.topic);
}

// --- Паспортные блоки, честное неизвестное, термины ---

/** Группа паспортных сведений, к которой относится вопрос: по предмету в вопросе или по теме разговора. */
function specGroupFor(scenario: Scenario, concepts: Set<string>, topic: string | null, ownSubject: boolean): SpecGroup | null {
  const groups = scenario.specGroups ?? [];
  return (
    groups.find((group) => group.subjects.some((subject) => concepts.has(subject))) ??
    (!ownSubject && topic ? groups.find((group) => group.topics.includes(topic)) ?? null : null)
  );
}

/** Шаг ответа, которым заказчик произносит факт (тем же текстом, что и на точный вопрос). */
function spokenStep(scenario: Scenario, intentId: string, factId: string): { index: number; step: ReplyStep } | null {
  const steps = scenario.replies[intentId] ?? [];
  const index = steps.findIndex((step) => step.facts.includes(factId));
  return index < 0 ? null : { index, step: steps[index] };
}

/**
 * Паспортный блок: 2–4 связанных значения одного устройства в одном ответе.
 * explicit — значения, о которых спросили прямо («мощность, подача, напор»); иначе — следующие нераскрытые.
 */
function answerSpec(state: EngineState, group: SpecGroup, input: DialogueInput, scenario: Scenario, explicit: SpecItem[] | null): Built {
  const limit = explicit ? 4 : 3;
  const candidates = explicit ?? group.items.filter((item) => !isDisclosed(state, item.factId));
  const chosen: SpecItem[] = [];
  for (const item of candidates) {
    if (chosen.length >= limit) break;
    const fact = factById(scenario, item.factId);
    if (!fact || !spokenStep(scenario, item.intentId, item.factId)) continue;
    // Предпосылка должна быть уже известна или прозвучать раньше в этом же ответе.
    const missing = missingPrerequisites(state, fact).filter((id) => !chosen.some((c) => c.factId === id));
    if (missing.length) continue;
    chosen.push(item);
  }
  const intent = scenario.intents.find((item) => item.id === group.intentId) ?? null;
  let current: EngineState = { ...state, pending: null, lastIntentId: group.intentId, lastSpec: group.id };
  // Блок исчерпан: короткий повтор уже названного, без упрёка.
  const recap = chosen.length === 0;
  const items = recap ? group.items.filter((item) => isDisclosed(state, item.factId)).slice(0, 4) : chosen;
  if (!items.length) return answerIntent(state, intent!, input, scenario, false);
  const texts: string[] = [];
  for (const item of items) {
    const source = spokenStep(scenario, item.intentId, item.factId)!;
    const picked = pickVariant(current, input.seed, recap ? `${item.intentId}:short` : `${item.intentId}:${source.index}`, recap ? source.step.short : source.step.variants);
    current = picked.state;
    texts.push(picked.text);
    current = { ...current, askedIntents: { ...current.askedIntents, [item.intentId]: (current.askedIntents[item.intentId] ?? 0) + 1 } };
  }
  const factIds = items.map((item) => item.factId);
  const fresh = factIds.filter((id) => !isDisclosed(state, id));
  current = discloseFacts(current, factIds);
  const firstIntent = scenario.intents.find((item) => item.id === items[0].intentId);
  current = { ...current, lastFactIds: factIds, topic: firstIntent?.topic ?? intent?.topic ?? state.topic };
  let text = texts.join(' ');
  const remaining = group.items.filter((item) => !isDisclosed(current, item.factId));
  if (!explicit && !recap && remaining.length && scenario.meta.specMore?.length) {
    const more = pickVariant(current, input.seed, 'meta:specMore', scenario.meta.specMore);
    current = more.state;
    text = `${text} ${more.text}`;
  }
  if (fresh.length) {
    current = setPatience(current, 1);
    current = bump(current, 'askedMandatory', fresh.filter((id) => factById(scenario, id)?.requirementType === 'mandatory').length);
  }
  return finish(current, text, fresh.length ? 'useful' : 'confirmation', intent, factIds, current.topic);
}

/** Значения группы, о которых спросили прямо: по признакам вопроса. */
function explicitSpecItems(group: SpecGroup, concepts: Set<string>): SpecItem[] {
  const seen = new Set<string>();
  return group.items.filter((item) => {
    if (seen.has(item.factId) || !item.cues.some((cue) => concepts.has(cue))) return false;
    seen.add(item.factId);
    return true;
  });
}

const SPEC_CUE = /характеристик|паспорт|какие данные|что известно|какие (у него|у нее|у них) |параметры (насоса|теплообменник|теплоносител)|параметры .*(известн|есть)|что (у вас |у нас )?(по|с) (насос|теплообмен|теплонос|питани|электропитани|электрик)|расскаж\S* (про|о|об|по) (насос|теплообмен|теплонос|питани|электропитани|электрик|услови)/;

/** Число без единицы получает единицу величины из вопроса: «давление 0,30» — это МПа, а не герцы частотника. */
function unitHinted(numbers: ParsedNumber[], concepts: Set<string>): ParsedNumber[] {
  const hint: Unit | null = concepts.has('press') ? 'mpa' : concepts.has('temp') ? 'c' : concepts.has('flow') ? 'm3h' : concepts.has('powerkw') ? 'kw' : null;
  return hint ? numbers.map((item) => (item.unit ? item : { ...item, unit: hint })) : numbers;
}

function matchUnknown(analysis: Analysis, scenario: Scenario, topic0: string | null): UnknownTopic | null {
  const text = ` ${analysis.normalized} `;
  for (const topic of scenario.unknownTopics ?? []) {
    if (topic.requiresNotFuture && analysis.frame.future) continue;
    // Короткое уточнение в теме разговора («он один? резервного нет?» про насос).
    if (topic.contextPattern && topic0 && topic.contextTopics?.includes(topic0) && new RegExp(topic.contextPattern).test(text)) return topic;
    if (topic.pattern && !new RegExp(topic.pattern).test(text)) continue;
    if (topic.concepts && !topic.concepts.every((group) => group.some((concept) => analysis.concepts.has(concept)))) continue;
    if (topic.excludeConcepts?.some((concept) => analysis.concepts.has(concept))) continue;
    if (!topic.pattern && !topic.concepts) continue;
    return topic;
  }
  return null;
}

/** Оговорка дополняет ответ по фактам, только если этот ответ — о той же теме (appendTo); иначе заменяет его. */
const appendsTo = (unknown: UnknownTopic | null, topic: string | null) => Boolean(unknown?.appendTo?.length && topic && unknown.appendTo.includes(topic));

function answerUnknown(state: EngineState, topic: UnknownTopic, input: DialogueInput): Built {
  const picked = pickVariant(state, input.seed, `unknown:${topic.id}`, topic.replies);
  const uncertain = state.uncertain ?? [];
  const current: EngineState = {
    ...picked.state,
    pending: null,
    lastFactIds: [],
    lastSpec: null,
    uncertain: uncertain.includes(topic.id) ? uncertain : [...uncertain, topic.id],
  };
  const built = finish(current, picked.text, 'unknown_found', null, [], state.topic);
  return { ...built, reply: { ...built.reply, uncertainty: { id: topic.id, kind: topic.kind, label: topic.label, category: topic.category } } };
}

function matchGlossary(analysis: Analysis, scenario: Scenario): GlossaryEntry | null {
  const text = ` ${analysis.normalized} `;
  if (!new RegExp(DEFINITION_CUE).test(text)) return null;
  return (scenario.glossary ?? []).find((entry) => new RegExp(entry.pattern).test(text)) ?? null;
}

/** Предмет непонятого вопроса — для одного уточняющего вопроса по нему. */
const SUBJECT_LABEL: Record<string, string> = {
  power: 'электропитанию', pump: 'насосу', motor: 'двигателю', vfd: 'частотнику', hx: 'теплообменнику', hc: 'теплоносителю',
  valve: 'клапану', air: 'сжатому воздуху', temp: 'температуре', press: 'давлению', flow: 'расходу', modes: 'режимам',
  hmi: 'экрану оператора', cabinet: 'шкафу', sensor: 'датчикам', alarm: 'авариям', log: 'журналу', trend: 'графикам',
  plc: 'контроллеру', docs: 'документации', cable: 'кабелям', flowmeter: 'расходомеру',
};

function answerMiss(state: EngineState, analysis: Analysis, input: DialogueInput, scenario: Scenario): Built {
  const streak = (state.missStreak ?? 0) + 1;
  const subject = Object.keys(SUBJECT_LABEL).find((concept) => analysis.concepts.has(concept));
  const meta = scenario.meta;
  // Два непонятых вопроса подряд: не повторять одно и то же, а подсказать, как спросить.
  if (streak >= 2 && meta.fallbackGuide?.length) {
    const picked = pickVariant(state, input.seed, 'meta:fallbackGuide', meta.fallbackGuide);
    const current = bump({ ...picked.state, pending: null, missStreak: 0 }, 'unrecognized');
    return finish(current, picked.text, 'unrecognized', null, [], state.topic);
  }
  if (subject && meta.fallbackSubject?.length) {
    const picked = pickVariant(state, input.seed, 'meta:fallbackSubject', meta.fallbackSubject);
    const current = bump({ ...picked.state, pending: null, missStreak: streak }, 'clarifications');
    return finish(current, fillTemplate(picked.text, { subject: SUBJECT_LABEL[subject] }), 'clarify', null, [], state.topic);
  }
  const built = answerFallback(state, input, scenario);
  return { ...built, state: { ...built.state, missStreak: streak } };
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
  // Без подсказки «случайной» темы: студент мог спрашивать ровно о ней.
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
      const spec = (scenario.specGroups ?? []).find((group) => group.id === state.lastSpec);
      if (spec && spec.items.some((item) => !isDisclosed(state, item.factId))) return answerSpec(state, spec, input, scenario, null);
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
/** Вопрос просит определение термина: «что такое…», «что значит…», «… это что?». */
const DEFINITION_CUE = String.raw`что так\S*|что значит|что означает|что это (за|такое)|это что|объясните|поясните|расшифруйте|в смысле`;
const INTERROGATIVE = /(^|\s)(какой|какая|какое|какие|каким|какую|каков\S*|скольк\S*|чем|когда|где|куда|зачем|почему|насколько|ли)(\s|$)/;
const PRONOUN = /(^|\s)(он|она|оно|они|его|ему|им|ним|него|нее|нему|у него|у нее)(\s|$)/;
const ELLIPSIS_START = new Set(['а', 'и', 'ну', 'тогда']);

// --- Главная функция ---

export function respond(previous: EngineState, input: DialogueInput, scenario: Scenario): { state: EngineState; reply: EngineReply } {
  let state: EngineState = { ...previous, turn: previous.turn + 1 };

  // Этап 1. Вежливость и вводная фраза не перехватывают вопрос.
  const prepared = prepareMessage(input.text);
  // В сообщении несколько вопросов: разбираем первый, про остальные заказчик скажет отдельно.
  const questionParts = prepared.body.split(/(?<=\?)\s+/).map((part) => part.trim()).filter(Boolean);
  const severalQuestions = questionParts.length >= 2 && questionParts.every((part) => part.length > 8);
  const questionText = severalQuestions ? questionParts[0] : prepared.body;
  let analysis = analyze(questionText, scenario);
  const question: Question = { key: analysis.normalized, aspect: analysis.frame.aspect };

  const baseCtx: MatchContext = { topic: input.replyTo?.topic ?? state.topic, lastAttributes: input.replyTo ? [] : state.lastAttributes };

  // Этап 3. Неполный вопрос («А как им сейчас управляют?») берёт предмет из разговора — и смысловая рамка тоже.
  const ownSubject = scenario.subjectConcepts.some((concept) => analysis.concepts.has(concept));
  const elliptical = analysis.tokens.length <= 6 || ELLIPSIS_START.has(analysis.tokens[0]) || PRONOUN.test(analysis.normalized);
  if (!ownSubject && elliptical) {
    const carriedSubjects = [...contextConcepts(analysis, baseCtx, scenario)].filter((concept) => scenario.subjectConcepts.includes(concept));
    if (carriedSubjects.length) {
      const detected = detectQuestionFrame(analysis.normalized, new Set([...analysis.concepts, ...carriedSubjects]));
      const frame = scenario.disableFrames ? withoutDomainFrames(detected) : detected;
      analysis = { ...analysis, frame };
      question.aspect = frame.aspect;
    }
  }

  const rawTop = rankIntents(analysis, baseCtx, scenario)[0];
  const rawIsService = rawTop && rawTop.score >= 3 && (rawTop.intent.kind === 'social' || rawTop.intent.kind === 'meta');
  // Ответ на встречный вопрос дополняет прошлый вопрос, только если в нём есть что-то по делу.
  const pendingSubjects = scenario.subjectConcepts.filter((c) => state.pending?.concepts.includes(c));
  // Если встречный вопрос как раз просил назвать предмет («предупреждение по какому параметру?»), названный предмет — это ответ, а не новая тема.
  const pendingAsksSubject = ['warning', 'alarm', 'tolerance', 'limit', 'sensor_loss'].includes(state.pending?.ambiguityId ?? '');
  // …но только если прошлый вопрос был без предмета: «предупреждение по температуре» → «а по давлению?» — уже другая тема.
  const changesSubject = !(pendingAsksSubject && pendingSubjects.length === 0) && scenario.subjectConcepts.some((c) => analysis.concepts.has(c) && !pendingSubjects.includes(c) && !['hc', 'air'].includes(c));
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
  const frame = analysis.frame;

  let reason = 'Правила и контекст';
  let score: number | null = null;
  const diagnosticFrame = {
    time: frame.time,
    action: frameAction(frame, concepts),
    subjects: scenario.subjectConcepts.filter((concept) => concepts.has(concept)),
    attributes,
    prefix: prepared.prefix,
  };
  const unknown = matchUnknown(fullAnalysis, scenario, ctx.topic);

  /** Этапы 6–7: ответное приветствие, учёт непонятых подряд, диагностика. */
  const update = (result: Built): Built => {
    let text = result.reply.text;
    let next = result.state;
    if (prepared.greeted && result.reply.intentId !== 'greeting' && scenario.meta.greetBack?.length) {
      const hello = pickVariant(next, input.seed, 'meta:greetBack', scenario.meta.greetBack);
      next = hello.state;
      text = `${hello.text} ${text}`;
    }
    const missed = result.reply.quality === 'unrecognized' || (result.reply.quality === 'clarify' && reason === 'Непонятый вопрос: уточнение по предмету');
    next = { ...next, lastAttributes: attributes, missStreak: missed ? next.missStreak ?? 0 : 0 };
    // Сведение, которого заказчик не знает: класс неизвестности ставится по распознанному намерению, а не по словам вопроса.
    let uncertainty = result.reply.uncertainty;
    const byIntent = !uncertainty && result.reply.intentId ? scenario.unknownTopics?.find((topic) => topic.intentOnly && topic.id === result.reply.intentId) : undefined;
    if (byIntent) {
      uncertainty = { id: byIntent.id, kind: byIntent.kind, label: byIntent.label, category: byIntent.category };
      if (!next.uncertain?.includes(byIntent.id)) next = { ...next, uncertain: [...(next.uncertain ?? []), byIntent.id] };
    }
    return { state: next, reply: { ...result.reply, text, ...(uncertainty ? { uncertainty } : {}), diagnostic: { reason, score, frame: diagnosticFrame } } };
  };

  /** Честная оговорка о неизвестном: заменяет ответ невпопад или дополняет ответ по фактам рядом. */
  const withUnknown = (result: Built): Built => {
    if (!unknown) return result;
    const answeredFacts = result.reply.factIds.length > 0 && ['useful', 'confirmation', 'unknown_found'].includes(result.reply.quality);
    if (appendsTo(unknown, result.reply.topic) && answeredFacts) {
      const extra = answerUnknown(result.state, unknown, input);
      return { state: extra.state, reply: { ...result.reply, text: `${result.reply.text} ${extra.reply.text}`, uncertainty: extra.reply.uncertainty } };
    }
    reason = `Сведений нет: ${unknown.label}`;
    return answerUnknown({ ...state, pending: null }, unknown, input);
  };

  const framedAnswer = (id: string) => {
    reason = 'Смысл вопроса: время и предмет';
    return answerIntent({ ...state, pending: null }, scenario.intents.find((item) => item.id === id)!, input, scenario, false, question);
  };

  /** Этапы 2, 4, 5: рамка → правила и примеры → fallback. */
  const route = (): Built => {
    // Термин: короткое пояснение без значений.
    const term = matchGlossary(analysis, scenario);
    if (term) {
      reason = 'Пояснение термина';
      return finish({ ...state, pending: null, lastFactIds: [] }, term.text, 'social', null, [], state.topic);
    }
    if (unknown && !unknown.appendTo?.length) {
      reason = `Сведений нет: ${unknown.label}`;
      return answerUnknown({ ...state, pending: null }, unknown, input);
    }

    // Смысловые ограничения действуют до приоритетных примеров пакета.
    if (frame.currentPump || frame.responsibility || frame.mixedModes) {
      reason = 'Недостаточно исходных данных / уточнение времени';
      const text = frame.currentPump
        ? 'Способ управления существующим насосом у меня не уточнён. Это нужно проверить на объекте; требование к будущему управлению обсудим отдельно.'
        : frame.responsibility
          ? 'Предложите подходящее оборудование по требованиям и согласуйте с нами. Точное распределение ответственности у меня не определено.'
          : 'Вы спрашиваете, как узел работает сейчас, или какие режимы предусмотреть после автоматизации?';
      const built = finish({ ...state, pending: null, topic: frame.currentPump ? 'pump' : null, lastFactIds: [], lastIntentId: null }, text, frame.mixedModes ? 'clarify' : 'unknown_found', null, [], frame.currentPump ? 'pump' : null);
      if (frame.mixedModes) return built;
      const kind = frame.currentPump ? 'survey' : 'undefined';
      const label = frame.currentPump ? 'Как сейчас управляется насос' : 'Кто выбирает оборудование';
      const category = frame.currentPump ? 'actuators' : 'reliability';
      return { ...built, reply: { ...built.reply, uncertainty: { id: frame.currentPump ? 'pump_control_now' : 'responsibility', kind, label, category } } };
    }
    if (frame.powerLoss) return framedAnswer('valve_fail_power');
    if (frame.dryRun) return framedAnswer('press_in_run');
    if (frame.noFlowInterlock) return framedAnswer('flow_low_action');
    if (frame.pressControl) return framedAnswer('pump_control');
    if (frame.currentOperation && !analysis.numbers.length) return framedAnswer('purpose_current');
    if (frame.inventory || frame.composition) {
      const result = framedAnswer('object_desc');
      if (!frame.inventory || (frame.aspect && scenario.aspectReplies?.object_desc?.[frame.aspect])) return result;
      return { ...result, reply: { ...result.reply, text: `${result.reply.text} Полный перечень установленных приборов и исполнительных устройств нужно уточнить на объекте.` } };
    }
    if (frame.monitorFuture) return framedAnswer('hmi_main');
    if (frame.goal) return framedAnswer('purpose_goal');

    // Числовое утверждение — только при явной проверке: «значит…», «правильно понял…» или короткое «60 градусов?».
    // Число в вопросе («отклонение от 60 °C?») и варианты («4–20 мА или 0–10 В?») — это контекст, а не утверждение.
    const fullNormalized = normalizeText(input.text);
    // «70? 75?», «4–20 мА или 0–10 В?» — варианты, а не утверждение.
    const alternatives = analysis.numbers.length >= 2 && (/(^|\s)или(\s|$)/.test(analysis.normalized) || (input.text.match(/\?/g) ?? []).length >= 2);
    const shortCheck = /\?\s*$/.test(questionText) && analysis.tokens.length <= 5 && !INTERROGATIVE.test(analysis.normalized);
    const isClaim =
      analysis.numbers.length > 0 &&
      !alternatives &&
      !concepts.has('propose') &&
      !concepts.has('mandatoryw') &&
      ((CLAIM_CUE.test(` ${fullNormalized} `) && !INTERROGATIVE.test(analysis.normalized)) || shortCheck);
    if (isClaim) {
      const claimResult = answerClaim(state, checkClaim(concepts, unitHinted(analysis.numbers, concepts), scenario, ctxFacts, state.disclosed, true), input, scenario);
      if (claimResult) { reason = 'Проверка числового утверждения'; return claimResult; }
    }

    if (rawIsService && rawTop.intent.kind === 'social') {
      reason = 'Социальная реплика'; score = rawTop.score;
      // «Нам нужно сделать ТЗ» — студент о своей задаче: заказчик готов отвечать.
      const intent = concepts.has('weNeed') && concepts.has('tzword') ? scenario.intents.find((item) => item.id === 'greeting') ?? rawTop.intent : rawTop.intent;
      return answerIntent({ ...state, pending: null }, intent, input, scenario, false, question);
    }
    if (concepts.has('weNeed') && concepts.has('tzword') && analysis.tokens.length <= 8) {
      reason = 'Студент о своей задаче';
      return answerIntent({ ...state, pending: null }, scenario.intents.find((item) => item.id === 'greeting')!, input, scenario, false, question);
    }

    // Паспортный блок: несколько значений одного устройства, о которых спросили прямо.
    // Широкий вопрос о паспорте («какие характеристики?», «что по насосу?», «расскажите про теплообменник») — блок.
    // В разговоре об аварии «что с насосом в этот момент?» — это реакция системы, а не паспорт.
    const group = specGroupFor(scenario, concepts, ctx.topic, ownSubject);
    const specCue = SPEC_CUE.test(` ${analysis.normalized} `) && !(concepts.has('reaction') && !(group && ctx.topic && group.topics.includes(ctx.topic)) && Boolean(ctx.topic));
    if (group) {
      const explicit = explicitSpecItems(group, concepts);
      if (explicit.length >= 2) { reason = `Паспорт: ${group.title}, несколько значений`; return answerSpec(state, group, input, scenario, explicit); }
      if (specCue && explicit.length === 0) { reason = `Паспорт: ${group.title}`; return answerSpec(state, group, input, scenario, null); }
    }
    const asSpec = (intent: Intent): Built | null => {
      const spec = (scenario.specGroups ?? []).find((item) => item.intentId === intent.id);
      if (!spec || !specCue) return null;
      reason = `Паспорт: ${spec.title}`;
      return answerSpec(state, spec, input, scenario, null);
    };

    // Вопрос почти дословно совпадает с вопросом из файла преподавателя — отвечаем этой темой.
    const priority = matchByExample(analysis, scenario, { priority: true, min: 0.6 });
    if (priority) {
      reason = 'Вопрос из пакета ответов (сходство)';
      score = priority.similarity;
      const chosen = priority.intent;
      if (chosen.kind === 'meta') return answerMeta(state, chosen, input, scenario, ctxFacts, ctxIntent);
      return asSpec(chosen) ?? answerIntent({ ...state, pending: null }, chosen, input, scenario, REMINDER_CUE.test(analysis.normalized), question);
    }

    const ranked = rankIntents(analysis, ctx, scenario);
    const top = ranked[0];
    score = top?.score ?? null;
    const topIsStrong = top && top.score >= MIN_INTENT_SCORE;

    // Служебные реплики и уточнения не требуют разбора неоднозначности.
    if (topIsStrong && (top.intent.kind === 'social' || top.intent.kind === 'meta') && top.score >= 3) {
      if (top.intent.kind === 'meta') return answerMeta(state, top.intent, input, scenario, ctxFacts, ctxIntent);
      return answerIntent({ ...state, pending: null }, top.intent, input, scenario, false, question);
    }

    // Неоднозначный предмет — встречный вопрос вместо угадывания.
    const ambiguity = findAmbiguity(fullAnalysis, ctx, scenario);
    if (ambiguity) { reason = `Неоднозначность: ${ambiguity.id}`; return answerAmbiguity(state, ambiguity, analysis, input); }

    // Правила ничего не нашли: пробуем самый похожий пример формулировки.
    if (!topIsStrong) {
      const similar = matchByExample(analysis, scenario, { priority: false, min: 0.5 });
      if (similar && similar.intent.kind !== 'meta') {
        reason = 'Пример сценария (сходство)'; score = similar.similarity;
        return asSpec(similar.intent) ?? answerIntent({ ...state, pending: null }, similar.intent, input, scenario, false, question);
      }
      // «А летом?» без предмета в разговоре: переспрашиваем, а не отвечаем, что мы говорим о разном.
      const fragment = /^(?:а |и )?(летом|зимой|после насоса|до насоса|на входе|на выходе)$/.exec(analysis.normalized);
      if (fragment) {
        reason = 'Обрывочный вопрос без предмета';
        const picked = pickVariant(state, input.seed, 'meta:needSubject', scenario.meta.needSubject);
        const text = fillTemplate(picked.text, { piece: fragment[1] });
        return finish(bump({ ...picked.state, pending: null }, 'clarifications'), text, 'clarify', null, [], state.topic);
      }
      reason = Object.keys(SUBJECT_LABEL).some((c) => analysis.concepts.has(c)) ? 'Непонятый вопрос: уточнение по предмету' : 'Нет подходящего правила или примера';
      return answerMiss(state, analysis, input, scenario);
    }

    const specAnswer = asSpec(top.intent);
    if (specAnswer) return specAnswer;
    const reminder = REMINDER_CUE.test(analysis.normalized);
    const result = answerIntent(state, top.intent, input, scenario, reminder, question);

    // Второй предмет в одном предложении с «и» — мягко предложить спросить следом, только если это действительно другая тема.
    const subjects = scenario.subjectConcepts.filter((concept) => analysis.concepts.has(concept));
    const second = ranked.find(
      (item) =>
        item.intent.topic !== top.intent.topic &&
        !item.viaContext &&
        (item.intent.kind === 'fact' || item.intent.kind === 'unknown') &&
        item.score >= top.score - 1.5,
    );
    const joined = subjects.length >= 2 && Boolean(second) && /(^|\s)и(\s|$)/.test(analysis.normalized);
    if (joined && result.reply.quality === 'useful') return withMulti(result);
    return result;
  };

  /** Вторая часть сообщения о другом: заказчик предлагает спросить следом (или сразу честно говорит о неизвестном). */
  const withMulti = (result: Built): Built => {
    const picked = pickVariant(result.state, input.seed, 'meta:multi', scenario.meta.multiQuestion);
    return { state: picked.state, reply: { ...result.reply, text: `${result.reply.text} ${picked.text}` } };
  };

  const routed = route();
  let result = unknown?.appendTo?.length ? withUnknown(routed) : routed;
  if (severalQuestions && result.reply.quality !== 'general') {
    const tail = analyze(questionParts.slice(1).join(' '), scenario);
    const tailUnknown = matchUnknown(tail, scenario, ctx.topic);
    const tailSubjects = scenario.subjectConcepts.filter((concept) => tail.concepts.has(concept));
    const sameSubject = tailSubjects.length === 0 || tailSubjects.every((concept) => concepts.has(concept));
    if (tailUnknown && tailUnknown.id !== unknown?.id) {
      const extra = answerUnknown(result.state, tailUnknown, input);
      result = { state: extra.state, reply: { ...result.reply, text: `${result.reply.text} ${extra.reply.text}`, uncertainty: result.reply.uncertainty ?? extra.reply.uncertainty } };
    } else if (!sameSubject && !tailUnknown) {
      result = withMulti(result);
    }
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
