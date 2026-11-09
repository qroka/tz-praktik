// Нормализация русского текста: регистр, ё, единицы измерения, числа, основы слов.
import type { Unit } from '../types';

export type ParsedNumber = { value: number; unit: Unit | null; raw: string };

/** Правила приведения единиц: порядок важен, более длинные формы идут раньше. */
// В JS граница \b понимает только латиницу, поэтому границы слов заданы явно.
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const rule = (source: string): RegExp => new RegExp(source, 'giu');

const UNIT_RULES: [RegExp, string][] = [
  [rule(`°\\s*[сc]${E}|${B}градус\\p{L}*\\s+цельси\\p{L}*|${B}град\\.?(?=\\s|$)|°`), ' градц '],
  [rule(`${B}градус\\p{L}*`), ' градц '],
  [rule(`${B}м\\s*[³3]\\s*\\/\\s*ч(ас)?${E}|${B}м[³3]\\s*в\\s*час${E}|${B}куб\\.?\\s*м\\.?\\s*\\/\\s*ч${E}|${B}куб\\p{L}*\\s+(метр\\p{L}*\\s+)?в\\s+час${E}|${B}кубометр\\p{L}*\\s+в\\s+час${E}`), ' м3ч '],
  [rule(`${B}мегапаскал\\p{L}*|${B}мпа${E}`), ' мпа '],
  [rule(`${B}килопаскал\\p{L}*|${B}кпа${E}`), ' кпа '],
  [rule(`${B}кгс\\s*\\/\\s*см2?${E}|${B}атмосфер\\p{L}*|${B}атм${E}\\.?`), ' атм '],
  [rule(`${B}бар(а|ов|ы)?${E}`), ' бар '],
  [rule(`${B}киловатт\\p{L}*|${B}квт${E}`), ' квт '],
  [rule(`${B}герц\\p{L}*|${B}гц${E}`), ' гц '],
  [rule(`${B}вольт\\p{L}*`), ' вольт '],
  [rule(`(\\d)\\s*в${E}`), '$1 вольт '],
  [rule(`(\\d)\\s*(секунд\\p{L}*|сек${E}\\.?|с${E}\\.?)`), '$1 сек '],
  [rule(`(\\d)\\s*(метр\\p{L}*|м${E}\\.?)(?!\\s*[³3])`), '$1 метр '],
  [rule(`${B}(dn|ду)\\s*-?\\s*(\\d+)`), ' dn $2 '],
  [rule(`${B}ip\\s*-?\\s*(\\d+)`), ' ip $1 '],
];

/** Приводит текст к виду, удобному для сопоставления. Сохраняет числа и единицы. */
export function normalizeText(input: string): string {
  let text = input.toLowerCase().replace(/ё/g, 'е');
  text = text.replace(/(\d)\s*,\s*(\d)/g, '$1.$2');
  text = text.replace(/±|\+\s*\/?\s*-|плюс[\s-]*минус/g, ' плюсминус ');
  for (const [rule, replacement] of UNIT_RULES) text = text.replace(rule, replacement);
  // Дефис и тире между числами — диапазон, остальное — разделитель.
  text = text.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 до $2');
  text = text.replace(/[^\p{L}\d.\s]/gu, ' ');
  // Точка остаётся только внутри числа.
  text = text.replace(/\.(?!\d)|(?<!\d)\./g, ' ');
  return text.replace(/(?:^|\s)(щас|режими|чо)(?=\s|$)/g, (_, word: string) => ` ${{ щас: 'сейчас', режими: 'режимы', чо: 'что' }[word]}`).replace(/\s+/g, ' ').trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.length ? normalized.split(' ') : [];
}

const UNIT_MAP: Record<string, { unit: Unit; factor: number }> = {
  градц: { unit: 'c', factor: 1 },
  мпа: { unit: 'mpa', factor: 1 },
  кпа: { unit: 'mpa', factor: 0.001 },
  бар: { unit: 'mpa', factor: 0.1 },
  атм: { unit: 'mpa', factor: 0.1 },
  м3ч: { unit: 'm3h', factor: 1 },
  квт: { unit: 'kw', factor: 1 },
  гц: { unit: 'hz', factor: 1 },
  вольт: { unit: 'v', factor: 1 },
  сек: { unit: 's', factor: 1 },
  метр: { unit: 'm', factor: 1 },
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Находит числа и их единицы. В диапазоне «от 1.5 до 4 м3ч» единица переносится на оба числа. */
export function extractNumbers(normalized: string): ParsedNumber[] {
  const tokens = tokenize(normalized);
  const found: { value: number; unitToken: string | null; prefix: Unit | null; raw: string }[] = [];
  tokens.forEach((token, index) => {
    if (!/^\d+(\.\d+)?$/.test(token)) return;
    const prev = tokens[index - 1];
    const prefix: Unit | null = prev === 'dn' ? 'dn' : prev === 'ip' ? 'ip' : null;
    const next = tokens[index + 1];
    found.push({ value: parseFloat(token), unitToken: next && UNIT_MAP[next] ? next : null, prefix, raw: token });
  });
  return found.map((item, index) => {
    if (item.prefix) return { value: item.value, unit: item.prefix, raw: item.raw };
    let unitToken = item.unitToken;
    if (!unitToken) {
      const next = found[index + 1];
      // «1.5 до 4 м3ч» — единица следующего числа, если между ними только «до» или «и».
      const here = tokens.indexOf(item.raw);
      if (next?.unitToken && (tokens[here + 1] === 'до' || tokens[here + 1] === 'и')) unitToken = next.unitToken;
    }
    if (!unitToken) return { value: item.value, unit: null, raw: item.raw };
    const { unit, factor } = UNIT_MAP[unitToken];
    return { value: round(item.value * factor), unit, raw: item.raw };
  });
}

const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'ием', 'иях', 'ях', 'ах', 'ов', 'ев', 'ей', 'ой', 'ий', 'ый',
  'ая', 'яя', 'ое', 'ее', 'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ия', 'ие', 'ии', 'ию', 'ть', 'ся', 'ет', 'ит', 'ут', 'ют', 'ат', 'ят',
  'а', 'я', 'о', 'е', 'и', 'ы', 'у', 'ю', 'ь', 'й',
];

/** Упрощённая основа: отсекает частые окончания, оставляя минимум три символа. */
export function stem(word: string): string {
  for (const ending of ENDINGS) {
    if (word.length - ending.length >= 3 && word.endsWith(ending)) return word.slice(0, -ending.length);
  }
  return word;
}

/** Расстояние Дамерау — Левенштейна. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) table[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
      }
    }
  }
  return table[rows - 1][cols - 1];
}

/**
 * Нечёткое сравнение слова с основой словаря: сравниваем начало слова,
 * допуская одну опечатку, а для длинных основ — две.
 */
export function fuzzyStartsWith(token: string, base: string): boolean {
  if (token.startsWith(base)) return true;
  if (base.length < 6 || token.length < base.length - 1 || token[0] !== base[0]) return false;
  const limit = base.length >= 11 ? 2 : 1;
  for (const size of [base.length - 1, base.length, base.length + 1]) {
    if (size > token.length) continue;
    if (editDistance(token.slice(0, size), base) <= limit) return true;
  }
  return false;
}

/** Делит сырой текст на предложения, не разрывая десятичные числа. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?:[.!?;]+(?=\s|$))|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}
