// Общие элементы: модальные окна на нативном dialog, боковые панели, хук раскладки.
import { X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

export type Layout = 'wide' | 'medium' | 'compact';

const WIDE = '(min-width: 1240px)';
const MEDIUM = '(min-width: 860px)';

function currentLayout(): Layout {
  if (window.matchMedia(WIDE).matches) return 'wide';
  return window.matchMedia(MEDIUM).matches ? 'medium' : 'compact';
}

function subscribe(onChange: () => void): () => void {
  const queries = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}

export const useLayout = (): Layout => useSyncExternalStore(subscribe, currentLayout);

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Открывает нативный dialog: фокус удерживается внутри, Esc закрывает, фокус возвращается. */
function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);
  return ref;
}

export function ConfirmDialog(props: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useModal(props.onCancel);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title">
      <div id="modal-title" className="modal__title">{props.title}</div>
      <div className="modal__text">{props.children}</div>
      <div className="modal__foot">
        <button type="button" className="btn" onClick={props.onCancel}>{props.cancelLabel ?? 'Отмена'}</button>
        <button type="button" className="btn btn--primary" onClick={props.onConfirm}>{props.confirmLabel}</button>
      </div>
    </dialog>
  );
}

export function Sheet(props: { title: string; side: 'left' | 'right'; onClose: () => void; children: ReactNode }) {
  const ref = useModal(props.onClose);
  return (
    <dialog ref={ref} className="sheet" data-side={props.side} aria-label={props.title}>
      <div className="sheet__frame">
        <div className="sheet__head">
          <span>{props.title}</span>
          <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Закрыть панель"><X size={20} /></button>
        </div>
        <div className="sheet__body">{props.children}</div>
      </div>
    </dialog>
  );
}

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Закрытие выпадающего меню при клике снаружи и по Esc. */
export function useDismiss(active: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, onDismiss]);
  return ref;
}

/** Показывает значение только после первой отрисовки, чтобы полоса прогресса анимировалась. */
export function useAnimatedWidth(percent: number): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);
  return width;
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const width = useAnimatedWidth(percent);
  return (
    <span className="bar" role={label ? 'img' : undefined} aria-label={label}>
      <span className="bar__fill" style={{ width: `${width}%` }} />
    </span>
  );
}
