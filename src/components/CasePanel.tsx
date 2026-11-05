import { categoryProgress } from '../engine/factTracker';
import type { Attempt, Scenario } from '../types';
import { ProgressBar } from './shared';

export function CasePanel(props: { attempt: Attempt; scenario: Scenario; disclosed: string[] }) {
  const { attempt, scenario, disclosed } = props;
  const progress = categoryProgress(scenario, disclosed);
  const questions = attempt.messages.filter((message) => message.role === 'student').length;
  const open = progress.filter((item) => item.found === 0);
  const showProgress = attempt.difficulty !== 'strict' || attempt.result;

  return (
    <div className="case">
      <section>
        <div className="case__title">{scenario.title}</div>
        <p className="case__brief">{scenario.publicBrief}</p>
        <p className="case__person">Ваша роль: инженер по автоматизации.</p>
      </section>

      <section className="stats" aria-label="Ход работы">
        <div><span className="stat__value" data-testid="questions-count">{questions}</span><span className="stat__label">вопросов</span></div>
        <div><span className="stat__value" data-testid="requirements-count">{attempt.requirements.length}</span><span className="stat__label">в реестре</span></div>
      </section>

      {attempt.difficulty === 'learning' && !attempt.result && open.length > 0 && (
        <section>
          <div className="section-label">Ещё не исследовано</div>
          <ul className="directions" data-testid="directions">
            {open.slice(0, 4).map((item) => (
              <li key={item.id}><strong>{item.title}</strong>{item.direction}</li>
            ))}
          </ul>
        </section>
      )}

      {showProgress ? (
        <section>
          <div className="section-label">Прогресс по категориям</div>
          <ul className="progress-list" data-testid="progress">
            {progress.map((item) => (
              <li key={item.id} className="progress-row">
                <span className="progress-row__name">{item.title}</span>
                <span className="progress-row__count">{item.found}/{item.total}</span>
                <ProgressBar percent={(item.found / item.total) * 100} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section>
          <div className="section-label">Строгий режим</div>
          <p className="hint" style={{ marginTop: 6 }}>Прогресс и подсказки скрыты до завершения задания. Опирайтесь на собственный план обследования.</p>
        </section>
      )}
    </div>
  );
}
