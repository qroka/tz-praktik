// Распознавание намерений: понятия из словаря, обязательные группы, веса, контекст, неоднозначность.
import type { Ambiguity, Intent, Scenario } from '../types';
import { extractNumbers, fuzzyStartsWith, normalizeText, stem, tokenize, type ParsedNumber } from './normalizeText';

import { detectQuestionFrame, frameAllows, type QuestionFrame } from './questionFrame';

export type Analysis = {
  frame: QuestionFrame;
  normalized: string;
  tokens: string[];
  stems: string[];
  concepts: Set<string>;
  numbers: ParsedNumber[];
};

export type MatchContext = {
  topic: string | null;
  lastAttributes: string[];
  extraConcepts?: string[];
};

export type RankedIntent = { intent: Intent; score: number; viaContext: boolean };

type CompiledLexeme = { concept: string; parts: { text: string; exact: boolean }[] };

const FUNCTION_WORDS = new Set(['до', 'за', 'на', 'из', 'в', 'с', 'по', 'при', 'и', 'а', 'к', 'от', 'у', 'о', 'как', 'что']);
const lexiconCache = new WeakMap<object, CompiledLexeme[]>();

function compileLexicon(lexicon: Record<string, string[]>): CompiledLexeme[] {
  const cached = lexiconCache.get(lexicon);
  if (cached) return cached;
  const compiled: CompiledLexeme[] = [];
  for (const [concept, entries] of Object.entries(lexicon)) {
    for (const entry of entries) {
      compiled.push({
        concept,
        parts: entry.split(' ').map((part) => ({
          text: part.startsWith('=') ? part.slice(1) : part,
          exact: part.startsWith('=') || (entry.includes(' ') && FUNCTION_WORDS.has(part)),
        })),
      });
    }
  }
  lexiconCache.set(lexicon, compiled);
  return compiled;
}

function tokenMatches(token: string, part: { text: string; exact: boolean }): boolean {
  // «теперь» отличается от начала «температура» одной буквой, но не является опечаткой.
  if (part.exact) return token === part.text;
  if (token === 'теперь' || part.text.startsWith('автоматич')) return token.startsWith(part.text);
  return fuzzyStartsWith(token, part.text);
}

/** Выделяет понятия. Лексема из нескольких слов ищется как последовательность. */
export function extractConcepts(tokens: string[], lexicon: Record<string, string[]>): Set<string> {
  const concepts = new Set<string>();
  for (const lexeme of compileLexicon(lexicon)) {
    if (concepts.has(lexeme.concept)) continue;
    const { parts } = lexeme;
    for (let start = 0; start <= tokens.length - parts.length; start++) {
      if (parts.every((part, offset) => tokenMatches(tokens[start + offset], part))) {
        concepts.add(lexeme.concept);
        break;
      }
    }
  }
  return concepts;
}

export function analyze(text: string, scenario: Scenario): Analysis {
  const normalized = normalizeText(text);
  const tokens = tokenize(normalized);
  const concepts = extractConcepts(tokens, scenario.lexicon);
  for (const [phrase, dropped] of Object.entries(scenario.conceptSuppress ?? {})) {
    if (concepts.has(phrase)) dropped.forEach((concept) => concepts.delete(concept));
  }
  return {
    frame: detectQuestionFrame(normalized, concepts),
    normalized,
    tokens,
    stems: tokens.map(stem),
    concepts,
    numbers: extractNumbers(normalized),
  };
}

const STOP_STEMS = new Set(['как', 'что', 'это', 'для', 'при', 'вы', 'нас', 'мне', 'какой', 'у', 'в', 'на', 'и', 'а', 'по', 'с', 'до', 'ли', 'же', 'не']);

const exampleCache = new WeakMap<object, Map<string, Set<string>[]>>();

function exampleStems(intent: Intent, scenario: Scenario): Set<string>[] {
  let byIntent = exampleCache.get(scenario);
  if (!byIntent) {
    byIntent = new Map();
    exampleCache.set(scenario, byIntent);
  }
  let stems = byIntent.get(intent.id);
  if (!stems) {
    stems = intent.examples.map((example) => new Set(tokenize(normalizeText(example)).map(stem).filter((s) => !STOP_STEMS.has(s))));
    byIntent.set(intent.id, stems);
  }
  return stems;
}

