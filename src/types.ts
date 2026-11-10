// Общие типы сценария, движка и попытки студента.

export type DisclosureLevel = 'general' | 'specific' | 'followup';
export type Confidence = 'certain' | 'approximate' | 'unknown';
export type RequirementType = 'mandatory' | 'preference' | 'proposal';

/** Единицы, к которым приводятся числа при нормализации. */
export type Unit = 'c' | 'mpa' | 'm3h' | 'kw' | 'hz' | 'v' | 's' | 'm' | 'dn' | 'ip' | 'percent';

/**
 * Числовое значение факта, которое можно сверить с тем, что написал студент.
 * concepts — группы понятий (И из ИЛИ), по которым понятно, что речь именно об этом факте.
 */
export type FactClaim = {
  unit: Unit;
  values: number[];
  /** true — допустимо любое значение внутри [values[0]; values[1]]. */
  range?: boolean;
  concepts: string[][];
  /** Менее строгий признак только для сверки в диалоге: «значит, температура 65?». */
  looseConcepts?: string[][];
  display: string;
};

/** Скрытый факт предметной области. Первые восемь полей — контракт формата сценария. */
export type ScenarioFact = {
  id: string;
  category: string;
  value: string;
  /**
   * Признаки факта в тексте требования или ТЗ.
   * Каждый элемент — вариант; «клапан+закр+питан» значит: все основы в одном предложении.
   */
  aliases: string[];
  disclosureLevel: DisclosureLevel;
  prerequisites?: string[];
  customerConfidence: Confidence;
  requirementType: RequirementType;
  /** Короткое название в именительном падеже — для результатов и эталона. */
  label: string;
  /** Название в винительном падеже: «сначала уточните …». */
  askLabel?: string;
  /** Номер раздела ТЗ, где ожидается факт (1–13). */
  section: number;
  /** Числа, которые обязаны присутствовать рядом с признаками. */
  numbers?: number[];
  claim?: FactClaim;
  /** Факт описывает реакцию системы на аварию. */
  isReaction?: boolean;
};

export type Category = {
  id: string;
  title: string;
  /** Общее направление для учебного режима: что исследовать, без готового вопроса. */
  direction: string;
};

export type TzSection = {
  id: number;
  title: string;
  /** Что в разделе должно быть — подсказка только для учебного режима. */
  hint: string;
  /** Категории реестра, которые обычно переносят в этот раздел. */
  categories: string[];
};

export type IntentKind = 'fact' | 'unknown' | 'general' | 'meta' | 'social';

export type Intent = {
  id: string;
  title: string;
  kind: IntentKind;
  /** Тема разговора; задаёт контекст для коротких уточнений. */
  topic: string;
  /** Обязательные признаки: И по группам, ИЛИ внутри группы. */
  required: string[][];
  /** Дополнительные признаки — прибавляют вес. */
  optional?: string[];
  /** Исключающие признаки — намерение не рассматривается. */
  exclude?: string[];
  /** Примеры формулировок: участвуют в сравнении и проверяются тестами. */
  examples: string[];
  /** Вес намерения при равенстве признаков. */
  weight?: number;
  /** Намерение работает только в разговоре на эти темы (нет собственного предмета в вопросе). */
  onlyInTopics?: string[];
  /** Вопросы из файла ответов преподавателя: сравниваются раньше правил. */
  priorityExamples?: string[];
};

/** Шаг раскрытия: один ответ заказчика и факты, которые он открывает. */
export type ReplyStep = {
  facts: string[];
  variants: string[];
  /** Короткая форма для повторного вопроса. */
  short: string[];
};

export type Ambiguity = {
  id: string;
  /** Понятие, которое само по себе неоднозначно. */
  trigger: string[];
  /** Понятия, которые не снимают неоднозначность (всё прочее — снимает). */
  neutral: string[];
  /** Темы, в контексте которых уточнять незачем. */
  contextTopics: string[];
  questions: string[];
  strictQuestions: string[];
};

export type TopicContext = {
  concepts: string[];
  /** Предметы, которые не отменяют тему: «а датчик давления?» в разговоре об отказах датчиков. */
  subjects?: string[];
};

export type MetaReplies = {
  fallback: string[];
  fallbackStrict: string[];
  fallbackHint: string[];
  repeatTemplates: string[];
  repeatAgainTemplates: string[];
  reminderTemplates: string[];
  misheardDisclosed: string[];
  misheardCrossed: string[];
  misheardUndisclosed: string[];
  confirmCorrect: string[];
  prerequisiteBlock: string[];
  multiQuestion: string[];
  impatient: string[];
  more: string[];
  noMore: string[];
  precise: Record<Confidence, string[]>;
  mandatory: Record<RequirementType, string[]>;
  noContext: string[];
  why: string[];
  repeatLast: string[];
  /** Вопрос из одного слова-уточнения («А летом?») без предмета в контексте. */
  needSubject: string[];
};

