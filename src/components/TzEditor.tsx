import { ArrowLeft, ArrowRight, Check, ClipboardList, ListPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { moveRequirementsToSection, setTzText } from '../state/attempt';
import type { Attempt, Scenario } from '../types';
import { Sheet, type Layout } from './shared';

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function RequirementPicker(props: {
  attempt: Attempt;
  scenario: Scenario;
  sectionId: number;
  onMove: (ids: string[]) => void;
}) {
  const { attempt, scenario, sectionId } = props;
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const section = scenario.tzSections.find((item) => item.id === sectionId)!;

  useEffect(() => {
    setPicked([]);
  }, [sectionId]);

  const list = attempt.requirements.filter((item) => showAll || section.categories.includes(item.category));
  const categoryTitle = (id: string) => scenario.categories.find((item) => item.id === id)?.title ?? '';

  return (
    <aside className="tz-side" aria-label="Требования для переноса">
      <div className="tz-side__head">
        <h2 className="tz-side__title">Из реестра</h2>
        <label className="check tz-side__toggle">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Показать все категории
        </label>
      </div>
      {list.length === 0 ? (
        <div className="tz-side__list">
          <div className="empty" data-testid="picker-empty">
            <ClipboardList size={24} />
            <strong>{attempt.requirements.length ? 'Для этого раздела записей нет' : 'Реестр пуст'}</strong>
            {attempt.requirements.length ? 'Включите показ всех категорий или пишите текст сами.' : 'Вернитесь к диалогу и зафиксируйте ответы заказчика.'}
          </div>
        </div>
      ) : (
        <ul className="tz-side__list">
          {list.map((item) => (
            <li key={item.id}>
              <label className="pick">
                <input
                  type="checkbox"
                  checked={picked.includes(item.id)}
                  onChange={() => setPicked((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))}
                />
                <span className="pick__text">{item.text}</span>
                <span className="pick__meta">
                  {categoryTitle(item.category)}
                  {item.movedToSections?.length ? ` · перенесено в раздел ${item.movedToSections.join(', ')}` : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="tz-side__foot">
        <button
          type="button"
          className="btn"
          disabled={picked.length === 0}
          onClick={() => {
            props.onMove(picked);
            setPicked([]);
          }}
        >
          <ListPlus size={16} />Перенести в раздел {sectionId}{picked.length ? `: ${picked.length}` : ''}
        </button>
      </div>
    </aside>
  );
}

export function TzEditor(props: {
  attempt: Attempt;
  scenario: Scenario;
  layout: Layout;
  onChange: (update: (attempt: Attempt) => Attempt) => void;
  onFinish: () => void;
}) {
  const { attempt, scenario, layout, onChange } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const sectionId = attempt.activeSection;
  const section = scenario.tzSections.find((item) => item.id === sectionId) ?? scenario.tzSections[0];
  const text = attempt.tz[section.id] ?? '';
  const filled = scenario.tzSections.filter((item) => words(attempt.tz[item.id] ?? '') > 0).length;
  const total = scenario.tzSections.length;

  const go = (id: number) => onChange((current) => ({ ...current, activeSection: id }));

  const move = (ids: string[]) => {
    onChange((current) => moveRequirementsToSection(current, section.id, ids));
    setPickerOpen(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const picker = <RequirementPicker attempt={attempt} scenario={scenario} sectionId={section.id} onMove={move} />;

  return (
    <div className="tz-layout" data-layout={layout}>
      {layout !== 'compact' && (
        <nav className="tz-nav" aria-label="Разделы технического задания">
          <div className="tz-nav__head">
            <span className="section-label">Разделы ТЗ</span>
            <span className="hint" data-testid="tz-filled">{filled} из {total}</span>
          </div>
          <ol className="tz-nav__list">
            {scenario.tzSections.map((item) => {
              const done = words(attempt.tz[item.id] ?? '') > 0;
              return (
                <li key={item.id}>
                  <button type="button" className="tz-nav__item" aria-current={item.id === section.id ? 'true' : undefined} onClick={() => go(item.id)}>
                    <span className="tz-nav__num">{item.id}</span>
                    <span>{item.title}</span>
                    {done ? (
                      <span className="tz-nav__check"><Check size={16} aria-hidden="true" /><span className="visually-hidden">заполнен</span></span>
                    ) : <span />}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <section className="tz-editor" aria-label={`Раздел ${section.id}`}>
        <div className="tz-editor__head">
          <div className="tz-editor__eyebrow">Раздел {section.id} из {total}</div>
          <h1 className="tz-editor__title">{section.title}</h1>
          <div className="tz-editor__select field">
            <label className="visually-hidden" htmlFor="tz-section-select">Раздел ТЗ</label>
            <select id="tz-section-select" className="select" value={section.id} onChange={(event) => go(Number(event.target.value))}>
              {scenario.tzSections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}. {item.title}{words(attempt.tz[item.id] ?? '') > 0 ? ' (заполнен)' : ''}
                </option>
              ))}
            </select>
          </div>
          {attempt.difficulty === 'learning' && <p className="tz-editor__hint" data-testid="tz-hint">{section.hint}</p>}
        </div>
        <label className="visually-hidden" htmlFor="tz-text">Текст раздела: {section.title}</label>
        <textarea
          ref={areaRef}
          id="tz-text"
          key={section.id}
          className="textarea tz-editor__area"
          placeholder="Сформулируйте требования своими словами: что система должна делать, какие значения, при каких условиях."
          value={text}
          onChange={(event) => onChange((current) => setTzText(current, section.id, event.target.value))}
        />
        <div className="tz-editor__foot">
          <span className="tz-editor__count">Слов: {words(text)}{layout === 'compact' ? ` · заполнено ${filled} из ${total}` : ''}</span>
          {layout !== 'wide' && (
            <button type="button" className="btn" onClick={() => setPickerOpen(true)} data-testid="open-picker"><ClipboardList size={16} />Из реестра</button>
          )}
          <button type="button" className="btn" disabled={section.id === 1} onClick={() => go(section.id - 1)} aria-label="Предыдущий раздел"><ArrowLeft size={16} /></button>
          <button type="button" className="btn" disabled={section.id === total} onClick={() => go(section.id + 1)} aria-label="Следующий раздел"><ArrowRight size={16} /></button>
          <button type="button" className="btn btn--primary" onClick={props.onFinish} data-testid="finish">Завершить и проверить</button>
        </div>
      </section>

      {layout === 'wide' && picker}
      {layout !== 'wide' && pickerOpen && (
        <Sheet title="Перенос из реестра" side="right" onClose={() => setPickerOpen(false)}>{picker}</Sheet>
      )}
    </div>
  );
}
