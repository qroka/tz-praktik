// Учёт раскрытых фактов и прогресса по категориям.
import type { EngineState, Scenario, ScenarioFact } from '../types';

export const isDisclosed = (state: EngineState, factId: string): boolean => state.disclosed.includes(factId);

export function factById(scenario: Scenario, factId: string): ScenarioFact | undefined {
  return scenario.facts.find((fact) => fact.id === factId);
}

export function discloseFacts(state: EngineState, factIds: string[]): EngineState {
  const fresh = factIds.filter((id) => !state.disclosed.includes(id));
  return fresh.length ? { ...state, disclosed: [...state.disclosed, ...fresh] } : state;
}

/** Предпосылки факта, которые ещё не раскрыты. */
export function missingPrerequisites(state: EngineState, fact: ScenarioFact): string[] {
  return (fact.prerequisites ?? []).filter((id) => !isDisclosed(state, id));
}

export type CategoryProgress = { id: string; title: string; direction: string; found: number; total: number };

export function categoryProgress(scenario: Scenario, disclosed: string[]): CategoryProgress[] {
  return scenario.categories.map((category) => {
    const facts = scenario.facts.filter((fact) => fact.category === category.id);
    return {
      id: category.id,
      title: category.title,
      direction: category.direction,
      total: facts.length,
      found: facts.filter((fact) => disclosed.includes(fact.id)).length,
    };
  });
}

export function hiddenRequirementCount(scenario: Scenario): number {
  return scenario.facts.filter((fact) => fact.requirementType === 'mandatory').length;
}
