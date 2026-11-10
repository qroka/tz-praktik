// Состояние текущей попытки: единственный источник правды интерфейса.
// Бизнес-логика остаётся в чистых модулях src/engine и src/state.
import { computed, ref, shallowRef, watch } from 'vue';
import { scenario } from '../data/scenario';
import { createAttempt, finishAttempt, newSeed, sendQuestion, setScreen } from '../state/attempt';
import { downloadFile, parseProgress, progressFileName, toProgressJson } from '../state/exporters';
import { buildHint, summarizeProgress } from '../state/learningProgress';
import { clearAttempt, loadAttempt, saveAttempt } from '../state/storage';
import type { Attempt, Screen } from '../types';
import { prefersReducedMotion } from './useLayout';

export type SaveStatus = { state: 'idle' | 'saving' | 'saved' | 'error'; at?: string };
export type Notice = { id: number; title: string; description?: string; kind: 'success' | 'error' | 'info' };

/** Сколько заказчик «печатает»: зависит от длины ответа. */
const typingDelay = (text: string) => (prefersReducedMotion() ? 200 : Math.max(650, Math.min(1800, 400 + text.length * 14)));

const attempt = shallowRef<Attempt | null>(loadAttempt(scenario));
const save = ref<SaveStatus>({ state: 'idle' });
const hiddenId = ref<string | null>(null);
const highlightId = ref<string | null>(null);
const notice = ref<Notice | null>(null);
let noticeCounter = 0;
let typingTimer = 0;
let saveTimer = 0;

function notify(kind: Notice['kind'], title: string, description?: string) {
  notice.value = { id: ++noticeCounter, kind, title, description };
}

// Попытки прошлых версий могли идти в режимах «стандартный» и «строгий». Режим не меняем:
// ответы заказчика и оценка остаются прежними, а интерфейс показывает учебные элементы.
if (attempt.value && !attempt.value.finishedAt && attempt.value.difficulty !== 'learning') {
  notify(
    'info',
    'Незавершённая попытка из прежней версии',
    'Тренажёр теперь учебный. Переписка, реестр и ТЗ сохранены, правила ответов заказчика в этой попытке остались прежними.',
  );
}

// Автосохранение с реальным статусом.
watch(
  attempt,
  (current) => {
    window.clearTimeout(saveTimer);
    if (!current) return;
    save.value = { ...save.value, state: 'saving' };
    saveTimer = window.setTimeout(() => {
      const ok = saveAttempt(current);
      save.value = ok ? { state: 'saved', at: new Date().toISOString() } : { state: 'error' };
      if (!ok) notify('error', 'Не удалось сохранить', 'Браузер не разрешил запись. Скачайте файл прогресса, чтобы не потерять работу.');
    }, 350);
  },
  { flush: 'post' },
);

function update(change: (current: Attempt) => Attempt) {
  if (attempt.value) attempt.value = change(attempt.value);
}

export function useSession() {
  const current = computed(() => attempt.value);
  const readOnly = computed(() => Boolean(attempt.value?.finishedAt));

  /** Сообщение заказчика, которое «печатается» и пока скрыто. */
  const hiddenMessage = computed(() => (hiddenId.value ? attempt.value?.messages.find((message) => message.id === hiddenId.value) : undefined));
  const visibleMessages = computed(() => (attempt.value ? attempt.value.messages.filter((message) => message.id !== hiddenId.value) : []));
  /** Раскрытые факты без тех, что принадлежат ещё не показанному ответу. */
  const disclosed = computed(() => {
    if (!attempt.value) return [];
    const hidden = hiddenMessage.value?.factIds ?? [];
    return attempt.value.engine.disclosed.filter((id) => !hidden.includes(id));
  });
  const summary = computed(() => (attempt.value ? summarizeProgress(scenario, attempt.value, disclosed.value) : null));
  const hint = computed(() =>
    attempt.value && summary.value ? buildHint(scenario, attempt.value, summary.value.rows, visibleMessages.value) : null,
  );

  function start(name: string) {
    attempt.value = createAttempt(scenario, name, 'learning', newSeed());
    hiddenId.value = null;
    notice.value = null;
  }

  function send(text: string, replyToId: string | null) {
    if (!attempt.value || attempt.value.finishedAt || hiddenId.value) return;
    const before = summarizeProgress(scenario, attempt.value, attempt.value.engine.disclosed).explored;
    const { attempt: next, customerId } = sendQuestion(attempt.value, scenario, text, replyToId);
    attempt.value = next;
    hiddenId.value = customerId;
    const reply = next.messages.find((message) => message.id === customerId);
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => {
      hiddenId.value = null;
      const after = summarizeProgress(scenario, next, next.engine.disclosed).explored;
      if (after > before) notify('success', 'Открыто новое направление');
    }, typingDelay(reply?.text ?? ''));
  }

  function go(screen: Screen) {
    update((a) => setScreen(a, screen));
  }

  function showSource(messageId: string) {
    update((a) => setScreen(a, 'dialog'));
    highlightId.value = messageId;
    window.setTimeout(() => {
      if (highlightId.value === messageId) highlightId.value = null;
    }, 2200);
  }

  function finish() {
    window.clearTimeout(typingTimer);
    hiddenId.value = null;
    update((a) => finishAttempt(a, scenario));
  }

  function reset() {
    window.clearTimeout(typingTimer);
    window.clearTimeout(saveTimer);
    clearAttempt();
    attempt.value = null;
    hiddenId.value = null;
    save.value = { state: 'idle' };
  }

  function applyImport(imported: Attempt) {
    window.clearTimeout(typingTimer);
    attempt.value = imported;
    hiddenId.value = null;
    notify('success', `Попытка студента «${imported.studentName}» загружена`);
  }

  /** Читает файл прогресса. Ошибки возвращаются через onError. */
  function readProgressFile(file: File, onParsed: (parsed: Attempt) => void, onError: (text: string) => void) {
    const reader = new FileReader();
    reader.onerror = () => onError('Не удалось прочитать файл.');
    reader.onload = () => {
      const parsed = parseProgress(String(reader.result), scenario);
      if (parsed.ok) onParsed(parsed.attempt);
      else onError(parsed.error);
    };
    reader.readAsText(file);
  }

  function exportProgress() {
    if (attempt.value) downloadFile(progressFileName(attempt.value), toProgressJson(attempt.value), 'application/json');
  }

  return {
    scenario,
    attempt: current,
    readOnly,
    save,
    hiddenId,
    highlightId,
    notice,
    visibleMessages,
    disclosed,
    summary,
    hint,
    update,
    notify,
    start,
    send,
    go,
    showSource,
    finish,
    reset,
    applyImport,
    readProgressFile,
    exportProgress,
  };
}
