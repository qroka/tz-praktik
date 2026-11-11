// Состояние текущей попытки: единственный источник правды интерфейса.
// Бизнес-логика остаётся в чистых модулях src/engine и src/state.
import { computed, ref, shallowRef, watch } from 'vue';
import { ApiError } from '../api/client';
import { fetchByCode, getRev, needsSync, sendAttempt, setRev, type SyncResult } from '../api/sync';
import { applyRemoteScenario, scenario, serverConnected } from '../data/activeScenario';
import { normalizeCode } from '../shared/resumeCode';
import { createAttempt, finishAttempt, newResumeCode, newSeed, sendQuestion, setScreen, validateAttempt } from '../state/attempt';
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
    if (!current || !serverConnected || conflict.value || current.finishedAt || !current.messages.some((m) => m.role === 'student')) return;
    syncTimer = window.setTimeout(() => void push(current), 6000);
  },
  { flush: 'post' },
);

// Попытка начата до появления личных кодов: выдаём код, чтобы к ней можно было вернуться.
if (attempt.value && serverConnected && !attempt.value.resumeCode) attempt.value = { ...attempt.value, resumeCode: newResumeCode() };
if (attempt.value && serverConnected && (needsSync(attempt.value) || (attempt.value.resumeCode && getRev(attempt.value.resumeCode) === 0 && attempt.value.messages.some((m) => m.role === 'student')))) {
  void push(attempt.value);
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
    if (serverConnected && attempt.value.resumeCode) {
      notify('info', 'Запомните код попытки', `${attempt.value.resumeCode}. По нему можно продолжить на другом компьютере. Он всегда виден в левом меню.`);
    }
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
    if (done && serverConnected) {
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
   * Выход без потери работы (общий компьютер): попытка остаётся на сервере и открывается по коду.
   * Сначала дожидаемся, что последняя версия ушла на сервер.
   */
  async function signOut(): Promise<boolean> {
    const current = attempt.value;
    if (!current) return true;
    if (serverConnected) {
      window.clearTimeout(syncTimer);
      const result = await push(current);
      if (result.status !== 'ok') {
        if (result.status !== 'conflict') notify('error', 'Не удалось сохранить на сервере', 'Выход отменён, чтобы не потерять работу. Проверьте соединение и повторите.');
        return false;
      }
    }
    reset();
    return true;
  }

  /** Возвращает попытку по личному коду: с сервера, вместе с её сценарием. */
  async function resume(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const code = normalizeCode(input);
    if (!code) return { ok: false, error: 'Введите четыре слова кода: через пробел или дефис, например «лиса мост река замок».' };
    try {
      const data = await fetchByCode(code);
      if (data.scenario.id !== scenario.id) applyRemoteScenario(data.scenario);
      const check = validateAttempt(data.attempt, scenario);
      if (!check.ok) return { ok: false, error: check.error };
      window.clearTimeout(typingTimer);
      window.clearTimeout(syncTimer);
      setRev(code, data.rev);
      conflict.value = null;
      attempt.value = { ...check.attempt, resumeCode: code };
      hiddenId.value = null;
      notify('success', `Попытка «${check.attempt.studentName}» открыта`);
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

  const resumeCode = computed(() => (serverConnected ? attempt.value?.resumeCode ?? null : null));
  const resumeLink = computed(() => (resumeCode.value ? `${window.location.origin}${window.location.pathname}#/continue/${encodeURIComponent(resumeCode.value)}` : null));

  async function copyText(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', done);
    } catch {
      notify('error', 'Не удалось скопировать', text);
    }
  }
  const copyCode = () => (resumeCode.value ? copyText(resumeCode.value, 'Код скопирован') : undefined);
  const copyLink = () => (resumeLink.value ? copyText(resumeLink.value, 'Ссылка скопирована') : undefined);

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
    signOut,
    resume,
    conflict,
    useServerVersion,
    keepMine,
    resumeCode,
    resumeLink,
    copyCode,
    copyLink,
    serverEnabled: computed(() => serverConnected),
    applyImport,
    readProgressFile,
    exportProgress,
  };
}
