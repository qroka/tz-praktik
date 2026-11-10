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
  /** Непонятый вопрос с распознанным предметом: один уточняющий вопрос по предмету. */
  fallbackSubject?: string[];
  /** После двух непонятых вопросов подряд: как спросить, без готового ответа. */
  fallbackGuide?: string[];
  /** Паспортный блок не исчерпан: можно спросить ещё. */
  specMore?: string[];
  /** Ответное приветствие, когда студент поздоровался и сразу задал вопрос. */
  greetBack?: string[];
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
  /** Паспортные блоки: связанные сведения одного устройства в одном ответе. */
  specGroups?: SpecGroup[];
  /** Темы без подтверждённых сведений: честное «не уточнено / не определено / решает исполнитель». */
  unknownTopics?: UnknownTopic[];
  /** Пояснения терминов без значений. */
  glossary?: GlossaryEntry[];
};

/** Сведение паспортного блока: факт, ответ, которым его произносит заказчик, и слова, которыми о нём спрашивают. */
export type SpecItem = { factId: string; intentId: string; cues: string[] };

export type SpecGroup = {
  id: string;
  title: string;
  /** Общее намерение темы («Расскажите про насос»), от имени которого идёт ответ. */
  intentId: string;
  /** Понятия-предметы, по которым узнаётся группа. */
  subjects: string[];
  /** Темы разговора, в которых короткий вопрос («А какие у него характеристики?») относится к группе. */
  topics: string[];
  items: SpecItem[];
};

/** Почему сведений нет: обследовать объект, согласовать с заказчиком или решает исполнитель. */
export type UncertaintyKind = 'survey' | 'undefined' | 'designer';

/** Честное «сведений нет» в ответе: тема, класс и категория для реестра. Это не факт и не начисляет прогресс. */
export type Uncertainty = { id: string; kind: UncertaintyKind; label: string; category?: string };

export type UnknownTopic = {
  id: string;
  kind: UncertaintyKind;
  label: string;
  /** Категория реестра, в которую студент отметит вопрос как требующий уточнения. */
  category: string;
  /** Регулярное выражение по нормализованному тексту. */
  pattern?: string;
  /** Группы понятий: в вопросе должно быть хотя бы одно понятие из каждой. */
  concepts?: string[][];
  /** Не срабатывает при этих понятиях («пропал сигнал датчика давления» — это отказ датчика). */
  excludeConcepts?: string[];
  /** Темы ответа по фактам, к которому оговорка дописывается; без них оговорка заменяет ответ. */
  appendTo?: string[];
  /** Шаблон короткого уточнения, действующий только в этих темах разговора. */
  contextPattern?: string;
  contextTopics?: string[];
  /** Не срабатывает, если вопрос о будущей системе («нужен ли частотник?»). */
  requiresNotFuture?: boolean;
  replies: string[];
};

export type GlossaryEntry = { id: string; pattern: string; text: string };

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
  /** Последний паспортный блок: «А ещё?» продолжает его. */
  lastSpec?: string | null;
  /** Сколько непонятых вопросов подряд: после двух заказчик подсказывает, как спросить. */
  missStreak?: number;
  /** Темы, по которым заказчик честно сказал, что сведений нет (для реестра и оценки, не факты). */
  uncertain?: string[];
  /** Терпение заказчика: падает от общих и повторных вопросов. */
  patience: number;
  counters: EngineCounters;
};

/** Диагностика ответа для преподавателя и тестов: не подсказка студенту. */
export type ReplyDiagnostic = {
  reason: string;
  score: number | null;
  /** Смысловая рамка вопроса: время, действие, предметы, признаки, вежливый префикс. */
  frame?: { time: 'current' | 'future' | 'unspecified'; action: string; subjects: string[]; attributes: string[]; prefix: string | null };
};

export type EngineReply = {
  diagnostic?: ReplyDiagnostic;
  /** Заказчик честно сказал, что сведений нет: тема и класс неизвестности. */
  uncertainty?: Uncertainty | null;
  text: string;
  intentId: string | null;
  topic: string | null;
  factIds: string[];
  quality: MessageQuality;
};

// --- Попытка ---

/** Оценка студента: соответствует ли ответ заказчика заданному вопросу. */
export type AnswerFeedback = { rating: 'like' | 'dislike'; reason: string; at: string };

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
  /** Только у ответов заказчика. */
  feedback?: AnswerFeedback;
  /** У ответа заказчика: сведений нет, вопрос можно отметить в реестре как требующий уточнения. */
  uncertainty?: Uncertainty;
  /** У ответа заказчика: как понят вопрос (только для режима преподавателя, студенту не показывается). */
  diagnostic?: ReplyDiagnostic;
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

export type Screen = 'dialog' | 'registry' | 'tz' | 'progress' | 'result';

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
