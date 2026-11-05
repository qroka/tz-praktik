import { BookOpen, Check, CircleAlert, ClipboardList, CornerDownRight, Pin, RotateCcw, SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { factById } from '../engine/factTracker';
import { addRequirement } from '../state/attempt';
import type { Attempt, ChatMessage, Scenario } from '../types';
import { RequirementForm } from './RequirementForm';
import { formatTime, prefersReducedMotion, type Layout } from './shared';

export const MAX_MESSAGE = 600;

const QUALITY_NOTE: Partial<Record<NonNullable<ChatMessage['quality']>, string>> = {
  general: 'Слишком общий вопрос',
  unrecognized: 'Заказчик не понял вопрос',
  repeat: 'Повторный вопрос',
  clarify: 'Заказчик уточняет',
  blocked: 'Сначала нужен другой ответ',
  correction: 'Значение поправлено',
};

export function ChatPanel(props: {
  attempt: Attempt;
  scenario: Scenario;
  layout: Layout;
  typing: boolean;
  hiddenMessageId: string | null;
  highlightId: string | null;
  readOnly: boolean;
  onSend: (text: string, replyToId: string | null) => void;
  onChange: (update: (attempt: Attempt) => Attempt) => void;
  onOpenCase: () => void;
  onOpenRegistry: () => void;
}) {
  const { attempt, scenario, layout, typing, hiddenMessageId, highlightId, readOnly } = props;
  const [text, setText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const visible = attempt.messages.filter((message) => message.id !== hiddenMessageId);
  const replyTarget = replyToId ? attempt.messages.find((message) => message.id === replyToId) : null;
  const tooLong = text.length > MAX_MESSAGE;

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [visible.length, typing]);

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`msg-${highlightId}`)?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [highlightId]);

  // Высота поля следует за текстом.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 160)}px`;
  }, [text]);

  function send() {
    const value = text.trim();
    if (!value) {
      setError('Сначала напишите вопрос заказчику.');
      inputRef.current?.focus();
      return;
    }
    if (tooLong) {
      setError(`Сообщение длиннее ${MAX_MESSAGE} символов. Разделите его на отдельные вопросы.`);
      return;
    }
    if (typing) return;
    setError(null);
    props.onSend(value, replyToId);
    setText('');
    setReplyToId(null);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  const suggestCategory = (message: ChatMessage): string => {
    // В учебном режиме категория подсказана, в остальных студент выбирает сам.
    if (attempt.difficulty !== 'learning') return '';
    const fact = message.factIds?.[0] ? factById(scenario, message.factIds[0]) : undefined;
    return fact?.category ?? '';
  };

  return (
    <section className="chat" aria-label="Переписка с заказчиком">
      <header className="chat__head">
        <span className="avatar" aria-hidden="true">{scenario.customer.initials}</span>
        <div className="chat__who">
          <div className="chat__name">{scenario.customer.name}</div>
          <div className="chat__role">{scenario.customer.role}</div>
        </div>
        <div className="chat__head-actions">
          {layout !== 'wide' && (
            <button type="button" className="btn btn--ghost btn--small" onClick={props.onOpenCase}><BookOpen size={16} />Кейс</button>
          )}
          {layout === 'compact' && (
            <button type="button" className="btn btn--ghost btn--small" onClick={props.onOpenRegistry} data-testid="open-registry">
              <ClipboardList size={16} />Реестр {attempt.requirements.length}
            </button>
          )}
        </div>
      </header>

      <div ref={threadRef} className="thread" role="log" aria-live="polite" aria-relevant="additions" aria-label="Сообщения" tabIndex={0}>
        <div className="thread__inner">
          {visible.map((message, index) => {
            const latest = index >= visible.length - 2;
            const saved = attempt.requirements.filter((item) => item.sourceMessageId === message.id).length;
            const quoted = message.replyToId ? attempt.messages.find((item) => item.id === message.replyToId) : null;
            const isCustomer = message.role === 'customer';
            const note = attempt.difficulty === 'learning' && message.role === 'student' && message.quality ? QUALITY_NOTE[message.quality] : undefined;
            const designerNote = isCustomer && attempt.difficulty !== 'strict' && message.quality === 'unknown_found';
            return (
              <article
                key={message.id}
                id={`msg-${message.id}`}
                className={`msg msg--${message.role} ${latest || captureId === message.id ? 'msg--latest' : ''} ${highlightId === message.id ? 'msg--highlight' : ''}`}
                data-testid={`message-${message.role}`}
              >
                <span className="visually-hidden">{isCustomer ? scenario.customer.name : 'Вы'}:</span>
                {quoted && <div className="msg__quote">Уточнение: {quoted.text}</div>}
                <div className="bubble">{message.text}</div>
                <div className="msg__meta">
                  <time dateTime={message.at}>{formatTime(message.at)}</time>
                  {note && <span className="tag tag--neutral">{note}</span>}
                  {designerNote && <span className="tag tag--accent">Решение предлагает проектировщик</span>}
                  {saved > 0 && <span className="msg__saved"><Check size={14} />В реестре{saved > 1 ? `: ${saved}` : ''}</span>}
                  {!readOnly && isCustomer && (
                    <>
                      <button type="button" className="msg__action msg__action--primary" onClick={() => setCaptureId(captureId === message.id ? null : message.id)}>
                        <Pin size={14} />Зафиксировать
                      </button>
                      <button
                        type="button"
                        className="msg__action"
                        aria-label="Уточнить"
                        onClick={() => {
                          setReplyToId(message.id);
                          inputRef.current?.focus();
                        }}
                      >
                        <CornerDownRight size={14} /><span className="msg__action-label">Уточнить</span>
                      </button>
                    </>
                  )}
                  {!readOnly && !isCustomer && (
                    <button
                      type="button"
                      className="msg__action"
                      aria-label="Задать снова"
                      onClick={() => {
                        setText(message.text);
                        inputRef.current?.focus();
                      }}
                    >
                      <RotateCcw size={14} /><span className="msg__action-label">Задать снова</span>
                    </button>
                  )}
                </div>
                {captureId === message.id && (
                  <RequirementForm
                    scenario={scenario}
                    initial={{ text: message.text, category: suggestCategory(message), needsClarification: false }}
                    submitLabel="Сохранить в реестр"
                    hint="Перепишите слова заказчика как требование: параметр, значение, единица, условие."
                    autoSelect
                    onCancel={() => setCaptureId(null)}
                    onSubmit={(draft) => {
                      props.onChange((current) => addRequirement(current, { ...draft, sourceMessageId: message.id }));
                      setCaptureId(null);
                    }}
                  />
                )}
              </article>
            );
          })}
          {typing && (
            <div className="typing" data-testid="typing">
              <span className="typing__dots" aria-hidden="true"><i /><i /><i /></span>
              {scenario.customer.name} печатает…
            </div>
          )}
        </div>
      </div>

      {readOnly ? (
        <div className="composer">
          <div className="composer__inner composer__done">
            <span>Попытка завершена. Переписка доступна для чтения.</span>
          </div>
        </div>
      ) : (
        <div className="composer">
          <div className="composer__inner">
            {replyTarget && (
              <div className="composer__reply" data-testid="reply-target">
                <span>Уточнение: {replyTarget.text}</span>
                <button type="button" className="icon-btn" aria-label="Отменить уточнение" onClick={() => setReplyToId(null)}><X size={16} /></button>
              </div>
            )}
            <div className="composer__row">
              <label className="visually-hidden" htmlFor="composer">Ваш вопрос заказчику</label>
              <textarea
                ref={inputRef}
                id="composer"
                className="textarea composer__input"
                rows={1}
                placeholder="Задайте вопрос заказчику"
                value={text}
                aria-invalid={Boolean(error) || tooLong}
                aria-describedby="composer-lane"
                onChange={(event) => {
                  setText(event.target.value);
                  if (event.target.value.trim()) setError(null);
                }}
                onKeyDown={onKeyDown}
              />
              <button type="button" className="composer__send" onClick={send} aria-label="Отправить" disabled={typing || tooLong}>
                <SendHorizontal size={20} />
              </button>
            </div>
            <div id="composer-lane" className="composer__lane">
              {error ? (
                <span className="field-error" role="alert"><CircleAlert size={14} />{error}</span>
              ) : (
                <span>{layout === 'compact' ? '' : 'Enter отправляет, Shift + Enter переносит строку'}</span>
              )}
              {text.length > MAX_MESSAGE - 100 && <span className={tooLong ? 'field-error' : ''}>{text.length}/{MAX_MESSAGE}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
