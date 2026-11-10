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

  it('главный показатель — доля обязательных сведений, затронутые темы — отдельно', () => {
    const attempt = sendQuestion(fresh(), scenario, 'Какая температура воды нужна после теплообменника?').attempt;
    const summary = summarizeProgress(scenario, attempt, attempt.engine.disclosed);
    const explored = summary.rows.filter((row) => row.found > 0).length;
    const mandatory = scenario.facts.filter((fact) => fact.requirementType === 'mandatory');
    const found = mandatory.filter((fact) => attempt.engine.disclosed.includes(fact.id)).length;
    expect(explored).toBeGreaterThan(0);
    expect(summary.explored).toBe(explored);
    expect(summary.mandatoryTotal).toBe(mandatory.length);
    expect(summary.mandatoryFound).toBe(found);
    expect(summary.coveragePercent).toBe(Math.round((found / mandatory.length) * 100));
    expect(summary.touchedPercent).toBe(Math.round((explored / summary.all) * 100));
    expect(summary.questions).toBe(1);
  });

  it('пример аудита: 46 из 86 обязательных — 53%, а не «85% тем»', () => {
    const mandatory = scenario.facts.filter((fact) => fact.requirementType === 'mandatory');
    // По одному сведению в каждой теме: тем затронуто много, обязательных выяснено мало.
    const onePerCategory = scenario.categories.map((c) => scenario.facts.find((f) => f.category === c.id)!.id);
    const summary = summarizeProgress(scenario, fresh(), onePerCategory);
    expect(summary.touchedPercent).toBe(100);
    expect(summary.coveragePercent).toBeLessThan(25);
    const ids = mandatory.slice(0, 46).map((fact) => fact.id);
    expect(summarizeProgress(scenario, fresh(), ids).coveragePercent).toBe(Math.round((46 / mandatory.length) * 100));
  });

  it('«выяснено» — только когда получены все обязательные сведения темы', () => {
    const protection = scenario.facts.filter((fact) => fact.category === 'protection');
    const mandatory = protection.filter((fact) => fact.requirementType === 'mandatory').map((fact) => fact.id);
    const row = (ids: string[]) => summarizeProgress(scenario, fresh(), ids).rows.find((item) => item.id === 'protection')!;
    expect(row(mandatory.slice(0, 1)).status).toBe('partial');
    expect(row(mandatory.slice(0, -1)).status).toBe('partial');
    expect(row(mandatory).status).toBe('done');
  });

  it('тема без обязательных сведений не делит на ноль и не искажает общий процент', () => {
    const summary = summarizeProgress(scenario, fresh(), []);
    for (const row of summary.rows) expect(Number.isFinite(row.percent)).toBe(true);
    const docs = summary.rows.find((item) => item.id === 'docs')!;
    expect(docs.mandatoryTotal).toBe(0);
    const withDocs = summarizeProgress(scenario, fresh(), ['unk_doc_list']);
    expect(withDocs.coveragePercent).toBe(0);
    expect(withDocs.rows.find((item) => item.id === 'docs')!.status).toBe('done');
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
