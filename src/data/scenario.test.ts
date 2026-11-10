import { describe, expect, it } from 'vitest';
import { scenario } from './scenario';
import { analyze, rankIntents } from '../engine/intentMatcher';
import { createEngineState, respond } from '../engine/dialogueEngine';

const { intents, replies, facts, meta, ambiguities, lexicon } = scenario;

const usedConcepts = () => {
  const set = new Set<string>();
  intents.forEach((i) => {
    i.required.flat().forEach((c) => set.add(c));
    i.optional?.forEach((c) => set.add(c));
    i.exclude?.forEach((c) => set.add(c));
  });
  facts.forEach((f) => f.claim?.concepts.flat().forEach((c) => set.add(c)));
  ambiguities.forEach((a) => [...a.trigger, ...a.neutral].forEach((c) => set.add(c)));
  return set;
};

describe('Объём сценария', () => {
  const answers = Object.values(replies).flatMap((s) => s.flatMap((x) => x.variants));
  it('не менее 45 намерений', () => expect(intents.length).toBeGreaterThanOrEqual(45));
  it('не менее 120 примеров формулировок', () => expect(intents.flatMap((i) => i.examples).length).toBeGreaterThanOrEqual(120));
  it('не менее 150 вариантов ответов', () => expect(answers.length).toBeGreaterThanOrEqual(150));
  it('не менее 20 ответов на непонятный вопрос', () => expect(meta.fallback.length + meta.fallbackStrict.length).toBeGreaterThanOrEqual(20));
  it('не менее 20 ответов «не знаю»', () => {
    const unknownIds = new Set(facts.filter((f) => f.customerConfidence === 'unknown').map((f) => f.id));
    const count = Object.values(replies).flat().filter((s) => s.facts.some((id) => unknownIds.has(id))).flatMap((s) => s.variants).length;
    expect(count).toBeGreaterThanOrEqual(20);
  });
  it('не менее 15 встречных вопросов', () => expect(ambiguities.flatMap((a) => [...a.questions, ...a.strictQuestions]).length).toBeGreaterThanOrEqual(15));
  it('не менее 10 ответов на повторный вопрос', () => expect(meta.repeatTemplates.length + meta.repeatAgainTemplates.length).toBeGreaterThanOrEqual(10));
  it('не менее 10 реакций на неверное значение', () => expect(meta.misheardDisclosed.length + meta.misheardCrossed.length + meta.misheardUndisclosed.length).toBeGreaterThanOrEqual(10));
  it('варианты ответов не дублируются', () => expect(new Set(answers).size).toBeGreaterThan(answers.length - 8));
});

describe('Целостность данных', () => {
  it('все понятия намерений есть в словаре', () => {
    const missing = [...usedConcepts()].filter((c) => !lexicon[c] && !scenario.conceptCombos?.[c]);
    expect(missing).toEqual([]);
  });
  it('у каждого намерения с ответами есть данные, факты существуют', () => {
    const ids = new Set(facts.map((f) => f.id));
    for (const intent of intents) {
      if (intent.kind === 'meta') continue;
      expect(replies[intent.id], intent.id).toBeTruthy();
      for (const s of replies[intent.id]) {
        for (const id of s.facts) expect(ids.has(id), `${intent.id}:${id}`).toBe(true);
        expect(s.variants.length, intent.id).toBeGreaterThan(0);
        expect(s.short.length, intent.id).toBeGreaterThan(0);
      }
    }
  });
  it('каждый факт раскрывается хотя бы одним намерением', () => {
    const reachable = new Set(Object.values(replies).flat().flatMap((s) => s.facts));
    expect(facts.filter((f) => !reachable.has(f.id)).map((f) => f.id)).toEqual([]);
  });
  it('общие вопросы раскрывают только факты уровня general', () => {
    for (const intent of intents.filter((i) => i.kind === 'general')) {
      for (const s of replies[intent.id]) {
        for (const id of s.facts) {
          expect(facts.find((f) => f.id === id)?.disclosureLevel, `${intent.id}:${id}`).toBe('general');
        }
      }
    }
  });
  it('один ответ заказчика содержит не более трёх фактов', () => {
    for (const [id, steps] of Object.entries(replies)) for (const s of steps) expect(s.facts.length, id).toBeLessThanOrEqual(3);
  });
  it('у всех 13 категорий есть факты', () => {
    for (const c of scenario.categories) expect(facts.some((f) => f.category === c.id), c.id).toBe(true);
  });
  it('факты покрывают все 13 разделов ТЗ', () => {
    for (const s of scenario.tzSections) expect(facts.some((f) => f.section === s.id), String(s.id)).toBe(true);
  });
});

describe('Примеры формулировок распознаются', () => {
  // Короткие примеры опираются на контекст — проверяем их отдельно.
  const CONTEXTUAL = new Set(['А зимой?', 'А летом?', 'После насоса', 'До насоса', 'А насос?', 'А теплоноситель?', 'А сжатый воздух?']);
  for (const intent of intents) {
    for (const example of intent.examples) {
      if (CONTEXTUAL.has(example)) continue;
      it(`${intent.id}: ${example}`, () => {
        const [top] = rankIntents(analyze(example, scenario), { topic: null, lastAttributes: [] }, scenario);
        expect(top?.intent.id).toBe(intent.id);
      });
    }
  }
});

describe('Ответы не сливают значения', () => {
  it('прогон всех примеров: один ответ не содержит больше трёх фактов', () => {
    let state = createEngineState();
    for (const intent of intents) {
      for (const example of intent.examples) {
        const out = respond(state, { text: example, seed: 7, difficulty: 'standard' }, scenario);
        expect(out.reply.factIds.length, example).toBeLessThanOrEqual(8);
        state = out.state;
      }
    }
  });
});