export type Scenario = {
  id: string;
  title: string;
  subtitle: string;
  publicBrief: string;
  customer: { name: string; role: string; initials: string };
  estimatedMinutes: number;
  greeting: string[];
  categories: Category[];
  tzSections: TzSection[];
  facts: ScenarioFact[];
  intents: Intent[];
  replies: Record<string, ReplyStep[]>;
  meta: MetaReplies;
  lexicon: Record<string, string[]>;
  subjectConcepts: string[];
  /** Понятие-место отменяет понятие-предмет: «после теплообменника» — не вопрос о теплообменнике. */
  conceptSuppress?: Record<string, string[]>;
  /** Составное понятие появляется, когда в вопросе есть все его части. */
  conceptCombos?: Record<string, string[]>;
  attributeConcepts: string[];
  ambiguities: Ambiguity[];
  topics: Record<string, TopicContext>;
  /** Ответы на разные стороны одного намерения: намерение → аспект вопроса → варианты. */
  aspectReplies?: Record<string, Record<string, string[]>>;
};

// --- Состояние движка ---

export type Difficulty = 'learning' | 'standard' | 'strict';

export type MessageQuality =
  | 'useful'
  | 'unknown_found'
  | 'repeat'
  | 'general'
  | 'clarify'
  | 'unrecognized'
  | 'correction'
  | 'confirmation'
  | 'blocked'
  | 'social';

export type EngineCounters = {
  repeats: number;
  general: number;
  unrecognized: number;
  clarifications: number;
  corrections: number;
  confusedPressure: number;
  confusedWarnAlarm: number;
  askedMandatory: number;
};

export type EngineState = {
  turn: number;
  disclosed: string[];
  askedIntents: Record<string, number>;
  topic: string | null;
  lastIntentId: string | null;
  lastFactIds: string[];
  lastAttributes: string[];
  pending: { ambiguityId: string; concepts: string[] } | null;
  usedVariants: Record<string, number[]>;
  /** Какие именно формулировки уже задавались по каждому намерению (для настоящих повторов). */
  askedTexts?: Record<string, string[]>;
  /** Терпение заказчика: падает от общих и повторных вопросов. */
  patience: number;
  counters: EngineCounters;
};

export type EngineReply = {
  diagnostic?: { reason: string; score: number | null };
  text: string;
  intentId: string | null;
  topic: string | null;
  factIds: string[];
  quality: MessageQuality;
};

// --- Попытка ---

export type ChatMessage = {
  id: string;
  role: 'student' | 'customer';
  text: string;
  at: string;
  /** Метаданные анализа: у вопроса студента — качество и распознанное намерение. */
  quality?: MessageQuality;
  intentId?: string | null;
  topic?: string | null;
  factIds?: string[];
  replyToId?: string;
};

export type Requirement = {
  id: string;
  text: string;
  category: string;
  sourceMessageId: string | null;
  sourceQuote?: string;
  createdAt: string;
  needsClarification: boolean;
  conflict: boolean;
  /** Сообщения объединённых записей. */
  mergedFrom?: string[];
  /** Номера разделов ТЗ, куда перенесено. */
  movedToSections?: number[];
};

export type Screen = 'dialog' | 'tz' | 'result';

export type EvaluationPart = {
  id: string;
  label: string;
  score: number;
  max: number;
  note: string;
};

export type Penalty = { id: string; label: string; points: number; detail: string };

export type Contradiction = { source: string; text: string; detail: string };

export type QuestionRef = { messageId: string; text: string; note?: string };

export type EtalonRow = {
  factId: string;
  section: number;
  category: string;
  label: string;
  value: string;
  requirementType: RequirementType;
  customerConfidence: Confidence;
  disclosed: boolean;
  inRegistry: boolean;
  inTz: boolean;
};

export type EvaluationResult = {
  total: number;
  grade: string;
  dialogueCompleteness: number;
  tzCompleteness: number;
  foundRequirements: number;
  mandatoryTotal: number;
  mandatoryDisclosed: number;
  mandatoryInRegistry: number;
  mandatoryInTz: number;
  unknownsFound: number;
  unknownsTotal: number;
  parts: EvaluationPart[];
  penalties: Penalty[];
  coveredCategories: string[];
  missedCategories: string[];
  emptySections: number[];
  contradictions: Contradiction[];
  generalQuestions: QuestionRef[];
  usefulQuestions: QuestionRef[];
  recommendations: string[];
  etalon: EtalonRow[];
};

export type Attempt = {
  version: 1;
  scenarioId: string;
  studentName: string;
  difficulty: Difficulty;
  seed: number;
  startedAt: string;
  finishedAt: string | null;
  messages: ChatMessage[];
  engine: EngineState;
  requirements: Requirement[];
  tz: Record<number, string>;
  screen: Screen;
  activeSection: number;
  result: EvaluationResult | null;
};
