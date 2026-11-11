// Преобразование файлов сценария «в другом формате» в формат тренажёра (tz-praktikum-scenario).
// Нужен, когда ChatGPT выдал сценарий не по нашему промту: поля называются иначе (schemaVersion, answers, repeatAnswers,
// свои идентификаторы категорий и разделов ТЗ), ключевых слов для распознавания вопросов нет.
import { normalizeText, tokenize } from '../engine/normalizeText';
import type { PackFact, ScenarioPack } from './scenarioPack';

export type ConvertResult = { pack: ScenarioPack; notes: string[] };

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []);

/** Файл не в нашем формате, но похож на сценарий: список facts с полем answers. */
export function isForeignPack(raw: unknown): boolean {
  if (!isObject(raw) || raw.format === 'tz-praktikum-scenario') return false;
  const facts = raw.facts;
  return Array.isArray(facts) && facts.length > 0 && facts.every((f) => isObject(f) && Array.isArray(f.answers));
}

// ---------- значения ----------
const UNIT_LABEL: Record<string, string> = { min: 'мин', s: 'с', sec: 'с', 'V AC': 'В AC', 'V DC': 'В DC', V: 'В', kW: 'кВт', Hz: 'Гц', MPa: 'МПа' };
const unitLabel = (unit: string) => UNIT_LABEL[unit] ?? unit;
const num = (n: number) => String(n).replace('.', ',');

/** Короткое человеческое значение для простых форм; для сложных возвращает null (тогда берётся первый ответ заказчика). */
function formatSimple(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return num(value);
  if (typeof value === 'boolean') return value ? 'Да.' : 'Нет.';
  if (!isObject(value)) return null;
  const unit = typeof value.unit === 'string' ? unitLabel(value.unit) : '';
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);
  if (typeof value.value === 'number') return withUnit(num(value.value)) + '.';
  if (typeof value.min === 'number' && typeof value.max === 'number') return withUnit(`${num(value.min)}–${num(value.max)}`) + '.';
  if (typeof value.threshold === 'number') return withUnit(`${typeof value.condition === 'string' ? `${value.condition} ` : ''}${num(value.threshold)}`) + '.';
  if (Array.isArray(value.stages) && value.stages.every((s) => typeof s === 'number')) return withUnit((value.stages as number[]).map(num).join(', ')) + '.';
  if (typeof value.start === 'string' && typeof value.end === 'string') return `${value.start}–${value.end}.`;
  return null;
}

/** Числа и единица для сверки: берутся из простых форм значения. */
function numbersOf(value: unknown): { numbers?: number[]; unit?: string } {
  if (!isObject(value)) return {};
  const unit = typeof value.unit === 'string' ? unitLabel(value.unit) : undefined;
  if (typeof value.value === 'number') return { numbers: [value.value], unit };
  if (typeof value.min === 'number' && typeof value.max === 'number') return { numbers: [value.min, value.max], unit };
  if (typeof value.threshold === 'number') return { numbers: [value.threshold], unit };
  if (Array.isArray(value.stages) && value.stages.every((s) => typeof s === 'number')) return { numbers: value.stages as number[], unit };
  return {};
}

const UNKNOWN_TEXT: Record<string, string> = {
  survey: 'Данных нет: нужно обследовать объект.',
  undefined: 'Заказчик не определял: согласовать с ним.',
  designer: 'Решение предлагает проектировщик.',
};

// ---------- ключевые слова ----------
const STOP = new Set(
  ('какой какая какое какие каких какую каким сколько что это как где когда нужен нужна нужно нужны есть будет будем быть система системы системе сейчас еще уже там вас ваш ваша ваши ' +
    'должен должна должно должны можно можете хотите надо или если чтобы после перед при для без над под про всех весь вся все этот эта эти того тому такой почему зачем чем кто кого ' +
    'какую делать делаем сразу потом дальше затем вообще просто тоже пока также ставить поставить оставить оставляем ' +
    'через может сможет сможете хотя брать берем нового новая новый новое другое другой другие кроме дать давать сколько какого будут будет буду делает делают ' +
    'понятно больше решили решить умеет уметь нужна нужны надо хотел хотим хочу хотелось мне нам вам вами ними него нее ней них быть были было была бывает ' +
    'которые который которая которое самый самая самое очень более менее только лишь даже ещё иначе тогда тут здесь сюда туда откуда сначала ' +
    'один одна одно одни одного эту этой этом этих этим эти').split(/\s+/),
);

