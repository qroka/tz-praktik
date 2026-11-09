// Пакет ответов заказчика: файл, которым преподаватель заменяет реплики без правки кода.
import type { Intent, ReplyStep, Scenario } from '../types';
import { extractNumbers, normalizeText } from './normalizeText';

export const ANSWER_PACK_FORMAT = 'tz-praktikum-answers';

export type AnswerPackEntry = {
  /** id темы из шаблона. Без id (или с новым id) — новая тема. */
  id?: string;
  title?: string;
  /** Только для справки: какие сведения должен сообщить ответ. При загрузке не используется. */
  facts?: string[];
  /** Вопросы студента, на которые нужно отвечать этой темой. */
  questions?: string[];
  /** Варианты ответа (для темы из одного шага). */
  replies?: string[];
  /** Шаги ответа: первый вопрос — шаг 1, «что ещё?» — шаг 2 и так далее. */
  steps?: string[][];
  /** Короткий ответ на повторный вопрос. */
  repeat?: string[];
};

export type AnswerPack = {
  format: typeof ANSWER_PACK_FORMAT;
  version: 1;
  title?: string;
  greeting?: string[];
  fallback?: string[];
  /** Встречные вопросы на неоднозначный вопрос: { "pressure": ["..."] }. */
  clarifications?: Record<string, string[]>;
  answers: AnswerPackEntry[];
};

export type PackSummary = { changed: number; added: number; questions: number };

export type ParsedPack =
  | { ok: true; pack: AnswerPack; warnings: string[]; summary: PackSummary }
  | { ok: false; errors: string[] };

const MAX_TEXT = 2_000;

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

const clean = (list: string[] | undefined): string[] => (list ?? []).map((item) => item.trim()).filter(Boolean);

function entryName(entry: AnswerPackEntry, index: number): string {
  return `Ответ №${index + 1}${entry.id ? ` (${entry.id})` : entry.title ? ` («${entry.title}»)` : ''}`;
}

