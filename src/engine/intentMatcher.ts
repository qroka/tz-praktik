// Распознавание намерений: понятия из словаря, обязательные группы, веса, контекст, неоднозначность.
import type { Ambiguity, Intent, Scenario } from '../types';
import { extractNumbers, fuzzyStartsWith, normalizeText, stem, tokenize, type ParsedNumber } from './normalizeText';

export type Analysis = {
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

const lexiconCache = new WeakMap<object, CompiledLexeme[]>();

/** Короткие основы, которые и внутри словосочетания остаются началом слова («сетев вод» — «сетевая вода»). */
const SHORT_STEMS = new Set(['вод']);

/** Обычные слова, которые из-за одной буквы похожи на термин («теперь» — «температура»). */
const NOT_A_TYPO = new Set(['теперь']);

function compileLexicon(lexicon: Record<string, string[]>): CompiledLexeme[] {
  const cached = lexiconCache.get(lexicon);
  if (cached) return cached;
  const compiled: CompiledLexeme[] = [];
  for (const [concept, entries] of Object.entries(lexicon)) {
    for (const entry of entries) {
      const words = entry.split(' ');
      compiled.push({
        concept,
        parts: words.map((part) => ({
          text: part.startsWith('=') ? part.slice(1) : part,
          // В словосочетании предлоги и короткие слова («в», «до», «как», «что») сравниваются целиком:
          // иначе «в теплообмен» находит «выходе теплообменника», а «как часто» — «какой частотник».
          exact: part.startsWith('=') || (words.length > 1 && part.length <= 3 && !SHORT_STEMS.has(part)),
        })),
      });
    }
  }
  lexiconCache.set(lexicon, compiled);
  return compiled;
}

function tokenMatches(token: string, part: { text: string; exact: boolean }, strict: boolean): boolean {
  if (part.exact) return token === part.text;
  return strict ? token.startsWith(part.text) : fuzzyStartsWith(token, part.text);
}

/**
 * Слово, которое словарь и так знает без опечаток, на опечатку не проверяем:
 * иначе «автоматизации» читается как «автоматический», а «предлагаете» — как «предел».
 */
function isKnownWord(token: string, lexemes: CompiledLexeme[]): boolean {
  if (NOT_A_TYPO.has(token)) return true;
  return lexemes.some((lexeme) =>
    lexeme.parts.some((part) => part.text.length >= 4 && (part.exact ? token === part.text : token.startsWith(part.text))),
  );
}

/** Выделяет понятия. Лексема из нескольких слов ищется как последовательность. */
export function extractConcepts(tokens: string[], lexicon: Record<string, string[]>): Set<string> {
  const concepts = new Set<string>();
  const lexemes = compileLexicon(lexicon);
  const strict = tokens.map((token) => isKnownWord(token, lexemes));
  for (const lexeme of lexemes) {
    if (concepts.has(lexeme.concept)) continue;
    const { parts } = lexeme;
    for (let start = 0; start <= tokens.length - parts.length; start++) {
      if (parts.every((part, offset) => tokenMatches(tokens[start + offset], part, strict[start + offset]))) {
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
  // Составные понятия: «как» + «сейчас» вместе значат вопрос о нынешнем порядке работы.
  for (const [combo, parts] of Object.entries(scenario.conceptCombos ?? {})) {
    if (parts.every((concept) => concepts.has(concept))) concepts.add(combo);
  }
  return {
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
    const examples = options.priority ? intent.priorityExamples ?? [] : intent.examples;
    for (const example of examples) {
      const value = similarity(query, textStems(example));
      if (value >= options.min && (!best || value > best.similarity)) best = { intent, similarity: value };
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

const ELLIPSIS_START = new Set(['а', 'и', 'ну', 'тогда']);

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
  // Полный вопрос («Какое давление воды до насоса?») признак не наследует — только обрывочное уточнение.
  const elliptical = analysis.tokens.length <= 3 || ELLIPSIS_START.has(analysis.tokens[0]);
  if (!hasAttribute && elliptical && analysis.tokens.length <= 6) {
    for (const concept of ctx.lastAttributes) carried.add(concept);
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
  const topicConcepts = new Set((ctx.topic ? scenario.topics[ctx.topic]?.concepts ?? [] : []).filter((concept) => carried.has(concept)));

  for (const intent of scenario.intents) {
    if (intent.exclude?.some((concept) => concepts.has(concept))) continue;
    if (intent.onlyInTopics && !(ctx.topic && intent.onlyInTopics.includes(ctx.topic))) continue;

    let score = intent.weight ?? 0;
    let viaContext = false;
    let viaTopic = false;
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
        if (group.some((concept) => topicConcepts.has(concept))) viaTopic = true;
      } else {
        satisfied = false;
        break;
      }
    }
    // Хотя бы один признак должен быть в самом вопросе: одна тема разговора ответа не вызывает.
    if (!satisfied || direct === 0) continue;
    // Вопрос достроен только унаследованным признаком, а намерение с темой разговора несовместимо:
    // «а температура?» после максимального давления теплоносителя — не про аварийную температуру воды.
    if (viaContext && !viaTopic && intent.exclude?.some((concept) => topicConcepts.has(concept) && scenario.subjectConcepts.includes(concept))) continue;

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
    if (ctx.topic && ambiguity.contextTopics.includes(ctx.topic)) continue;
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
