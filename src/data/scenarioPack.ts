// Сборка учебного сценария из файла scenariy.json (формат tz-praktikum-scenario).
// Файл готовит преподаватель вместе с ChatGPT по промту docs/prompt-novyj-scenarij.md.
// Движок не меняется: сценарий собирается из тех же структур, что и встроенный кейс.
import type {
  Ambiguity, Category, Confidence, DisclosureLevel, FactClaim, Intent, MetaReplies, ReplyStep, RequirementType, Scenario, ScenarioFact,
  TopicContext, UncertaintyKind, UnknownTopic, Unit,
} from '../types';
import { normalizeText, tokenize } from '../engine/normalizeText';
import { intents as baseIntents, lexicon as baseLexicon } from './intents';
import { meta as baseMeta, replies as baseReplies } from './responses';
import { categories as baseCategories, tzSections } from './scenario';

export const PACK_FORMAT = 'tz-praktikum-scenario';

export type PackFact = {
  id: string;
  category: string;
  section: number;
  label: string;
  value: string;
  numbers?: number[];
  unit?: string;
  keywords?: string[];
  disclosureLevel?: DisclosureLevel;
  prerequisites?: string[];
  customerConfidence?: Confidence;
  requirementType?: RequirementType;
  unknownKind?: UncertaintyKind | null;
  isReaction?: boolean;
  questions: string[];
  replies: string[];
  repeat?: string[];
};

export type ScenarioPack = {
  format: string;
  version: number;
  scenario: {
    id: string;
    title: string;
    subtitle: string;
    publicBrief: string;
    customer: { name: string; role: string; initials: string };
    estimatedMinutes?: number;
    greeting: string[];
  };
  categories?: { id: string; title?: string; direction?: string }[];
  facts: PackFact[];
  generalQuestions?: { questions: string[]; replies: string[]; facts?: string[] }[];
  clarifyingQuestions?: { word: string; meaning?: string; questions: string[] }[];
  commonMistakes?: string[];
  glossary?: { term: string; text: string }[];
  fallback?: string[];
};

export type BuildReport = { errors: string[]; warnings: string[] };

const UNIT_MAP: Record<string, Unit> = {
  '°c': 'c', '°с': 'c', c: 'c', с: 'c', градус: 'c', градусов: 'c',
  мпа: 'mpa', 'м3/ч': 'm3h', 'м³/ч': 'm3h', квт: 'kw', гц: 'hz', в: 'v', вольт: 'v',
  сек: 's', секунд: 's', м: 'm', dn: 'dn', '%': 'percent', ip: 'ip',
};

/** Служебные намерения берутся из встроенного кейса: приветствие, «что ещё?», «повторите» и т. п. */
const SERVICE_IDS = [
  'greeting', 'thanks', 'farewell', 'who_are_you', 'are_you_bot', 'write_for_me', 'money_time', 'proposal',
  'followup_more', 'followup_precise', 'is_mandatory', 'followup_why', 'repeat_last',
];
const SERVICE_CONCEPTS = [
  'greet', 'thanks', 'bye', 'who', 'bot', 'tzword', 'writeit', 'weNeed', 'money', 'propose', 'more', 'precise', 'mandatoryw', 'why', 'repeatw',
];

const CATEGORY_IDS = baseCategories.map((c) => c.id);
const clean = (list: unknown): string[] => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Основа ключевого слова: нижний регистр, ё → е. Короткие слова сравниваются целиком. */
function keywordEntry(word: string): string | null {
  const normalized = normalizeText(word).trim();
  if (!normalized) return null;
  return normalized.length <= 3 && !normalized.includes(' ') ? `=${normalized}` : normalized;
}

/** Ключевые слова из названия, если ChatGPT их не дал: основы длинных слов. */
function keywordsFromLabel(label: string): string[] {
  return tokenize(normalizeText(label)).filter((word) => word.length >= 5).map((word) => word.slice(0, Math.max(5, word.length - 2)));
}

