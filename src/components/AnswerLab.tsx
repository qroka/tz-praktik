import { CircleAlert, Download, FileJson, Play, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { buildAnswerTemplate, parseAnswerPack } from '../engine/answerPack';
import { createEngineState, respond } from '../engine/dialogueEngine';
import { downloadFile } from '../state/exporters';
import type { StoredPack } from '../state/answerPackStorage';
import type { Difficulty, EngineReply, Scenario } from '../types';
import { Sheet } from './shared';

const QUALITY: Record<EngineReply['quality'], string> = {
  useful: 'Сведения',
  unknown_found: 'Не знает',
  repeat: 'Повтор',
  general: 'Общий вопрос',
  clarify: 'Встречный вопрос',
  unrecognized: 'Не понял',
  correction: 'Поправка',
  confirmation: 'Подтверждение',
  blocked: 'Сначала другое',
  social: 'Реплика',
};

type Row = { question: string; answer: string; topic: string; quality: EngineReply['quality'] };

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Временная панель преподавателя: заменить ответы заказчика файлом и прогнать список вопросов. */
export function AnswerLab(props: {
  base: Scenario;
  scenario: Scenario;
  stored: StoredPack | null;
  onLoad: (pack: StoredPack) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { base, scenario, stored } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>(() => {
    if (!stored) return [];
    const parsed = parseAnswerPack(stored.text, base);
    return parsed.ok ? parsed.warnings : [];
  });
  const [questions, setQuestions] = useState('');
  const [separate, setSeparate] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [rows, setRows] = useState<Row[]>([]);

  const parsedStored = stored ? parseAnswerPack(stored.text, base) : null;
  const summary = parsedStored?.ok ? parsedStored.summary : null;
  const title = parsedStored?.ok ? parsedStored.pack.title : undefined;

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onerror = () => setErrors(['Не удалось прочитать файл.']);
    reader.onload = () => {
      const text = String(reader.result);
      const parsed = parseAnswerPack(text, base);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        setWarnings([]);
        return;
      }
      setErrors([]);
      setWarnings(parsed.warnings);
      setRows([]);
      props.onLoad({ text, fileName: file.name, loadedAt: new Date().toISOString() });
    };
    reader.readAsText(file);
  }

  function run() {
    const list = questions.split('\n').map((line) => line.trim()).filter(Boolean);
    let state = createEngineState();
    const result: Row[] = [];
    for (const question of list) {
      if (separate) state = createEngineState();
      const out = respond(state, { text: question, seed: 1, difficulty }, scenario);
      state = out.state;
      const intent = scenario.intents.find((item) => item.id === out.reply.intentId);
      result.push({ question, answer: out.reply.text, topic: intent?.title ?? '', quality: out.reply.quality });
    }
    setRows(result);
  }

  function exportRows() {
    const lines = [['Вопрос', 'Ответ заказчика', 'Тема', 'Тип'].map(csvCell).join(';')];
    for (const row of rows) lines.push([row.question, row.answer, row.topic, QUALITY[row.quality]].map(csvCell).join(';'));
    // BOM нужен, чтобы Excel открыл кириллицу без «кракозябр».
    downloadFile('proverka-voprosov.csv', `﻿${lines.join('\r\n')}`, 'text/csv');
  }

  return (
    <Sheet title="Ответы заказчика (тест)" side="right" wide onClose={props.onClose}>
      <div className="lab" data-testid="answer-lab">
        <p className="hint">
          Временный инструмент для настройки. Скачайте ответы, поправьте их вручную или с помощью ChatGPT и загрузите обратно.
          Файл действует только в этом браузере, студенты его не видят.
        </p>

        <section className="lab__status" aria-live="polite">
          {stored ? (
            <>
              <div className="lab__state">Загружены тестовые ответы{title ? `: «${title}»` : ''}</div>
              <div className="hint" data-testid="lab-summary">
                Файл {stored.fileName}. Изменено тем: {summary?.changed ?? 0}, новых: {summary?.added ?? 0}, добавлено вопросов: {summary?.questions ?? 0}.
              </div>
            </>
          ) : (
            <div className="lab__state">Сейчас работают исходные ответы</div>
          )}
        </section>

        <div className="lab__actions">
          <button type="button" className="btn" data-testid="lab-template" onClick={() => downloadFile('otvety-zakazchika.json', JSON.stringify(buildAnswerTemplate(scenario, title ?? 'Ответы заказчика'), null, 2), 'application/json')}>
            <Download size={16} />Скачать текущие ответы
          </button>
          <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} />Загрузить файл ответов
          </button>
          {stored && (
            <button type="button" className="btn btn--ghost" data-testid="lab-reset" onClick={() => { props.onReset(); setWarnings([]); setErrors([]); setRows([]); }}>
              <RotateCcw size={16} />Вернуть исходные
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Файл ответов"
            data-testid="lab-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {errors.length > 0 && (
          <div className="lab__messages" role="alert" data-testid="lab-errors">
            <div className="field-error"><CircleAlert size={15} />Файл не загружен. Исправьте:</div>
            <ul>{errors.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        {warnings.length > 0 && (
          <details className="lab__messages" data-testid="lab-warnings">
            <summary className="field-error"><TriangleAlert size={15} />Предупреждения: {warnings.length}. Файл загружен, но стоит проверить</summary>
            <ul>{warnings.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        )}

        <section className="lab__check">
          <h2 className="lab__title">Проверка вопросов</h2>
          <label className="field__label" htmlFor="lab-questions">Вопросы студента, по одному на строку</label>
          <textarea
            id="lab-questions"
            className="textarea"
            rows={6}
            value={questions}
            placeholder={'Здравствуйте!\nКакая температура воды нужна?\nА какое отклонение допустимо?'}
            onChange={(event) => setQuestions(event.target.value)}
          />
          <div className="lab__options">
            <label className="check">
              <input type="checkbox" checked={separate} onChange={(event) => setSeparate(event.target.checked)} />
              Каждый вопрос отдельно, без контекста
            </label>
            <label className="visually-hidden" htmlFor="lab-difficulty">Режим</label>
            <select id="lab-difficulty" className="select lab__select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
              <option value="learning">Учебный</option>
              <option value="standard">Стандартный</option>
              <option value="strict">Строгий</option>
            </select>
            <button type="button" className="btn btn--primary" data-testid="lab-run" disabled={!questions.trim()} onClick={run}>
              <Play size={16} />Проверить
            </button>
          </div>

          {rows.length > 0 && (
            <>
              <ol className="lab__rows" data-testid="lab-rows">
                {rows.map((row, index) => (
                  <li key={`${index}-${row.question}`} className="lab__row" data-quality={row.quality}>
                    <div className="lab__q">{row.question}</div>
                    <div className="lab__a">{row.answer}</div>
                    <div className="lab__meta">{QUALITY[row.quality]}{row.topic ? ` · ${row.topic}` : ''}</div>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn" onClick={exportRows}><FileJson size={16} />Скачать таблицу (Excel)</button>
            </>
          )}
        </section>
      </div>
    </Sheet>
  );
}
