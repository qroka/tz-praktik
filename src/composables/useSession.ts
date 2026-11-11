// Состояние текущей попытки: единственный источник правды интерфейса.
// Бизнес-логика остаётся в чистых модулях src/engine и src/state.
import { computed, ref, shallowRef, watch } from 'vue';
import { ApiError } from '../api/client';
import { canSync, fetchAttempt, getRev, needsSync, sendAttempt, setRev, type SyncResult } from '../api/sync';
import { loadStudentSession } from '../api/student';
import { applyRemoteScenario, scenario, serverConnected } from '../data/activeScenario';
import { createAttempt, finishAttempt, newSeed, sendQuestion, setScreen, validateAttempt } from '../state/attempt';
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
let syncTimer = 0;

/** Другое устройство сохранило более новую версию этой попытки: студент выбирает, какую оставить. */
const conflict = shallowRef<{ attempt: Attempt; rev: number } | null>(null);

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

/** Сохраняет попытку на сервере. При конфликте версий ничего не затирает, а просит студента выбрать. */
async function push(current: Attempt, force = false): Promise<SyncResult> {
  const result = await sendAttempt(current, { force });
  if (result.status !== 'conflict') return result;
  const check = validateAttempt(result.attempt, scenario);
  if (!check.ok) return { status: 'rejected', message: check.error };
  // Сервер уже хранит ровно то же самое (например, ответ на прошлую отправку потерялся): молча принимаем номер версии.
  if (JSON.stringify(check.attempt) === JSON.stringify(current)) {
    if (current.resumeCode) setRev(current.resumeCode, result.rev);
    return { status: 'ok', rev: result.rev };
  }
  conflict.value = { attempt: check.attempt, rev: result.rev };
  return result;
}

// Хранение попытки на сервере: с задержкой после изменений, а итог — сразу при завершении.
watch(
  attempt,
  (current) => {
    window.clearTimeout(syncTimer);
    if (!current || !canSync() || conflict.value || current.finishedAt || !current.messages.some((m) => m.role === 'student')) return;
    syncTimer = window.setTimeout(() => void push(current), 6000);
  },
  { flush: 'post' },
);

// Незавершённая отправка с прошлого раза (закрыли вкладку раньше времени): догоняем, пока студент тот же.
{
  const saved = loadStudentSession();
  const mine = attempt.value;
  if (mine && saved && canSync() && mine.studentId === saved.student.id && (needsSync(mine) || (mine.resumeCode && getRev(mine.resumeCode) === 0 && mine.messages.some((m) => m.role === 'student')))) {
    void push(mine);
  }
}

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
    conflict.value = null;
  }

  /** Новая попытка вошедшего студента: ФИО и группа берутся из аккаунта. */
  function startAttempt(student: { id: number; fullName: string; group: string }) {
    attempt.value = createAttempt(scenario, student.fullName, 'learning', newSeed(), { id: student.id, group: student.group });
    hiddenId.value = null;
    notice.value = null;
    conflict.value = null;
  }

  function send(text: string, replyToId: string | null) {
    if (!attempt.value || attempt.value.finishedAt || hiddenId.value) return;
    const before = new Set(summarizeProgress(scenario, attempt.value, attempt.value.engine.disclosed).rows.filter((row) => row.found > 0).map((row) => row.id));
    const { attempt: next, customerId } = sendQuestion(attempt.value, scenario, text, replyToId);
    attempt.value = next;
    hiddenId.value = customerId;
    const reply = next.messages.find((message) => message.id === customerId);
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => {
      hiddenId.value = null;
      const opened = summarizeProgress(scenario, next, next.engine.disclosed).rows.filter((row) => row.found > 0 && !before.has(row.id));
      if (opened.length) notify('success', 'Открыто новое направление', opened.map((row) => row.title).join(', '));
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
    window.clearTimeout(syncTimer);
    update((a) => finishAttempt(a, scenario));
    const done = attempt.value;
    if (done && canSync()) {
      void push(done).then((result) => {
        if (result.status === 'ok') notify('success', 'Результат отправлен преподавателю');
        else if (result.status !== 'conflict') notify('info', 'Результат пока не отправлен', 'Он сохранён в браузере и уйдёт при следующем открытии сайта. Можно скачать файл прогресса.');
      });
    }
  }

  function reset() {
    window.clearTimeout(typingTimer);
    window.clearTimeout(saveTimer);
    window.clearTimeout(syncTimer);
    clearAttempt();
    attempt.value = null;
    hiddenId.value = null;
    conflict.value = null;
    save.value = { state: 'idle' };
  }

  /**
   * Возврат в личный кабинет (и выход из аккаунта): попытка сохраняется на сервере и убирается с экрана.
   * Если сохранить не удалось, ничего не закрывается, чтобы не потерять работу.
   */
  async function leaveAttempt(): Promise<boolean> {
    const current = attempt.value;
    if (!current) return true;
    window.clearTimeout(syncTimer);
    const hasWork = current.finishedAt !== null || current.messages.some((m) => m.role === 'student');
    if (canSync() && hasWork) {
      const result = await push(current);
      if (result.status !== 'ok') {
        if (result.status !== 'conflict') notify('error', 'Не удалось сохранить на сервере', 'Попытка осталась открытой, чтобы не потерять работу. Проверьте соединение и повторите.');
        return false;
      }
    }
    reset();
    return true;
  }

  /** Открывает попытку из истории кабинета: с сервера, вместе с её сценарием. */
  async function openFromHistory(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const data = await fetchAttempt(key);
      if (data.scenario.id !== scenario.id) applyRemoteScenario(data.scenario);
      const check = validateAttempt(data.attempt, scenario);
      if (!check.ok) return { ok: false, error: check.error };
      window.clearTimeout(typingTimer);
      window.clearTimeout(syncTimer);
      setRev(key, data.rev);
      conflict.value = null;
      attempt.value = check.attempt;
      hiddenId.value = null;
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) return { ok: false, error: 'Сервер недоступен. Проверьте интернет и повторите.' };
      return { ok: false, error: error instanceof Error ? error.message : 'Не удалось открыть попытку.' };
    }
  }

  /** Конфликт версий: берём то, что сохранило другое устройство. */
  function useServerVersion() {
    const found = conflict.value;
    if (!found) return;
    window.clearTimeout(typingTimer);
    window.clearTimeout(syncTimer);
    if (found.attempt.resumeCode) setRev(found.attempt.resumeCode, found.rev);
    conflict.value = null;
    attempt.value = found.attempt;
    hiddenId.value = null;
    notify('success', 'Загружена версия с другого устройства');
  }

  /** Конфликт версий: оставляем свою, версия с сервера будет заменена. */
  function keepMine() {
    const found = conflict.value;
    const mine = attempt.value;
    conflict.value = null;
    if (!found || !mine) return;
    if (found.attempt.resumeCode) setRev(found.attempt.resumeCode, found.rev);
    void push(mine, true).then((result) => {
      if (result.status === 'ok') notify('success', 'Сохранена ваша версия');
    });
  }

  async function copyText(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', done);
    } catch {
      notify('error', 'Не удалось скопировать', text);
    }
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
    startAttempt,
    leaveAttempt,
    openFromHistory,
    copyText,
    conflict,
    useServerVersion,
    keepMine,
    serverEnabled: computed(() => serverConnected),
    applyImport,
    readProgressFile,
    exportProgress,
  };
}