/** Основа слова для сравнения по началу слова: «температура», «температуры», «температуру» → «температ». */
function prefixOf(word: string): string {
  return word.slice(0, Math.max(4, Math.ceil(word.length * 0.7)));
}

function wordsOf(text: string): string[] {
  return tokenize(normalizeText(text)).filter((w) => w.length >= 4 && !STOP.has(w) && !/\d/.test(w));
}

/** Для каждого сведения подбирает слова, по которым вопрос узнаётся: часто встречаются у его вопросов и редко — у других сведений. */
function deriveKeywords(facts: { id: string; texts: string[] }[]): Map<string, string[]> {
  const own = facts.map((f) => {
    const counts = new Map<string, number>();
    for (const text of f.texts) for (const prefix of new Set(wordsOf(text).map(prefixOf))) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    return counts;
  });
  const documentFrequency = new Map<string, number>();
  own.forEach((counts) => counts.forEach((_, prefix) => documentFrequency.set(prefix, (documentFrequency.get(prefix) ?? 0) + 1)));
  const rare = Math.max(5, Math.round(facts.length * 0.1));
  const result = new Map<string, string[]>();
  facts.forEach((fact, index) => {
    const ranked = [...own[index].entries()]
      .map(([prefix, count]) => ({ prefix, count, df: documentFrequency.get(prefix) ?? 1 }))
      .sort((a, b) => (a.df > rare ? 1 : 0) - (b.df > rare ? 1 : 0) || b.count - a.count || a.df - b.df || b.prefix.length - a.prefix.length);
    const picked = ranked.filter((c) => c.df <= rare).slice(0, 7);
    // Если редких слов мало, добавляем самые частые у самого сведения.
    for (const c of ranked) if (picked.length < 3 && !picked.includes(c)) picked.push(c);
    result.set(fact.id, picked.map((c) => c.prefix));
  });
  return result;
}

const kebab = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario';
const factId = (id: string) => id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'З';

/**
 * Превращает файл другого формата в наш. Возвращает null, если файл не похож на сценарий.
 * notes — что сделано автоматически (показывается преподавателю перед загрузкой).
 */