/** Проверяет файл. Ошибки не дают загрузить файл, предупреждения — дают. */
export function parseAnswerPack(text: string, scenario: Scenario): ParsedPack {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    return { ok: false, errors: [`Файл не читается как JSON. Чаще всего это лишняя или пропущенная запятая либо кавычка. ${detail}`.trim()] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['В файле должен быть один объект { ... }.'] };
  const raw = data as Record<string, unknown>;
  if (raw.format !== ANSWER_PACK_FORMAT) {
    return { ok: false, errors: [`Это не файл ответов: поле "format" должно быть "${ANSWER_PACK_FORMAT}". Возьмите за основу скачанный шаблон.`] };
  }
  if (!Array.isArray(raw.answers)) return { ok: false, errors: ['Нет списка "answers".'] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const intents = new Map(scenario.intents.map((intent) => [intent.id, intent]));
  const answers: AnswerPackEntry[] = [];
  let changed = 0;
  let added = 0;
  let questions = 0;

  raw.answers.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`Ответ №${index + 1}: должен быть объектом { ... }.`);
      return;
    }
    const entry = item as Record<string, unknown>;
    const name = entryName(entry as AnswerPackEntry, index);
    for (const key of ['questions', 'replies', 'repeat', 'facts'] as const) {
      if (entry[key] !== undefined && !isStringList(entry[key])) errors.push(`${name}: "${key}" должен быть списком строк ["...", "..."].`);
    }
    if (entry.steps !== undefined && !(Array.isArray(entry.steps) && entry.steps.every(isStringList))) {
      errors.push(`${name}: "steps" должен быть списком списков [["..."], ["..."]].`);
    }
    if (entry.id !== undefined && typeof entry.id !== 'string') errors.push(`${name}: "id" должен быть строкой.`);
    if (errors.length) return;

    const parsed: AnswerPackEntry = {
      id: typeof entry.id === 'string' ? entry.id.trim() || undefined : undefined,
      title: typeof entry.title === 'string' ? entry.title : undefined,
      questions: clean(entry.questions as string[] | undefined),
      replies: clean(entry.replies as string[] | undefined),
      steps: (entry.steps as string[][] | undefined)?.map((step) => clean(step)),
      repeat: clean(entry.repeat as string[] | undefined),
    };
    const allTexts = [...(parsed.replies ?? []), ...(parsed.steps ?? []).flat(), ...(parsed.repeat ?? []), ...(parsed.questions ?? [])];
    if (allTexts.some((value) => value.length > MAX_TEXT)) errors.push(`${name}: слишком длинный текст (больше ${MAX_TEXT} символов).`);
    if (parsed.steps?.some((step) => step.length === 0)) errors.push(`${name}: в "steps" есть пустой шаг.`);
    questions += parsed.questions?.length ?? 0;

    const intent = parsed.id ? intents.get(parsed.id) : undefined;
    if (intent) {
      if (intent.kind === 'meta') {
        warnings.push(`${name}: это служебная тема («что ещё?», «повторите»), её ответы собираются автоматически. Добавленные вопросы учтены, ответы — нет.`);
      }
      const steps = scenario.replies[intent.id] ?? [];
      const given = parsed.steps?.length ? parsed.steps : parsed.replies?.length ? [parsed.replies] : [];
      if (given.length > steps.length && steps.length) {
        warnings.push(`${name}: у темы ${steps.length} шаг(а), лишние шаги из файла пропущены.`);
      }
      given.slice(0, steps.length).forEach((variants, stepIndex) => {
        const facts = steps[stepIndex].facts.map((id) => scenario.facts.find((fact) => fact.id === id)).filter(Boolean);
        const expected = facts.flatMap((fact) => fact!.numbers ?? []);
        for (const variant of variants) {
          const values = extractNumbers(normalizeText(variant)).map((number) => number.value);
          const missing = expected.filter((value) => !values.some((found) => Math.abs(found - value) < 1e-6));
          // Число прописью или ответ без чисел не ошибка; ошибка — другое число вместо эталонного.
          if (values.length && missing.length) {
            warnings.push(
              `${name}: в ответе «${variant.slice(0, 60)}» нет значения ${missing.map((value) => String(value).replace('.', ',')).join(', ')}. Оценка ТЗ ждёт именно его — если меняете цифру, поменяйте и эталон в коде.`,
            );
          }
        }
      });
      if (given.length || parsed.repeat?.length || parsed.questions?.length) changed++;
    } else {
      const replies = parsed.steps?.length ? parsed.steps.flat() : parsed.replies ?? [];
      if (!parsed.questions?.length) errors.push(`${name}: для новой темы нужен хотя бы один вопрос в "questions".`);
      if (!replies.length) errors.push(`${name}: для новой темы нужен хотя бы один ответ в "replies".`);
      if (parsed.id) warnings.push(`${name}: темы с таким id нет в шаблоне, она добавлена как новая.`);
      added++;
    }
    answers.push(parsed);
  });

  for (const key of ['greeting', 'fallback'] as const) {
    if (raw[key] !== undefined && !isStringList(raw[key])) errors.push(`"${key}" должен быть списком строк.`);
  }
  const clarifications: Record<string, string[]> = {};
  if (raw.clarifications !== undefined) {
    if (!raw.clarifications || typeof raw.clarifications !== 'object' || Array.isArray(raw.clarifications)) {
      errors.push('"clarifications" должен быть объектом { "pressure": ["..."] }.');
    } else {
      for (const [id, list] of Object.entries(raw.clarifications as Record<string, unknown>)) {
        if (!isStringList(list)) errors.push(`"clarifications.${id}" должен быть списком строк.`);
        else if (!scenario.ambiguities.some((item) => item.id === id)) warnings.push(`Встречного вопроса «${id}» нет, он пропущен.`);
        else if (clean(list).length) clarifications[id] = clean(list);
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    pack: {
      format: ANSWER_PACK_FORMAT,
      version: 1,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      greeting: clean(raw.greeting as string[] | undefined),
      fallback: clean(raw.fallback as string[] | undefined),
      clarifications,
      answers,
    },
    warnings,
    summary: { changed, added, questions },
  };
}

/** Новый сценарий с ответами из пакета. Исходный сценарий не меняется. */
export function applyAnswerPack(base: Scenario, pack: AnswerPack): Scenario {
  const intents: Intent[] = base.intents.map((intent) => ({ ...intent }));
  const replies: Record<string, ReplyStep[]> = Object.fromEntries(
    Object.entries(base.replies).map(([id, steps]) => [id, steps.map((step) => ({ ...step }))]),
  );
  const byId = new Map(intents.map((intent) => [intent.id, intent]));

  pack.answers.forEach((entry, index) => {
    const questions = entry.questions ?? [];
    const intent = entry.id ? byId.get(entry.id) : undefined;
    if (intent) {
      const extra = questions.filter((question) => !intent.examples.includes(question));
      intent.examples = [...intent.examples, ...extra];
      // Вопросы из файла ищутся в первую очередь — так преподаватель исправляет неверное распознавание.
      intent.priorityExamples = [...(intent.priorityExamples ?? []), ...questions];
      const steps = replies[intent.id];
      if (!steps || intent.kind === 'meta') return;
      const given = entry.steps?.length ? entry.steps : entry.replies?.length ? [entry.replies] : [];
      given.slice(0, steps.length).forEach((variants, stepIndex) => {
        steps[stepIndex] = { ...steps[stepIndex], variants };
      });
      if (entry.repeat?.length) steps.forEach((step, stepIndex) => (steps[stepIndex] = { ...step, short: entry.repeat! }));
      return;
    }
    const id = entry.id && !byId.has(entry.id) ? entry.id : `custom_${index + 1}`;
    const variants = entry.steps?.length ? entry.steps : [entry.replies ?? []];
    const custom: Intent = {
      id,
      title: entry.title ?? questions[0] ?? id,
      kind: 'fact',
      topic: 'misc',
      required: [],
      examples: questions,
      priorityExamples: questions,
    };
    intents.push(custom);
    byId.set(id, custom);
    replies[id] = variants.map((stepVariants) => ({ facts: [], variants: stepVariants, short: entry.repeat?.length ? entry.repeat : stepVariants }));
  });

  const clarify = pack.clarifications ?? {};
  return {
    ...base,
    greeting: pack.greeting?.length ? pack.greeting : base.greeting,
    meta: { ...base.meta, fallback: pack.fallback?.length ? pack.fallback : base.meta.fallback },
    ambiguities: base.ambiguities.map((item) => (clarify[item.id] ? { ...item, questions: clarify[item.id] } : item)),
    intents,
    replies,
  };
}

const KIND_NOTE: Record<Intent['kind'], string> = {
  fact: 'сведения об объекте',
  unknown: 'заказчик не знает, решение за проектировщиком',
  general: 'слишком общий вопрос — конкретику не выдавать',
  meta: 'служебное',
  social: 'служебная реплика',
};

/** Шаблон со всеми текущими ответами: с него преподаватель начинает правку. */
export function buildAnswerTemplate(scenario: Scenario, title = 'Ответы заказчика'): AnswerPack & { help: string[] } {
  const factText = (id: string) => {
    const fact = scenario.facts.find((item) => item.id === id);
    return fact ? `${fact.label}: ${fact.value}` : id;
  };
  return {
    format: ANSWER_PACK_FORMAT,
    version: 1,
    title,
    help: [
      'Меняйте только текст в кавычках в полях questions, replies, steps, repeat, greeting, fallback, clarifications.',
      'id не меняйте: по нему ответ привязан к теме. Поле facts — подсказка, какие сведения должен содержать ответ; при загрузке оно не читается.',
      'replies — варианты первого ответа (заказчик выбирает один). steps — ответ по частям: шаг 1 на первый вопрос, шаг 2 на «что ещё?».',
      'repeat — короткий ответ, если студент спросил то же самое ещё раз.',
      'questions — как студенты могут спросить. Добавленные вопросы распознаются в первую очередь.',
      'Новая тема: добавьте объект без id с полями title, questions и replies.',
      'Один ответ — одна-три мысли. Не перечисляйте то, о чём не спрашивали.',
    ],
    greeting: scenario.greeting,
    fallback: scenario.meta.fallback,
    clarifications: Object.fromEntries(scenario.ambiguities.map((item) => [item.id, item.questions])),
    answers: scenario.intents
      .filter((intent) => intent.kind !== 'meta' && scenario.replies[intent.id])
      .map((intent) => {
        const steps = scenario.replies[intent.id];
        const facts = [...new Set(steps.flatMap((step) => step.facts))].map(factText);
        const entry: AnswerPackEntry & { note: string } = {
          id: intent.id,
          title: intent.title,
          note: KIND_NOTE[intent.kind],
          facts,
          questions: intent.examples,
          repeat: [...new Set(steps.flatMap((step) => step.short))],
        };
        if (steps.length > 1) entry.steps = steps.map((step) => step.variants);
        else entry.replies = steps[0]?.variants ?? [];
        return entry;
      }),
  };
}
