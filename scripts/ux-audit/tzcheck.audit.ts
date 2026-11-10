// Сверка черновиков ТЗ студентов с эталоном сценария.
// Числовой факт найден, если в ТЗ есть все его числа; нечисловой — если совпал хотя бы один ключ из aliases
// (ключ «a+b» — все части встречаются в тексте). Это грубая автоматическая оценка, её дополняет ручная проверка.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { scenario } from '../../src/data/scenario';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/(\d),(\d)/g, '$1.$2');

function numberIn(text: string, value: number): boolean {
  const variants = new Set([String(value), value.toFixed(2), value.toFixed(1)].map((v) => v.replace(/\.0+$/, '')));
  return [...variants].some((v) => new RegExp(`(^|[^\\d.])${v.replace('.', '\\.')}0*([^\\d]|$)`).test(text));
}

function found(text: string, factId: string): boolean {
  const fact = scenario.facts.find((f) => f.id === factId)!;
  if (fact.numbers?.length) return fact.numbers.every((n) => numberIn(text, n));
  return fact.aliases.some((alias) => alias.split('+').every((part) => text.includes(norm(part))));
}

const AUDIT_DIR = process.env.AUDIT_DIR ?? 'docs/ux-audit';

it('сверка ТЗ', () => {
  const md: string[] = ['# Сверка черновиков ТЗ с эталоном (автоматическая, грубая)', ''];
  const out: Record<string, unknown> = {};
  for (const key of ['ivan', 'weak', 'strong']) {
    const file = `${AUDIT_DIR}/tz-${key}.md`;
    const log = `${AUDIT_DIR}/logs/${key}.jsonl`;
    if (!existsSync(file) || !existsSync(log)) continue;
    const text = norm(readFileSync(file, 'utf8'));
    const disclosed = new Set(readFileSync(log, 'utf8').trim().split('\n').flatMap((l) => JSON.parse(l).newFacts as string[]));
    const mandatory = scenario.facts.filter((f) => f.requirementType === 'mandatory');
    const inTz = mandatory.filter((f) => found(text, f.id));
    const forgotten = mandatory.filter((f) => disclosed.has(f.id) && !found(text, f.id));
    const neverGot = mandatory.filter((f) => !disclosed.has(f.id));
    const unknowns = scenario.facts.filter((f) => f.customerConfidence === 'unknown');
    const markedUnknown = (text.match(/не выяснено/g) ?? []).length;
    const proposals = (text.match(/предлагает исполнитель/g) ?? []).length;
    const numeric = mandatory.filter((f) => f.numbers?.length);
    const numericInTz = numeric.filter((f) => found(text, f.id));
    const numericGot = numeric.filter((f) => disclosed.has(f.id));
    const numericGotInTz = numericGot.filter((f) => found(text, f.id));
    md.push(`## ${key} — числовые обязательные сведения (надёжная проверка)`, '', `Всего: ${numeric.length}. Получено в переписке: **${numericGot.length}**. Из полученных перенесено в ТЗ: **${numericGotInTz.length}**. Найдено в ТЗ всего: ${numericInTz.length}. Не получены: ${numeric.filter((f) => !disclosed.has(f.id)).map((f) => `${f.label} (${f.value})`).join('; ')}`, '');
    out[key] = { numericTotal: numeric.length, numericGot: numericGot.length, numericGotInTz: numericGotInTz.length, mandatoryTotal: mandatory.length, inTz: inTz.length, forgotten: forgotten.map((f) => f.label), neverGot: neverGot.length, markedUnknown, proposals };
    md.push(`## ${key}`, '', `Обязательных в ТЗ: **${inTz.length} из ${mandatory.length}** (${Math.round((inTz.length / mandatory.length) * 100)}%). Пометок «НЕ ВЫЯСНЕНО»: ${markedUnknown}, «ПРЕДЛАГАЕТ ИСПОЛНИТЕЛЬ»: ${proposals}. Сведений «не знает» в сценарии: ${unknowns.length}.`, '');
    md.push(`Получены в переписке, но в ТЗ не найдены (${forgotten.length}): ${forgotten.map((f) => f.label).join('; ') || '—'}`, '');
    md.push(`Не получены в переписке вовсе: ${neverGot.length}`, '');
  }
  writeFileSync(`${AUDIT_DIR}/tz-check.json`, JSON.stringify(out, null, 2));
  writeFileSync(`${AUDIT_DIR}/tz-check.md`, md.join('\n'));
});
