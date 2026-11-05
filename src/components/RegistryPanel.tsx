import { CircleHelp, ClipboardList, Pencil, Plus, SearchX, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addRequirement, mergeRequirements, removeRequirement, updateRequirement } from '../state/attempt';
import type { Attempt, Requirement, Scenario } from '../types';
import { RequirementForm } from './RequirementForm';
import { formatTime } from './shared';

const TONE: Record<string, 'danger' | 'warn' | undefined> = { protection: 'danger', warning: 'warn' };

export function RegistryPanel(props: {
  attempt: Attempt;
  scenario: Scenario;
  readOnly: boolean;
  /** В боковой панели заголовок уже есть, поэтому показывается только счётчик. */
  inSheet?: boolean;
  onChange: (update: (attempt: Attempt) => Attempt) => void;
  onShowSource: (messageId: string) => void;
}) {
  const { attempt, scenario, readOnly, onChange } = props;
  const [category, setCategory] = useState('');
  const [onlyClarify, setOnlyClarify] = useState(false);
  const [onlyConflict, setOnlyConflict] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [mergeText, setMergeText] = useState('');

  const items = attempt.requirements;
  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    attempt.messages.forEach((message, index) => map.set(message.id, index + 1));
    return map;
  }, [attempt.messages]);

  const filtered = items.filter(
    (item) =>
      (!category || item.category === category) && (!onlyClarify || item.needsClarification) && (!onlyConflict || item.conflict),
  );
  const groups = scenario.categories
    .map((group) => ({ group, rows: filtered.filter((item) => item.category === group.id) }))
    .filter(({ rows }) => rows.length > 0);

  const clarifyCount = items.filter((item) => item.needsClarification).length;
  const conflictCount = items.filter((item) => item.conflict).length;

  function togglePick(requirement: Requirement) {
    const next = picked.includes(requirement.id) ? picked.filter((id) => id !== requirement.id) : [...picked, requirement.id];
    setPicked(next);
    setMergeText(items.filter((item) => next.includes(item.id)).map((item) => item.text).join(' '));
  }

  function closeMerge() {
    setMergeMode(false);
    setPicked([]);
    setMergeText('');
  }

  return (
    <aside className="registry" aria-label="Реестр требований">
      <div className="registry__head">
        <h2 className="registry__title">{props.inSheet ? 'Записей: ' : 'Реестр '}<span className="registry__count" data-testid="registry-count">{items.length}</span></h2>
        {!readOnly && (
          <>
            {items.length >= 2 && (
              <button type="button" className={`btn btn--small ${mergeMode ? '' : 'btn--ghost'}`} aria-pressed={mergeMode} onClick={() => (mergeMode ? closeMerge() : setMergeMode(true))}>
                Объединить
              </button>
            )}
            <button type="button" className="btn btn--small" onClick={() => setAdding(true)} disabled={adding}><Plus size={15} />Добавить</button>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div className="registry__filters" role="group" aria-label="Фильтры реестра">
          <label className="visually-hidden" htmlFor="registry-category">Фильтр по категории</label>
          <select id="registry-category" className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Все категории</option>
            {scenario.categories.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
          <button type="button" className="chip" aria-pressed={onlyClarify} onClick={() => setOnlyClarify(!onlyClarify)}>
            <CircleHelp size={14} />Уточнить: {clarifyCount}
          </button>
          <button type="button" className="chip" aria-pressed={onlyConflict} onClick={() => setOnlyConflict(!onlyConflict)}>
            <TriangleAlert size={14} />Противоречия: {conflictCount}
          </button>
        </div>
      )}

      <div className="registry__list">
        {adding && (
          <RequirementForm
            scenario={scenario}
            initial={{ text: '', category: '', needsClarification: false }}
            submitLabel="Добавить"
            onCancel={() => setAdding(false)}
            onSubmit={(draft) => {
              onChange((current) => addRequirement(current, { ...draft, sourceMessageId: null }));
              setAdding(false);
            }}
          />
        )}

        {items.length === 0 && !adding && (
          <div className="empty" data-testid="registry-empty">
            <ClipboardList size={24} />
            <strong>Требований пока нет</strong>
            Зафиксируйте важный ответ заказчика кнопкой под его сообщением или добавьте запись вручную.
          </div>
        )}
        {items.length > 0 && filtered.length === 0 && (
          <div className="empty">
            <SearchX size={24} />
            <strong>Ничего не найдено</strong>
            По этим фильтрам записей нет.
          </div>
        )}

        {groups.map(({ group, rows }) => (
          <section key={group.id} className="registry__group">
            <h3 className="registry__group-title" data-tone={TONE[group.id]}>{group.title}</h3>
            {rows.map((item) => {
              if (editingId === item.id) {
                return (
                  <RequirementForm
                    key={item.id}
                    scenario={scenario}
                    initial={{ text: item.text, category: item.category, needsClarification: item.needsClarification }}
                    submitLabel="Сохранить"
                    onCancel={() => setEditingId(null)}
                    onSubmit={(draft) => {
                      onChange((current) => updateRequirement(current, item.id, draft));
                      setEditingId(null);
                    }}
                  />
                );
              }
              const sourceNumber = item.sourceMessageId ? numbers.get(item.sourceMessageId) : undefined;
              const selected = picked.includes(item.id);
              return (
                <article key={item.id} className={`req ${selected ? 'req--selected' : ''}`} data-testid="requirement">
                  <div className="req__body">
                    {mergeMode && (
                      <input className="req__pick" type="checkbox" checked={selected} aria-label="Выбрать для объединения" onChange={() => togglePick(item)} />
                    )}
                    <div className="req__text">{item.text}</div>
                  </div>
                  {(item.needsClarification || item.conflict) && (
                    <div className="req__flags">
                      {item.needsClarification && <span className="tag tag--warn"><CircleHelp size={13} />Требует уточнения</span>}
                      {item.conflict && <span className="tag tag--warn"><TriangleAlert size={13} />Противоречие</span>}
                    </div>
                  )}
                  <div className="req__meta">
                    <span>{formatTime(item.createdAt)}</span>
                    {sourceNumber ? (
                      <button type="button" className="req__source" onClick={() => props.onShowSource(item.sourceMessageId!)}>Сообщение №{sourceNumber}</button>
                    ) : (
                      <span>Добавлено вручную</span>
                    )}
                    {item.mergedFrom && item.mergedFrom.length > 1 && <span>Источников: {item.mergedFrom.length}</span>}
                  {!readOnly && !mergeMode && (
                    <div className="req__actions">
                      <button type="button" className="icon-btn" aria-label="Редактировать" title="Редактировать" onClick={() => setEditingId(item.id)}><Pencil size={16} /></button>
                      <button type="button" className="icon-btn" aria-label="Требует уточнения" title="Требует уточнения" aria-pressed={item.needsClarification} onClick={() => onChange((current) => updateRequirement(current, item.id, { needsClarification: !item.needsClarification }))}><CircleHelp size={16} /></button>
                      <button type="button" className="icon-btn" aria-label="Противоречие" title="Отметить противоречие" aria-pressed={item.conflict} onClick={() => onChange((current) => updateRequirement(current, item.id, { conflict: !item.conflict }))}><TriangleAlert size={16} /></button>
                      <button type="button" className="icon-btn" aria-label="Удалить" title="Удалить" onClick={() => setDeletingId(item.id)}><Trash2 size={16} /></button>
                    </div>
                  )}
                  </div>
                  {deletingId === item.id && (
                    <div className="req__confirm" role="group" aria-label="Подтверждение удаления">
                      Удалить запись?
                      <button type="button" className="btn btn--small" onClick={() => { onChange((current) => removeRequirement(current, item.id)); setDeletingId(null); }}>Удалить</button>
                      <button type="button" className="btn btn--small btn--ghost" onClick={() => setDeletingId(null)}>Отмена</button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      {mergeMode && (
        <div className="registry__merge" data-testid="merge-panel">
          <label className="field__label" htmlFor="merge-text">Общая формулировка</label>
          <textarea id="merge-text" className="textarea" rows={3} value={mergeText} placeholder="Отметьте две записи или больше" onChange={(event) => setMergeText(event.target.value)} />
          <button
            type="button"
            className="btn btn--primary"
            disabled={picked.length < 2 || !mergeText.trim()}
            onClick={() => {
              onChange((current) => mergeRequirements(current, picked, mergeText));
              closeMerge();
            }}
          >
            Объединить записи: {picked.length}
          </button>
        </div>
      )}
    </aside>
  );
}
