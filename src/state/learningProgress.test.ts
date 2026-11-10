import { describe, expect, it } from 'vitest';
import { scenario } from '../data/scenario';
import { createAttempt, sendQuestion } from './attempt';
import { buildHint, summarizeProgress } from './learningProgress';

const fresh = () => createAttempt(scenario, 'Анна', 'learning', 7);

describe('summarizeProgress', () => {
  it('на старте охват 0% без деления на ноль', () => {
    const summary = summarizeProgress(scenario, fresh(), []);
    expect(summary.coveragePercent).toBe(0);
    expect(summary.all).toBe(scenario.categories.length);
    expect(summary.remaining).toBe(summary.all);
    expect(summary.rows.every((row) => row.status === 'none')).toBe(true);
  });

  it('считает охват по категориям с found > 0', () => {
    const attempt = sendQuestion(fresh(), scenario, 'Какая температура воды нужна после теплообменника?').attempt;
    const summary = summarizeProgress(scenario, attempt, attempt.engine.disclosed);
    const explored = summary.rows.filter((row) => row.found > 0).length;
    expect(explored).toBeGreaterThan(0);
    expect(summary.explored).toBe(explored);
    expect(summary.coveragePercent).toBe(Math.round((explored / summary.all) * 100));
    expect(summary.questions).toBe(1);
  });

  it('статус «готово» только при полном раскрытии категории', () => {
    const category = scenario.categories[0];
    const ids = scenario.facts.filter((fact) => fact.category === category.id).map((fact) => fact.id);
    const partial = summarizeProgress(scenario, fresh(), ids.slice(0, 1));
    const full = summarizeProgress(scenario, fresh(), ids);
    expect(partial.rows[0].status).toBe(ids.length > 1 ? 'partial' : 'done');
    expect(full.rows[0].status).toBe('done');
  });
});

describe('buildHint', () => {
  it('подсказка не содержит значений нераскрытых фактов', () => {
    const attempt = fresh();
    const summary = summarizeProgress(scenario, attempt, []);
    const hint = buildHint(scenario, attempt, summary.rows, attempt.messages)!;
    const text = `${hint.title} ${hint.text}`;
    for (const fact of scenario.facts.filter((item) => item.claim)) {
      for (const value of fact.claim!.values) expect(text).not.toMatch(new RegExp(`(^|\D)${String(value).replace('.', ',')}(\D|$)`));
    }
  });

  it('не выдаёт подсказок после завершения', () => {
    const attempt = { ...fresh(), finishedAt: new Date().toISOString() };
    expect(buildHint(scenario, attempt, summarizeProgress(scenario, attempt, []).rows, attempt.messages)).toBeNull();
  });
});
