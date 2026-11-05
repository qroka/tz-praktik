import { Check, ChevronRight, Download, FileJson, FileText, Minus, Printer, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { difficultyLabel, downloadFile, progressFileName, toMarkdown, toPlainText, toProgressJson, toResultJson } from '../state/exporters';
import type { Attempt, Scenario } from '../types';
import { formatTime, ProgressBar } from './shared';

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="mark mark--yes"><Check size={14} />да</span>
  ) : (
    <span className="mark mark--no"><Minus size={14} />нет</span>
  );
}

function Foldout(props: { title: string; meta?: string; open: boolean; onToggle: (open: boolean) => void; testId?: string; children: React.ReactNode }) {
  return (
    <details className="foldout" open={props.open} onToggle={(event) => props.onToggle(event.currentTarget.open)} data-testid={props.testId}>
      <summary><ChevronRight size={18} />{props.title}{props.meta && <small>{props.meta}</small>}</summary>
      <div className="foldout__body">{props.children}</div>
    </details>
  );
}

export function ResultScreen({ attempt, scenario }: { attempt: Attempt; scenario: Scenario }) {
  const result = attempt.result!;
  const [open, setOpen] = useState<Record<string, boolean>>({ tz: true });
  const toggle = (key: string) => (value: boolean) => setOpen((prev) => ({ ...prev, [key]: value }));

  // В печатной версии раскрыты все блоки.
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    const before = () => {
      setOpen((prev) => {
        saved = prev;
        return { tz: true, transcript: true, etalon: true };
      });
    };
    const after = () => setOpen(saved);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const metrics = [
    { label: 'Полнота диалога', value: `${result.dialogueCompleteness}%`, percent: result.dialogueCompleteness },
    { label: 'Полнота ТЗ', value: `${result.tzCompleteness}%`, percent: result.tzCompleteness },
    { label: 'Найдено требований', value: String(result.foundRequirements), percent: (result.mandatoryDisclosed / result.mandatoryTotal) * 100 },
  ];

  return (
    <div className="result-scroll">
      <main className="result" data-testid="result">
        <section className="result__hero" aria-label="Итоговая оценка">
          <div className="score" data-testid="score">{result.total}<small> из 100</small></div>
          <div>
            <div className="result__grade">{result.grade}</div>
            <div className="result__who">{attempt.studentName}. Режим: {difficultyLabel(attempt.difficulty).toLowerCase()}. Seed: {attempt.seed}.</div>
            <div className="result__who">{scenario.title}</div>
          </div>
          <div className="result__metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className="metric">
                <div className="metric__value">{metric.value}</div>
                <div className="metric__label">{metric.label}</div>
                <ProgressBar percent={metric.percent} />
              </div>
            ))}
          </div>
        </section>

        <div className="result__exports">
          <button type="button" className="btn" data-testid="export-md" onClick={() => downloadFile('result.md', toMarkdown(attempt, scenario), 'text/markdown')}><FileText size={16} />result.md</button>
          <button type="button" className="btn" data-testid="export-txt" onClick={() => downloadFile('result.txt', toPlainText(attempt, scenario), 'text/plain')}><Download size={16} />result.txt</button>
          <button type="button" className="btn" data-testid="export-json" onClick={() => downloadFile('result.json', toResultJson(attempt, scenario), 'application/json')}><FileJson size={16} />result.json</button>
          <button type="button" className="btn" data-testid="export-progress" onClick={() => downloadFile(progressFileName(attempt), toProgressJson(attempt), 'application/json')}><Save size={16} />Файл прогресса</button>
          <button type="button" className="btn" data-testid="print" onClick={() => window.print()}><Printer size={16} />Печать</button>
        </div>

        <div className="result__columns">
          <div>
            <section className="result__block" data-testid="recommendations">
              <h2>Рекомендации</h2>
              <ul className="plain-list">
                {result.recommendations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
            {result.missedCategories.length > 0 && (
              <section className="result__block" data-testid="missed">
                <h2>Пропущенные категории: {result.missedCategories.length}</h2>
                <ul className="plain-list">
                  {result.missedCategories.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            )}
            <section className="result__block" data-testid="contradictions">
              <h2>Противоречия: {result.contradictions.length}</h2>
              {result.contradictions.length === 0 ? (
                <p className="hint">Значения не расходятся со словами заказчика, отметок о противоречиях нет.</p>
              ) : (
                <ul className="plain-list plain-list--warn">
                  {result.contradictions.map((item, index) => (
                    <li key={`${item.source}-${index}`}>{item.text}<small>{item.source}. {item.detail}</small></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div>
            <section className="result__block">
              <h2>Как сложилась оценка</h2>
              <table className="parts">
                <thead><tr><th>Критерий</th><th>Баллы</th></tr></thead>
                <tbody>
                  {result.parts.map((part) => (
                    <tr key={part.id}>
                      <td>{part.label}<small>{part.note}</small></td>
                      <td>{String(part.score).replace('.', ',')} / {part.max}</td>
                    </tr>
                  ))}
                  {result.penalties.map((item) => (
                    <tr key={item.id}>
                      <td>{item.label}<small>{item.detail}</small></td>
                      <td className="penalty">−{item.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>

        <div className="result__columns">
          <section className="result__block" data-testid="useful-questions">
            <h2>Вопросы, давшие полезную информацию: {result.usefulQuestions.length}</h2>
            {result.usefulQuestions.length === 0 ? (
              <p className="hint">Таких вопросов не было.</p>
            ) : (
              <ul className="plain-list">
                {result.usefulQuestions.map((item) => <li key={item.messageId}>{item.text}{item.note && <small>{item.note}</small>}</li>)}
              </ul>
            )}
          </section>
          <section className="result__block" data-testid="general-questions">
            <h2>Слишком общие вопросы: {result.generalQuestions.length}</h2>
            {result.generalQuestions.length === 0 ? (
              <p className="hint">Вы спрашивали конкретно.</p>
            ) : (
              <ul className="plain-list">
                {result.generalQuestions.map((item) => <li key={item.messageId}>{item.text}{item.note && <small>{item.note}</small>}</li>)}
              </ul>
            )}
          </section>
        </div>

        <div style={{ marginTop: 28 }}>
          <Foldout title="Итоговый текст ТЗ" meta={`Заполнено ${scenario.tzSections.length - result.emptySections.length} из ${scenario.tzSections.length}`} open={Boolean(open.tz)} onToggle={toggle('tz')} testId="final-tz">
            <div className="tz-final">
              {scenario.tzSections.map((section) => {
                const text = (attempt.tz[section.id] ?? '').trim();
                return (
                  <div key={section.id}>
                    <h3>{section.id}. {section.title}</h3>
                    {text ? <p>{text}</p> : <p className="is-empty">Раздел не заполнен.</p>}
                  </div>
                );
              })}
            </div>
          </Foldout>
          <Foldout title="История переписки" meta={`Сообщений: ${attempt.messages.length}`} open={Boolean(open.transcript)} onToggle={toggle('transcript')} testId="transcript">
            <dl className="transcript">
              {attempt.messages.map((message) => (
                <div key={message.id}>
                  <dt>{message.role === 'student' ? attempt.studentName : scenario.customer.name}, {formatTime(message.at)}</dt>
                  <dd>{message.text}</dd>
                </div>
              ))}
            </dl>
          </Foldout>
          <Foldout title="Эталон сведений об объекте" meta={`Сведений: ${result.etalon.length}`} open={Boolean(open.etalon)} onToggle={toggle('etalon')} testId="etalon">
            <p className="hint" style={{ marginBottom: 10 }}>Открывается только после завершения попытки. Сверьте значения со своим ТЗ.</p>
            <div className="etalon-wrap">
              <table className="etalon">
                <thead><tr><th>Раздел</th><th>Сведение и значение</th><th>Тип</th><th>В диалоге</th><th>В реестре</th><th>В ТЗ</th></tr></thead>
                <tbody>
                  {[...result.etalon].sort((a, b) => a.section - b.section).map((row) => (
                    <tr key={row.factId}>
                      <td>{row.section}</td>
                      <td><strong>{row.label}.</strong> {row.value}</td>
                      <td>{row.requirementType === 'mandatory' ? 'Требование' : row.requirementType === 'preference' ? 'Пожелание' : 'Предложение'}</td>
                      <td><Mark yes={row.disclosed} /></td>
                      <td><Mark yes={row.inRegistry} /></td>
                      <td><Mark yes={row.inTz} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Foldout>
        </div>
      </main>
    </div>
  );
}