export function validatePack(raw: unknown): BuildReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(raw)) return { errors: ['Файл не похож на сценарий: ожидается объект JSON.'], warnings };
  if (raw.format !== PACK_FORMAT) errors.push(`Поле format должно быть "${PACK_FORMAT}".`);
  const head = raw.scenario;
  if (!isObject(head)) errors.push('Нет блока scenario.');
  else {
    for (const key of ['id', 'title', 'subtitle', 'publicBrief']) if (typeof head[key] !== 'string' || !String(head[key]).trim()) errors.push(`scenario.${key}: нужна непустая строка.`);
    if (typeof head.id === 'string' && !/^[a-z0-9-]+$/.test(head.id)) errors.push('scenario.id: только строчные латинские буквы, цифры и дефис.');
    const customer = head.customer;
    if (!isObject(customer) || !customer.name || !customer.role || !customer.initials) errors.push('scenario.customer: нужны name, role, initials.');
    if (clean(head.greeting).length < 1) errors.push('scenario.greeting: нужна хотя бы одна реплика.');
  }
  const facts = Array.isArray(raw.facts) ? (raw.facts as PackFact[]) : [];
  if (!facts.length) errors.push('Нет списка facts.');
  const ids = new Set<string>();
  const known = new Set(facts.map((f) => f?.id));
  const categorySet = new Set(CATEGORY_IDS);
  facts.forEach((fact, index) => {
    const where = `facts[${index}]${fact?.id ? ` (${fact.id})` : ''}`;
    if (!isObject(fact)) return void errors.push(`${where}: ожидается объект.`);
    if (typeof fact.id !== 'string' || !/^[a-z0-9_]+$/.test(fact.id)) errors.push(`${where}: id — латиница, цифры, подчёркивание.`);
    else if (ids.has(fact.id)) errors.push(`${where}: id повторяется.`);
    else ids.add(fact.id);
    if (!categorySet.has(fact.category)) errors.push(`${where}: категория "${fact.category}" не из списка (${CATEGORY_IDS.join(', ')}).`);
    if (!Number.isInteger(fact.section) || fact.section < 1 || fact.section > 13) errors.push(`${where}: section — число от 1 до 13.`);
    if (!fact.label || !fact.value) errors.push(`${where}: нужны label и value.`);
    if (clean(fact.questions).length < 2) errors.push(`${where}: нужно не меньше 2 формулировок вопроса (рекомендуется 3–5).`);
    if (clean(fact.replies).length < 1) errors.push(`${where}: нужен хотя бы один вариант ответа.`);
    else if (clean(fact.replies).length < 3) warnings.push(`${where}: вариантов ответа меньше трёх.`);
    if (fact.disclosureLevel && !['general', 'specific', 'followup'].includes(fact.disclosureLevel)) errors.push(`${where}: disclosureLevel — general, specific или followup.`);
    if (fact.customerConfidence && !['certain', 'approximate', 'unknown'].includes(fact.customerConfidence)) errors.push(`${where}: customerConfidence — certain, approximate или unknown.`);
    if (fact.requirementType && !['mandatory', 'preference', 'proposal'].includes(fact.requirementType)) errors.push(`${where}: requirementType — mandatory, preference или proposal.`);
    for (const id of fact.prerequisites ?? []) if (!known.has(id)) errors.push(`${where}: предпосылка "${id}" не найдена среди сведений.`);
    if (fact.disclosureLevel === 'followup' && !fact.prerequisites?.length) errors.push(`${where}: для followup укажите prerequisites.`);
    if (fact.customerConfidence === 'unknown' && !fact.unknownKind) warnings.push(`${where}: для «не знает» не указан unknownKind (survey, undefined или designer).`);
    if (fact.unknownKind && !['survey', 'undefined', 'designer'].includes(fact.unknownKind)) errors.push(`${where}: unknownKind — survey, undefined или designer.`);
    if (!clean(fact.keywords).length) warnings.push(`${where}: нет keywords, ключевые слова взяты из названия.`);
    for (const number of fact.numbers ?? []) {
      const text = String(number).replace('.', ',');
      const missing = clean(fact.replies).filter((reply) => !reply.includes(String(number)) && !reply.includes(text));
      if (missing.length) warnings.push(`${where}: число ${number} не встречается в ${missing.length} из ${fact.replies.length} ответов.`);
    }
  });
  const covered = new Set(facts.map((f) => f?.category));
  for (const id of CATEGORY_IDS) if (!covered.has(id)) warnings.push(`Категория "${id}": нет ни одного сведения.`);
  const sections = new Set(facts.map((f) => f?.section));
  for (const section of tzSections) if (!sections.has(section.id)) warnings.push(`Раздел ТЗ ${section.id}: нет ни одного сведения.`);
  const questions = facts.flatMap((f) => clean(f?.questions)).length;
  if (facts.length < 30) warnings.push(`Сведений ${facts.length}: для хорошего диалога нужно 45–55.`);
  if (questions < 100) warnings.push(`Формулировок вопросов ${questions}: рекомендуется не меньше 120.`);
  const general = Array.isArray(raw.generalQuestions) ? (raw.generalQuestions as NonNullable<ScenarioPack['generalQuestions']>) : [];
  general.forEach((entry, index) => {
    if (clean(entry.questions).length < 1 || clean(entry.replies).length < 1) errors.push(`generalQuestions[${index}]: нужны questions и replies.`);
    for (const id of entry.facts ?? []) {
      const fact = facts.find((f) => f.id === id);
      if (!fact) errors.push(`generalQuestions[${index}]: сведение "${id}" не найдено.`);
      else if ((fact.disclosureLevel ?? 'specific') !== 'general') errors.push(`generalQuestions[${index}]: "${id}" не уровня general: общим вопросом раскрываются только такие.`);
    }
    if ((entry.facts?.length ?? 0) > 3) errors.push(`generalQuestions[${index}]: больше трёх сведений в одном ответе.`);
  });
  if (!clean(raw.fallback).length) warnings.push('Нет fallback: будут стандартные реплики «не понял».');
  return { errors, warnings };
}

