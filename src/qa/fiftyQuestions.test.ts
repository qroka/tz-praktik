// Приёмка: 50 вопросов студента, каждый проверяется на понятность ответа исполнителю.
// Прогон идёт в двух режимах (как в панели «Ответы заказчика»): с контекстом диалога и каждый вопрос отдельно.
import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import { createEngineState, respond, respondIsolated } from '../engine/dialogueEngine';
import type { EngineReply } from '../types';
import { QUESTIONS_50 } from './questions50';

type Check = { re?: RegExp[]; not?: RegExp[]; quality?: EngineReply['quality'][]; ctxOnly?: boolean };

const R = (s: string) => new RegExp(s, 'i');

// Ожидания по номерам вопросов (1..50). re — всё должно встретиться, not — не должно.
const EXPECT: Record<number, { ctx: Check; alone?: Check }> = {
  1: { ctx: { re: [R('режим|автоматик'), R('нет|вручн|руками')], not: [R('^да')] } },
  2: { ctx: { re: [R('авто'), R('ручн'), R('обслужив')] } },
  3: { ctx: { re: [R('нет|не автомат|автоматики\s+(как таковой\s+)?нет|вручн|руками')], not: [R('^(да|конечно)')] } },
  4: { ctx: { re: [R('температур'), R('давлен'), R('вручн|руками')] } },
  5: { ctx: { quality: ['clarify'], re: [R('сейчас'), R('предусмотр|автоматизац')] } },
  6: { ctx: { re: [R('авто'), R('ручн'), R('обслужив')] } },
  7: { ctx: { re: [R('оператор'), R('следит|подстраив|регулир|руками|вручн|корректир')] } },
  8: { ctx: { re: [R('температур'), R('без|сам|не придётся|не придется|не должн')] } },
  9: { ctx: { re: [R('ничего|не автоматизирован|нет')] } },
  10: { ctx: { re: [R('температур'), R('давлен')] } },
  11: { ctx: { re: [R('теплообмен'), R('насос')] } },
  12: { ctx: { re: [R('прибор|перечн|на объекте')] } },
  13: { ctx: { re: [R('насос'), R('клапан|исполнител|на объекте')] } },
  14: { ctx: { re: [R('контроллер|датчик|клапан|частот'), R('промышлен')] } },
  15: { ctx: { re: [R('центробеж')] } },
  16: { ctx: { re: [R('2,2')] } },
  17: { ctx: { re: [R('не уточн|проверить на объекте')] } },
  18: { ctx: { re: [R('частот')] } },
  19: { ctx: { re: [R('пластинч')] } },
  20: { ctx: { re: [R('0,4'), R('0,6')] } },
  21: { ctx: { re: [R('температур'), R('давлен')], not: [R('^(хотим|цель)')] } },
  22: { ctx: { re: [R('60')] } },
  23: { ctx: { re: [R('10')] } },
  24: { ctx: { re: [R('20'), R('25')] }, alone: { quality: ['clarify'], re: [R('[?]')], not: [R('говорим о разном')] } },
  25: { ctx: { re: [R('±2|два|2 градус|двух')], not: [R('рано')] } },
  26: { ctx: { re: [R('75')] } },
  27: { ctx: { re: [R('1,5|полутора'), R('4|четыр')] } },
  28: { ctx: { re: [R('0,8')] } },
  29: { ctx: { re: [R('0,15'), R('0,25')] } },
  30: { ctx: { re: [R('0,3')] }, alone: { quality: ['clarify'], re: [R('[?]')], not: [R('говорим о разном')] } },
  31: { ctx: { re: [R('0,6')] } },
  32: { ctx: { quality: ['clarify'], re: [R('давлен')] } },
  33: { ctx: { re: [R('нагрев')], not: [R('пусть оператор')] } },
  34: { ctx: { re: [R('во всех режимах|любом|всех|всегда|ни в каком')] } },
  35: { ctx: { re: [R('клапан'), R('авари')] } },
  36: { ctx: { re: [R('температур'), R('давлен')] } },
  37: { ctx: { re: [R('журнал')] } },
  38: { ctx: { re: [R('уставк|температур'), R('опасн|безопасн|пределах')] } },
  39: { ctx: { re: [R('400'), R('230|50')] } },
  40: { ctx: { re: [R('24')] } },
  41: { ctx: { re: [R('контроллер|модел'), R('предложите|проектиров')] } },
  42: { ctx: { re: [R('не знаю|назвать не могу|не подскажу|не скажу'), R('подберите|смотрите|согласу|обоснуйте|предложите')] } },
  43: { ctx: { re: [R('кабел')] } },
  44: { ctx: { re: [R('предложите|согласуйте')] } },
  45: { ctx: { re: [R('по пунктам|по параметрам|по отдельным|конкретн|спрашивайте')], quality: ['general'] } },
  46: { ctx: { quality: ['clarify'], re: [R('[?]')] } },
  47: { ctx: { quality: ['clarify'], re: [R('давлен')] } },
  48: { ctx: { re: [R('вручн|автоматик|оператор|руками')], quality: ['repeat', 'confirmation', 'useful'] } },
  49: { ctx: { re: [R('центробеж|насос')] } },
  50: { ctx: { re: [R('пожалуйста|спрашивайте|что ещё|хорошо')], not: [R('рад помочь')] } },
};

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const BAD = new Set<EngineReply['quality']>(['unrecognized', 'repeat', 'blocked']);

