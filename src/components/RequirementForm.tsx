import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Scenario } from '../types';

export type RequirementDraft = { text: string; category: string; needsClarification: boolean };

/** Форма требования: используется при фиксации из чата, ручном добавлении и редактировании. */
export function RequirementForm(props: {
  scenario: Scenario;
  initial: RequirementDraft;
  submitLabel: string;
  hint?: string;
  autoSelect?: boolean;
  onSubmit: (draft: RequirementDraft) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(props.initial.text);
  const [category, setCategory] = useState(props.initial.category);
  const [clarify, setClarify] = useState(props.initial.needsClarification);
  const [errors, setErrors] = useState<{ text?: boolean; category?: boolean }>({});
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Форма открывается целиком: кнопка сохранения не должна оставаться за краем.
    rootRef.current?.scrollIntoView({ block: 'nearest' });
    textRef.current?.focus({ preventScroll: true });
    if (props.autoSelect) textRef.current?.select();
    // Фокус ставится один раз при открытии формы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const next = { text: !text.trim(), category: !category };
    setErrors(next);
    if (next.text) {
      textRef.current?.focus();
      return;
    }
    if (next.category) return;
    props.onSubmit({ text: text.trim(), category, needsClarification: clarify });
  }

  return (
    <div ref={rootRef} className="capture" data-testid="requirement-form">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-text`}>Формулировка требования</label>
        <textarea
          ref={textRef}
          id={`${id}-text`}
          className="textarea"
          rows={3}
          value={text}
          aria-invalid={Boolean(errors.text)}
          onChange={(event) => {
            setText(event.target.value);
            if (event.target.value.trim()) setErrors((prev) => ({ ...prev, text: false }));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
          }}
        />
        {errors.text ? (
          <div className="field-error" role="alert"><CircleAlert size={15} />Требование не может быть пустым.</div>
        ) : (
          props.hint && <span className="hint">{props.hint}</span>
        )}
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-category`}>Категория</label>
        <select
          id={`${id}-category`}
          className="select"
          value={category}
          aria-invalid={Boolean(errors.category)}
          onChange={(event) => {
            setCategory(event.target.value);
            setErrors((prev) => ({ ...prev, category: false }));
          }}
        >
          <option value="">Выберите категорию</option>
          {props.scenario.categories.map((item) => (
            <option key={item.id} value={item.id}>{item.title}</option>
          ))}
        </select>
        {errors.category && <div className="field-error" role="alert"><CircleAlert size={15} />Выберите категорию.</div>}
      </div>
      <div className="capture__foot">
        <label className="check">
          <input type="checkbox" checked={clarify} onChange={(event) => setClarify(event.target.checked)} />
          Требует уточнения
        </label>
        <button type="button" className="btn" onClick={props.onCancel}>Отмена</button>
        <button type="button" className="btn btn--primary" onClick={submit}>{props.submitLabel}</button>
      </div>
    </div>
  );
}