const step = (facts: string[], variants: string[], short: string[]): ReplyStep => ({ facts, variants, short });

export function buildScenarioFromPack(pack: ScenarioPack): { scenario: Scenario; report: BuildReport } {
  const report = validatePack(pack);
  const head = pack.scenario;
  const customer = head.customer;
  const factList = (pack.facts ?? []).filter((f) => f && typeof f.id === 'string');
  const concept = (id: string) => `k_${id}`;

  // Категории: направления берутся из файла, названия и порядок — стандартные.
  const given = new Map((pack.categories ?? []).map((c) => [c.id, c]));
  const categories: Category[] = baseCategories.map((c) => ({
    id: c.id,
    title: given.get(c.id)?.title?.trim() || c.title,
    direction: given.get(c.id)?.direction?.trim() || c.direction,
  }));

  const facts: ScenarioFact[] = factList.map((f) => {
    const unit = f.unit ? UNIT_MAP[f.unit.trim().toLowerCase()] : undefined;
    const claim: FactClaim | undefined = f.numbers?.length && unit
      ? { unit, values: f.numbers, range: f.numbers.length === 2 && /[–—-]\s*\d/.test(f.value) ? true : undefined, concepts: [[concept(f.id)]], display: f.value.replace(/\.$/, '') }
      : undefined;
    return {
      id: f.id,
      category: f.category,
      value: f.value,
      aliases: [],
      disclosureLevel: f.disclosureLevel ?? 'specific',
      prerequisites: f.prerequisites?.length ? f.prerequisites : undefined,
      customerConfidence: f.customerConfidence ?? 'certain',
      requirementType: f.requirementType ?? (f.customerConfidence === 'unknown' ? 'proposal' : 'mandatory'),
      label: f.label,
      section: f.section,
      numbers: f.numbers?.length ? f.numbers : undefined,
      claim,
      isReaction: f.isReaction || undefined,
    };
  });
  // Признаки факта в тексте ТЗ: основы ключевых слов; цифры проверяются отдельно по numbers.
  facts.forEach((fact, i) => {
    const words = clean(factList[i].keywords).map((k) => normalizeText(k).trim()).filter(Boolean);
    fact.aliases = (words.length ? words : keywordsFromLabel(fact.label)).slice(0, 8);
  });

  const lexicon: Record<string, string[]> = {};
  for (const name of SERVICE_CONCEPTS) lexicon[name] = baseLexicon[name] ?? [];
  const subjectConcepts: string[] = [];
  for (const f of factList) {
    const entries = clean(f.keywords).map(keywordEntry).filter((x): x is string => Boolean(x));
    const fallback = keywordsFromLabel(f.label).map(keywordEntry).filter((x): x is string => Boolean(x));
    lexicon[concept(f.id)] = entries.length ? entries : fallback;
    subjectConcepts.push(concept(f.id));
  }

  const intents: Intent[] = [];
  const replies: Record<string, ReplyStep[]> = {};
  const topics: Record<string, TopicContext> = {};
  for (const c of categories) topics[c.id] = { concepts: [] };

  for (const f of factList) {
    const questions = clean(f.questions);
    const answers = clean(f.replies);
    const isUnknown = (f.customerConfidence ?? 'certain') === 'unknown';
    intents.push({
      id: f.id,
      title: f.label,
      kind: isUnknown ? 'unknown' : 'fact',
      topic: f.category,
      required: [[concept(f.id)]],
      examples: questions,
      priorityExamples: questions,
    });
    replies[f.id] = [step([f.id], answers, clean(f.repeat).length ? clean(f.repeat) : answers.slice(0, 2))];
  }

  (pack.generalQuestions ?? []).forEach((entry, index) => {
    const id = `general_${index + 1}`;
    const questions = clean(entry.questions);
    intents.push({ id, title: questions[0] ?? id, kind: 'general', topic: 'misc', required: [], examples: questions, priorityExamples: questions });
    replies[id] = [step(entry.facts ?? [], clean(entry.replies), clean(entry.replies).slice(0, 2))];
  });

  // Служебные реплики: общие для любого кейса, кроме «Кто вы?».
  for (const id of SERVICE_IDS) {
    const base = baseIntents.find((i) => i.id === id);
    if (!base) continue;
    intents.push({ ...base, exclude: undefined });
    replies[id] = baseReplies[id] ?? [];
  }
  replies.who_are_you = [
    step([], [
      `${customer.name}, ${customer.role}. Спрашивайте, отвечу, что знаю.`,
      `Меня зовут ${customer.name}, я ${customer.role}. По объекту знаю многое, но автоматику не проектирую.`,
    ], [`${customer.name}.`, 'Я заказчик, как и говорил.']),
  ];

  // Встречные вопросы на неоднозначные слова.
  const ambiguities: Ambiguity[] = (pack.clarifyingQuestions ?? []).map((item, index) => {
    const word = normalizeText(item.word).trim();
    const trigger = `amb_${index + 1}`;
    lexicon[trigger] = [keywordEntry(item.word) ?? word];
    // Понятия сведений, чьи ключевые слова — это само спорное слово: они не снимают неоднозначность.
    const neutral = factList
      .filter((f) => (lexicon[concept(f.id)] ?? []).some((entry) => word.startsWith(entry.replace(/^=/, '')) || entry.replace(/^=/, '').startsWith(word)))
      .map((f) => concept(f.id));
    return { id: trigger, trigger: [trigger], neutral, contextTopics: [], questions: clean(item.questions), strictQuestions: clean(item.questions) };
  }).filter((a) => a.questions.length);

  // Сведения, которых заказчик не знает: честное «не знаю» с классом неизвестности.
  const unknownTopics: UnknownTopic[] = factList
    .filter((f) => (f.customerConfidence ?? 'certain') === 'unknown')
    .map((f) => ({
      id: f.id,
      kind: (f.unknownKind ?? 'designer') as UncertaintyKind,
      label: f.label,
      category: f.category,
      concepts: [[concept(f.id)]],
      replies: clean(f.replies),
    }));

  const fallback = clean(pack.fallback);
  const meta: MetaReplies = {
    ...baseMeta,
    fallback: fallback.length ? fallback : baseMeta.fallback.filter((x) => !/воду|насос|параметр/i.test(x)),
    fallbackStrict: fallback.length ? fallback : baseMeta.fallbackStrict,
    needSubject: ['Что именно «{piece}»? Назовите тему подробнее.', 'Это вы про что? С «{piece}» я пока не понял, о чём спрашиваете.', 'Уточните, пожалуйста: «{piece}» — по какому вопросу?'],
    fallbackSubject: undefined,
    specMore: undefined,
  };

  const warnAlarmFacts = factList.filter((f) => f.category === 'warning' || (f.category === 'protection' && !f.isReaction)).map((f) => f.id);
  const glossary = (pack.glossary ?? []).filter((g) => g.term && g.text).map((g, i) => ({ id: `gloss_${i + 1}`, pattern: normalizeText(g.term).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), text: g.text }));

  const scenario: Scenario = {
    id: head.id,
    title: head.title,
    subtitle: head.subtitle,
    publicBrief: head.publicBrief,
    customer: head.customer,
    estimatedMinutes: head.estimatedMinutes ?? 90,
    greeting: clean(head.greeting),
    categories,
    tzSections,
    facts,
    intents,
    replies,
    meta,
    lexicon,
    subjectConcepts,
    attributeConcepts: [],
    ambiguities,
    topics,
    unknownTopics,
    glossary,
    evaluation: { warnAlarmFacts, builtInMixups: false },
  };
  return { scenario, report };
}