function runAll(mode: 'ctx' | 'alone', seed: number) {
  let state = createEngineState();
  return QUESTIONS_50.map((text) => {
    if (mode === 'alone') return respondIsolated({ text, seed, difficulty: 'standard' }, scenario).reply;
    const out = respond(state, { text, seed, difficulty: 'standard' }, scenario);
    state = out.state;
    return out.reply;
  });
}

function verify(reply: EngineReply, check: Check): string[] {
  const problems: string[] = [];
  const text = reply.text;
  for (const re of check.re ?? []) if (!re.test(text)) problems.push(`нет ${re}`);
  for (const re of check.not ?? []) if (re.test(text)) problems.push(`лишнее ${re}`);
  if (check.quality && !check.quality.includes(reply.quality)) problems.push(`тип ${reply.quality}, ждали ${check.quality.join('/')}`);
  if (!check.quality && BAD.has(reply.quality)) problems.push(`тип ${reply.quality}`);
  return problems;
}

describe.each([['ctx' as const, 'с контекстом'], ['alone' as const, 'каждый вопрос отдельно']])('50 вопросов: %s', (mode, title) => {
  it.each(QUESTIONS_50.map((q, i) => [i + 1, q] as const))(`${title} — %i. %s`, (n) => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const reply = runAll(mode, seed)[n - 1];
      const spec = EXPECT[n];
      const check = mode === 'alone' && spec.alone ? spec.alone : spec.ctx;
      const problems = verify(reply, check);
      if (problems.length) failures.push(`seed ${seed}: ${problems.join('; ')} → «${reply.text}»`);
    }
    expect(failures, failures.slice(0, 3).join('\n')).toEqual([]);
  });

  it('разные вопросы про «как сейчас» получают разные ответы', () => {
    for (const seed of SEEDS) {
      const replies = runAll(mode, seed);
      const pick = (...nums: number[]) => nums.map((k) => replies[k - 1].text);
      // Без контекста вопросы 4 и 10 об одном и том же и вправе совпасть; с контекстом второй получает другую формулировку.
      const asks = mode === 'ctx' ? pick(1, 3, 4, 7, 9, 10) : pick(1, 3, 4, 7, 9);
      for (const group of [asks, pick(11, 12, 13), ...(mode === 'ctx' ? [pick(2, 6)] : [])]) {
        expect(new Set(group).size, `seed ${seed}: ${group.join(' | ')}`).toBe(group.length);
      }
    }
  });

  it('ни один ответ не обрезан до одного слова и не начинается с «Повторю/Напомню»', () => {
    for (const seed of SEEDS) {
      runAll(mode, seed).forEach((reply, index) => {
        // 48-й вопрос — тот же вопрос, что 1-й (с опечатками): короткий повтор там уместен.
        if (mode === 'ctx' && index === 47) return;
        expect(reply.text.length, `seed ${seed}, вопрос ${index + 1}`).toBeGreaterThan(20);
        expect(reply.text, `seed ${seed}, вопрос ${index + 1}`).not.toMatch(/^(Повторю|Напомню|Если кратко|По этому)/);
      });
    }
  });
});