const EXAMPLE_QUALIFIERS = new Set(['warning', 'alarm', 'low', 'tolerance', 'reaction', 'limit', 'start', 'loss', 'winter', 'summer', 'powerkw']);
const OPPOSITES = [['beforePump', 'afterPump'], ['winter', 'summer'], ['warning', 'alarm']];

const textStemCache = new Map<string, Set<string>>();

function textStems(text: string): Set<string> {
  let stems = textStemCache.get(text);
  if (!stems) {
    stems = new Set(tokenize(normalizeText(text)).map(stem).filter((s) => !STOP_STEMS.has(s)));
    textStemCache.set(text, stems);
  }
  return stems;
}

/**
 * Ищет намерение по сходству вопроса с примерами формулировок.
 * priority — только вопросы, добавленные преподавателем в файле ответов.
 */
export function matchByExample(
  analysis: Analysis,
  scenario: Scenario,
  options: { priority: boolean; min: number },
): { intent: Intent; similarity: number } | null {
  const query = new Set(analysis.stems.filter((s) => !STOP_STEMS.has(s)));
  if (!query.size) return null;
  let best: { intent: Intent; similarity: number } | null = null;
  for (const intent of scenario.intents) {
    if (!frameAllows(intent, analysis.frame, analysis.concepts)) continue;
    if (intent.exclude?.some((concept) => analysis.concepts.has(concept))) continue;
    if (intent.required.some(group => group.every(c => EXAMPLE_QUALIFIERS.has(c)) && !group.some(c => analysis.concepts.has(c)))) continue;
    const examples = options.priority ? intent.priorityExamples ?? [] : intent.examples;
    for (const example of examples) {
      const value = similarity(query, textStems(example));
      if (value < options.min || (best && value <= best.similarity)) continue;
      const other = analyze(example, scenario);
      if (intent.id === 'flow_display' && !analysis.concepts.has('flow')) continue;
      if (analysis.frame.current && other.frame.future || analysis.frame.future && other.frame.current) continue;
      if (OPPOSITES.some(([a, b]) => analysis.concepts.has(a) && other.concepts.has(b) || analysis.concepts.has(b) && other.concepts.has(a))) continue;
      // A short fragment needs a real subject from context, not a matching example.
      if (!scenario.subjectConcepts.some((c) => analysis.concepts.has(c)) && /^(а )?(летом|зимой|после насоса|до насоса)$/.test(analysis.normalized)) continue;
      best = { intent, similarity: value };
    }
  }
  return best;
}

function similarity(query: Set<string>, example: Set<string>): number {
  if (!query.size || !example.size) return 0;
  let common = 0;
  for (const item of query) if (example.has(item)) common++;
  return common / (query.size + example.size - common);
}

/** Какие понятия подставить из темы разговора: только если в вопросе нет своего предмета. */
export function contextConcepts(analysis: Analysis, ctx: MatchContext, scenario: Scenario): Set<string> {
  const carried = new Set<string>();
  const allowed = ctx.topic ? scenario.topics[ctx.topic]?.subjects ?? [] : [];
  const hasSubject = scenario.subjectConcepts.some((concept) => analysis.concepts.has(concept) && !allowed.includes(concept));
  // Спорное понятие в подходящей теме («а максимальное давление?» после теплоносителя) тоже берёт контекст темы.
  const resolvedByTopic = scenario.ambiguities.some(
    (ambiguity) =>
      ctx.topic && ambiguity.contextTopics.includes(ctx.topic) && ambiguity.trigger.some((concept) => analysis.concepts.has(concept)),
  );
  if ((!hasSubject || resolvedByTopic) && ctx.topic) {
    for (const concept of scenario.topics[ctx.topic]?.concepts ?? []) carried.add(concept);
  }
  // Короткий вопрос без признака («а по давлению после насоса?») наследует признак предыдущего.
  const hasAttribute = scenario.attributeConcepts.some((concept) => analysis.concepts.has(concept));
  if (!hasSubject && !hasAttribute && analysis.tokens.length <= 6) {
    for (const concept of ctx.lastAttributes) carried.add(concept);
  }
  for (const [a, b] of [['beforePump', 'afterPump'], ['beforeAny', 'afterAny'], ['winter', 'summer']]) {
    if (analysis.concepts.has(a)) carried.delete(b);
    if (analysis.concepts.has(b)) carried.delete(a);
  }
  return carried;
}