export function convertForeignPack(raw: unknown): ConvertResult | null {
  if (!isForeignPack(raw)) return null;
  const source = raw as Raw;
  const notes: string[] = [];
  const customer = isObject(source.customer) ? source.customer : {};
  const name = str(customer.name) || 'Заказчик';
  const role = str(customer.role) || 'заказчик';
  const title = str(source.title) || 'Учебный сценарий';

  const categories = (Array.isArray(source.categories) ? source.categories : []).filter(isObject).map((c) => ({ id: str(c.id), title: str(c.name) || str(c.title) || str(c.id) })).filter((c) => c.id);
  const sections = (Array.isArray(source.tzSections) ? source.tzSections : []).filter(isObject).map((s) => ({ id: str(s.id), title: str(s.name) || str(s.title) || str(s.id) })).filter((s) => s.id);
  const sectionNumber = new Map(sections.map((s, index) => [s.id, index + 1]));

  const sourceFacts = (source.facts as Raw[]).filter(isObject);
  const keywords = deriveKeywords(sourceFacts.map((f) => ({ id: str(f.id), texts: [str(f.title), ...strings(f.questions)] })));

  const facts: PackFact[] = sourceFacts.map((f) => {
    const id = factId(str(f.id));
    const answers = strings(f.answers);
    const confidence = str(f.customerConfidence);
    const unknownKind = str(f.unknownKind) || null;
    const simple = formatSimple(f.value);
    const value = f.value === null || f.value === undefined ? UNKNOWN_TEXT[unknownKind ?? 'designer'] ?? UNKNOWN_TEXT.designer : simple ?? answers[0] ?? str(f.title);
    const { numbers, unit } = numbersOf(f.value);
    return {
      id,
      category: str(f.category),
      section: sectionNumber.get(str(f.tzSection)) ?? 0,
      label: str(f.title),
      value,
      numbers,
      unit,
      keywords: keywords.get(str(f.id)) ?? [],
      disclosureLevel: (str(f.disclosureLevel) || 'specific') as PackFact['disclosureLevel'],
      prerequisites: strings(f.prerequisites).map(factId),
      customerConfidence: (confidence === 'known' ? 'certain' : confidence || 'certain') as PackFact['customerConfidence'],
      requirementType: (str(f.requirementType) || undefined) as PackFact['requirementType'],
      unknownKind: unknownKind as PackFact['unknownKind'],
      isReaction: /^реакци/i.test(str(f.title)) || undefined,
      questions: strings(f.questions),
      replies: answers,
      repeat: strings(f.repeatAnswers),
    };
  });

  // Общие вопросы: сведения уровня general можно узнать вопросом «расскажите про объект», но не больше трёх сразу.
  const general = facts.filter((f) => f.disclosureLevel === 'general');
  const generalQuestions: NonNullable<ScenarioPack['generalQuestions']> = [];
  if (general.length) {
    const first = general.slice(0, 3);
    generalQuestions.push({
      questions: ['Расскажите про объект', 'Что у вас за система?', 'Опишите, что есть сейчас', 'Расскажите, что автоматизируем'],
      replies: [first.map((f) => f.replies[0]).join(' ')],
      facts: first.map((f) => f.id),
    });
  }
  generalQuestions.push({
    questions: ['Расскажите всё', 'Какие требования?', 'Что нужно сделать?', 'Дайте все требования сразу'],
    replies: [
      'Вопрос слишком общий. Спрашивайте про конкретное: что за объект, какие температуры, как запускается и останавливается, что показывать оператору.',
      'Всё сразу не расскажу. Давайте по одной теме: оборудование, температура, режимы, аварии, питание.',
    ],
    facts: [],
  });

  const warnAlarmFacts = facts.filter((f) => /^(предупреждение|авария)\s+по/i.test(f.label)).map((f) => f.id);

  const pack: ScenarioPack = {
    format: 'tz-praktikum-scenario',
    version: 1,
    scenario: {
      id: kebab(str(source.scenarioId) || title),
      title,
      subtitle: `Заказчик: ${name}, ${role}.`,
      publicBrief: `Вы инженер по автоматизации. Заказчик (${name}, ${role}) хорошо знает то, с чем работает каждый день, но отвечает только на заданный вопрос. Узнайте у него всё необходимое и составьте техническое задание: «${title}».`,
      customer: { name, role, initials: initials(name) },
      estimatedMinutes: 90,
      greeting: [
        `Здравствуйте. Я ${name}, ${role}. Спрашивайте, отвечу на то, что знаю.`,
        `Добрый день. Мне сказали, вы делаете ТЗ. Слушаю ваши вопросы.`,
        `Приветствую. Давайте по порядку: спрашивайте, что нужно для ТЗ.`,
      ],
    },
    categories: categories.map((c) => ({ id: c.id, title: c.title, direction: `Тема «${c.title}»: выясните всё, что к ней относится.` })),
    tzSections: sections.map((s) => ({ id: s.id, title: s.title })),
    evaluation: { warnAlarmFacts },
    facts,
    generalQuestions,
  };

  notes.push('Файл был не в формате тренажёра (schemaVersion вместо format, answers вместо replies): он преобразован автоматически.');
  notes.push(`Ключевые слова для распознавания вопросов подобраны из ваших формулировок (у каждого сведения до ${Math.max(...facts.map((f) => f.keywords?.length ?? 0))}).`);
  notes.push(`Сохранены ваши категории (${categories.length}) и разделы ТЗ (${sections.length}).`);
  notes.push(`Добавлено общих вопросов: ${generalQuestions.length}. Приветствие заказчика и описание для студента составлены автоматически: их можно поправить в «Настройках» сценария.`);
  const unplaced = facts.filter((f) => !f.section).length;
  if (unplaced) notes.push(`У ${unplaced} сведений не найден раздел ТЗ (tzSection): исправьте файл.`);
  return { pack, notes };
}
