// Второй набор: одиночные вопросы (каждый с чистого листа) и диалоги (с накоплением контекста).
// Ожидание — id намерения; «|» — допустимые варианты; CLARIFY, CONFIRM, FALLBACK — тип ответа.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import { createEngineState, respond, respondIsolated } from '../engine/dialogueEngine';
import type { EngineReply } from '../types';

type Single = [string, string];
type Dialog = [string, string][];
const cases = JSON.parse(readFileSync('src/qa/cases2.json', 'utf8')) as { single: Single[]; dialogs: Dialog[] };

function ok(expected: string, reply: EngineReply): boolean {
  return expected.split('|').some((token) => {
    if (token === 'CLARIFY') return reply.quality === 'clarify';
    if (token === 'CONFIRM') return reply.quality === 'confirmation' || reply.quality === 'correction';
    if (token === 'FALLBACK') return reply.quality === 'unrecognized';
    return reply.intentId === token;
  });
}

it('отчёт по второму набору', () => {
  const lines: string[] = [];
  let pass = 0;
  let total = 0;
  const known = new Set(scenario.intents.map((intent) => intent.id));
  lines.push('=== ОДИНОЧНЫЕ ===');
  cases.single.forEach(([question, expected], index) => {
    const reply = respondIsolated({ text: question, seed: 1, difficulty: 'standard' }, scenario).reply;
    const good = ok(expected, reply);
    total++;
    if (good) pass++;
    const missing = expected.split('|').filter((t) => !['CLARIFY', 'CONFIRM', 'FALLBACK'].includes(t) && !known.has(t));
    if (!good) lines.push(`${index + 1}. ✗ ${question}\n   ждали: ${expected}${missing.length ? ` (нет такого намерения: ${missing.join(',')})` : ''}\n   получили: [${reply.quality}/${reply.intentId ?? '—'}] ${reply.text}`);
  });
  lines.push(`одиночные: ${pass}/${total}`);
  lines.push('=== ДИАЛОГИ ===');
  let dPass = 0;
  let dTotal = 0;
  cases.dialogs.forEach((dialog, d) => {
    let state = createEngineState();
    dialog.forEach(([question, expected], step) => {
      const out = respond(state, { text: question, seed: 1, difficulty: 'standard' }, scenario);
      state = out.state;
      const good = ok(expected, out.reply);
      dTotal++;
      if (good) dPass++;
      if (!good) lines.push(`диалог ${d + 1}, шаг ${step + 1}. ✗ ${question}\n   ждали: ${expected}\n   получили: [${out.reply.quality}/${out.reply.intentId ?? '—'}] ${out.reply.text}`);
    });
  });
  lines.push(`диалоги: ${dPass}/${dTotal}`);
  if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT, lines.join('\n'), 'utf8');
  expect(lines.filter((line) => line.includes('✗')), lines.join('\n')).toEqual([]);
});
