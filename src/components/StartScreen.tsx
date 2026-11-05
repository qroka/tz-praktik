import { CircleAlert, Upload } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { hiddenRequirementCount } from '../engine/factTracker';
import { newSeed } from '../state/attempt';
import type { Difficulty, Scenario } from '../types';

const LEVELS: { id: Difficulty; name: string; text: string }[] = [
  { id: 'learning', name: 'Учебный', text: 'Показывает направления, которые ещё не исследованы, но не готовые вопросы.' },
  { id: 'standard', name: 'Стандартный', text: 'Вопросы только ваши. Виден прогресс по категориям.' },
  { id: 'strict', name: 'Строгий', text: 'Без подсказок и без счётчика невыясненных фактов до конца задания.' },
];

export function StartScreen(props: {
  scenario: Scenario;
  onStart: (name: string, difficulty: Difficulty, seed: number) => void;
  onImport: (file: File) => void;
  importError: string | null;
}) {
  const { scenario } = props;
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [seed, setSeed] = useState('');
  const [nameError, setNameError] = useState(false);
  const [seedError, setSeedError] = useState(false);
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    const raw = seed.trim();
    if (raw && !/^\d{1,9}$/.test(raw)) {
      setSeedError(true);
      return;
    }
    props.onStart(name, difficulty, raw ? Number(raw) : newSeed());
  }

  return (
    <main className="start">
      <div>
        <h1 className="start__title">ТЗ Практикум</h1>
        <p className="start__lead">
          Вы инженер по автоматизации. Заказчик знает об объекте всё, но отвечает только на заданный вопрос. Расспросите его, отделите
          требования от пожеланий и составьте техническое задание.
        </p>
        <section className="start__case" aria-label="Учебный кейс">
          <h2 className="start__case-title">{scenario.title}</h2>
          <p>{scenario.subtitle}</p>
          <dl className="start__facts">
            <div className="start__fact"><dt>минут на работу</dt><dd>≈{scenario.estimatedMinutes}</dd></div>
            <div className="start__fact"><dt>тем для исследования</dt><dd>{scenario.categories.length}</dd></div>
            <div className="start__fact"><dt>скрытых требований</dt><dd>{hiddenRequirementCount(scenario)}</dd></div>
          </dl>
        </section>
        <div className="start__sample" aria-hidden="true">
          <div className="msg msg--student"><div className="bubble">Расскажите всё про установку.</div></div>
          <div className="msg msg--customer"><div className="bubble">Всё сразу я и не перескажу. Спрашивайте по пунктам.</div></div>
        </div>
      </div>

      <form className="start__form" onSubmit={submit} noValidate>
        <div className="start__form-title">Новая попытка</div>
        <div className="field">
          <label className="field__label" htmlFor={nameId}>Имя студента</label>
          <input
            ref={nameRef}
            id={nameId}
            className="input"
            value={name}
            autoComplete="name"
            maxLength={80}
            aria-invalid={nameError}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) setNameError(false);
            }}
          />
          {nameError && (
            <div id={`${nameId}-error`} className="field-error" role="alert"><CircleAlert size={15} />Укажите имя: оно попадёт в итоговый документ.</div>
          )}
        </div>
        <fieldset className="levels">
          <legend>Сложность</legend>
          {LEVELS.map((level) => (
            <label key={level.id} className="level">
              <input type="radio" name="difficulty" value={level.id} checked={difficulty === level.id} onChange={() => setDifficulty(level.id)} />
              <span className="level__name">{level.name}</span>
              <span className="level__text">{level.text}</span>
            </label>
          ))}
        </fieldset>
        <details className="start__seed">
          <summary>Номер попытки (seed)</summary>
          <div className="field">
            <label className="visually-hidden" htmlFor={`${nameId}-seed`}>Номер попытки</label>
            <input
              id={`${nameId}-seed`}
              className="input"
              inputMode="numeric"
              placeholder="Случайный"
              value={seed}
              aria-invalid={seedError}
              onChange={(event) => {
                setSeed(event.target.value);
                setSeedError(false);
              }}
            />
            {seedError ? (
              <div className="field-error" role="alert"><CircleAlert size={15} />Нужно целое число, не больше девяти цифр.</div>
            ) : (
              <span className="hint">Один и тот же номер воспроизводит те же ответы заказчика.</span>
            )}
          </div>
        </details>
        <button type="submit" className="btn btn--primary btn--large">Начать диалог</button>
        <div className="start__secondary">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => fileRef.current?.click()}>
            <Upload size={15} />Загрузить файл прогресса
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Файл прогресса"
            data-testid="start-import"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onImport(file);
              event.target.value = '';
            }}
          />
        </div>
        {props.importError && <div className="field-error" role="alert"><CircleAlert size={15} />{props.importError}</div>}
      </form>
    </main>
  );
}