export function rankIntents(analysis: Analysis, ctx: MatchContext, scenario: Scenario): RankedIntent[] {
  const extra = new Set(ctx.extraConcepts ?? []);
  const concepts = new Set([...analysis.concepts, ...extra]);
  const merged: Analysis = { ...analysis, concepts };
  const carried = contextConcepts(merged, ctx, scenario);
  const queryStems = new Set(analysis.stems.filter((s) => !STOP_STEMS.has(s)));
  const ranked: RankedIntent[] = [];

  for (const intent of scenario.intents) {
    if (!frameAllows(intent, analysis.frame, concepts)) continue;
    if (['temp_inlet_winter', 'temp_inlet_summer'].includes(intent.id) && !concepts.has('temp') && !concepts.has('inlet') && ctx.topic !== 'inlet') continue;
    if (intent.exclude?.some((concept) => concepts.has(concept))) continue;
    if (intent.onlyInTopics && !(ctx.topic && intent.onlyInTopics.includes(ctx.topic))) continue;

    let score = intent.weight ?? 0;
    let viaContext = false;
    let satisfied = true;
    let direct = 0;
    const mentioned = new Set<string>(intent.optional ?? []);
    for (const group of intent.required) {
      group.forEach((concept) => mentioned.add(concept));
      if (group.some((concept) => concepts.has(concept))) {
        score += 3;
        direct++;
      }
      else if (group.some((concept) => carried.has(concept))) {
        score += 1.4;
        viaContext = true;
      } else {
        satisfied = false;
        break;
      }
    }
    // Хотя бы один признак должен быть в самом вопросе: одна тема разговора ответа не вызывает.
    if (!satisfied || direct === 0) continue;

    for (const concept of intent.optional ?? []) if (concepts.has(concept)) score += 0.7;
    // Лишний предмет в вопросе говорит о том, что спрашивают о другом.
    for (const concept of scenario.subjectConcepts) {
      if (concepts.has(concept) && !mentioned.has(concept)) score -= 1.6;
    }
    // Несовпавший признак (предупреждение, авария, допуск) — тоже штраф.
    for (const concept of scenario.attributeConcepts) {
      if (concepts.has(concept) && !mentioned.has(concept)) score -= 1.2;
    }

    let best = 0;
    for (const example of exampleStems(intent, scenario)) best = Math.max(best, similarity(queryStems, example));
    score += best * 3;
    if (ctx.topic && intent.topic === ctx.topic) score += 0.5;

    ranked.push({ intent, score, viaContext });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** Неоднозначность: в вопросе есть спорное понятие и нет ничего, что его уточняет. */
export function findAmbiguity(analysis: Analysis, ctx: MatchContext, scenario: Scenario): Ambiguity | null {
  const concepts = new Set([...analysis.concepts, ...(ctx.extraConcepts ?? [])]);
  for (const ambiguity of scenario.ambiguities) {
    if (!ambiguity.trigger.some((concept) => concepts.has(concept))) continue;
    if (ctx.topic && ambiguity.contextTopics.includes(ctx.topic) && !(ambiguity.id === 'pressure' && concepts.has('low') && ['hc', 'hc_press'].includes(ctx.topic))) continue;
    const allowed = new Set([...ambiguity.trigger, ...ambiguity.neutral]);
    const hasResolver = [...concepts].some((concept) => !allowed.has(concept));
    if (!hasResolver) return ambiguity;
  }
  return null;
}

export const MIN_INTENT_SCORE = 2.5;

/** Лучшее намерение или null, если сильных совпадений нет. */
export function matchIntent(text: string, ctx: MatchContext, scenario: Scenario): RankedIntent | null {
  const analysis = analyze(text, scenario);
  const [top] = rankIntents(analysis, ctx, scenario);
  return top && top.score >= MIN_INTENT_SCORE ? top : null;
}
