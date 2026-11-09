import { Award, Check, CircleAlert, ClipboardList, CloudOff, Download, Ellipsis, FileText, LoaderCircle, MessageSquareText, MessagesSquare, RotateCcw, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnswerLab } from './components/AnswerLab';
import { TEACHER_TOOLS } from './config';
import { applyAnswerPack, parseAnswerPack } from './engine/answerPack';
import { clearStoredPack, loadStoredPack, saveStoredPack, type StoredPack } from './state/answerPackStorage';
import { CasePanel } from './components/CasePanel';
import { ChatPanel } from './components/ChatPanel';
import { RegistryPanel } from './components/RegistryPanel';
import { ResultScreen } from './components/ResultScreen';
import { ConfirmDialog, formatTime, prefersReducedMotion, Sheet, useDismiss, useLayout } from './components/shared';
import { StartScreen } from './components/StartScreen';
import { TzEditor } from './components/TzEditor';
import { scenario as baseScenario } from './data/scenario';
import { minSectionWords } from './data/evaluation';
import { createAttempt, finishAttempt, sendQuestion, setScreen } from './state/attempt';
import { downloadFile, parseProgress, progressFileName, toProgressJson } from './state/exporters';
import { clearAttempt, loadAttempt, saveAttempt } from './state/storage';
import type { Attempt, Screen } from './types';

type SaveStatus = { state: 'idle' | 'saving' | 'saved' | 'error'; at?: string };

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status.state === 'error') {
    return <span className="save-state save-state--error" role="status" data-testid="save-state"><CloudOff size={15} /><span className="save-state__text">Не удалось сохранить</span></span>;
  }
  if (status.state === 'saving') {
    return <span className="save-state" data-testid="save-state"><LoaderCircle size={15} className="spin" /><span className="save-state__text">Сохранение…</span></span>;
  }
  if (status.state === 'saved' && status.at) {
    return <span className="save-state" data-testid="save-state" title={`Сохранено в ${formatTime(status.at)}`}><Check size={15} /><span className="save-state__text">Сохранено {formatTime(status.at)}</span></span>;
  }
  return null;
}

/** Сколько заказчик «печатает»: зависит от длины ответа. */
const typingDelay = (text: string) => (prefersReducedMotion() ? 200 : Math.max(650, Math.min(1800, 400 + text.length * 14)));

export function App() {
  // Тестовые ответы преподавателя накладываются поверх исходного сценария.
  const [storedPack, setStoredPack] = useState<StoredPack | null>(() => (TEACHER_TOOLS ? loadStoredPack() : null));
  const packInfo = useMemo(() => {
    if (!storedPack) return null;
    const parsed = parseAnswerPack(storedPack.text, baseScenario);
    return parsed.ok ? { scenario: applyAnswerPack(baseScenario, parsed.pack), title: parsed.pack.title || storedPack.fileName } : null;
  }, [storedPack]);
  const scenario = packInfo?.scenario ?? baseScenario;
  const [labOpen, setLabOpen] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(() => loadAttempt(baseScenario));
  const [save, setSave] = useState<SaveStatus>({ state: 'idle' });
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'case' | 'registry' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'finish' | null>(null);
  const [pendingImport, setPendingImport] = useState<Attempt | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const layout = useLayout();
  const typingTimer = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useDismiss(menuOpen, closeMenu);

  // Автосохранение с индикатором.
  useEffect(() => {
    if (!attempt) return;
    setSave((prev) => ({ ...prev, state: 'saving' }));
    const timer = window.setTimeout(() => {
      const ok = saveAttempt(attempt);
      setSave(ok ? { state: 'saved', at: new Date().toISOString() } : { state: 'error' });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  useEffect(() => () => window.clearTimeout(typingTimer.current), []);

  const update = useCallback((change: (current: Attempt) => Attempt) => {
    setAttempt((current) => (current ? change(current) : current));
  }, []);

  function handleSend(text: string, replyToId: string | null) {
    if (!attempt) return;
    const { attempt: next, customerId } = sendQuestion(attempt, scenario, text, replyToId);
    setAttempt(next);
    setHiddenId(customerId);
    const reply = next.messages.find((message) => message.id === customerId);
    typingTimer.current = window.setTimeout(() => setHiddenId(null), typingDelay(reply?.text ?? ''));
  }

  function showSource(messageId: string) {
    setPanel(null);
    update((current) => setScreen(current, 'dialog'));
    setHighlightId(messageId);
    window.setTimeout(() => setHighlightId(null), 2200);
  }

  function applyImport(imported: Attempt) {
    setAttempt(imported);
    setHiddenId(null);
    setStartError(null);
    setPendingImport(null);
    setNotice({ text: `Попытка студента «${imported.studentName}» загружена.`, ok: true });
  }

  function importFile(file: File, onError: (text: string) => void) {
    const reader = new FileReader();
    reader.onerror = () => onError('Не удалось прочитать файл.');
    reader.onload = () => {
      const parsed = parseProgress(String(reader.result), scenario);
      if (!parsed.ok) {
        onError(parsed.error);
        return;
      }
      // Текущую работу без подтверждения не заменяем.
      if (attempt) setPendingImport(parsed.attempt);
      else applyImport(parsed.attempt);
    };
    reader.readAsText(file);
  }

  const lab = labOpen && (
    <AnswerLab
      base={baseScenario}
      scenario={scenario}
      stored={storedPack}
      onClose={() => setLabOpen(false)}
      onLoad={(pack) => {
        saveStoredPack(pack);
        setStoredPack(pack);
      }}
      onReset={() => {
        clearStoredPack();
        setStoredPack(null);
      }}
    />
  );

  if (!attempt) {
    return (
      <>
      {lab}
      <StartScreen
        onOpenAnswers={TEACHER_TOOLS ? () => setLabOpen(true) : undefined}
        answersTitle={packInfo?.title ?? null}
        scenario={scenario}
        importError={startError}
        onImport={(file) => importFile(file, setStartError)}
        onStart={(name, difficulty, seed) => {
          setNotice(null);
          setAttempt(createAttempt(scenario, name, difficulty, seed));
        }}
      />
      </>
    );
  }

  const readOnly = Boolean(attempt.finishedAt);
  const hiddenMessage = hiddenId ? attempt.messages.find((message) => message.id === hiddenId) : null;
  const disclosed = hiddenMessage
    ? attempt.engine.disclosed.filter((id) => !(hiddenMessage.factIds ?? []).includes(id))
    : attempt.engine.disclosed;

  const screen: Screen = attempt.screen;
  const tabs: { id: Screen; label: string; short: string; icon: typeof FileText }[] = [
    { id: 'dialog', label: 'Диалог', short: 'Диалог', icon: MessagesSquare },
    ...(attempt.result ? [] : [{ id: 'tz' as Screen, label: 'Техническое задание', short: 'ТЗ', icon: FileText }]),
  ];
  if (attempt.result) tabs.push({ id: 'result', label: 'Результат', short: 'Итог', icon: Award });

  const emptySections = scenario.tzSections.filter((section) => (attempt.tz[section.id] ?? '').trim().split(/\s+/).filter(Boolean).length < minSectionWords);

  const registry = (
    <RegistryPanel attempt={attempt} scenario={scenario} readOnly={readOnly} onChange={update} onShowSource={showSource} />
  );

  return (
    <div className="workspace">
      <header className="topbar">
        <span className="wordmark">ТЗ Практикум</span>
        <nav className="tabs" aria-label="Этапы работы">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} type="button" className="tab" aria-current={screen === tab.id ? 'page' : undefined} onClick={() => update((current) => setScreen(current, tab.id))}>
                <Icon size={16} />{layout === 'compact' ? tab.short : tab.label}
              </button>
            );
          })}
        </nav>
        <span className="topbar__spacer" />
        <span className="student-name">{attempt.studentName}</span>
        <SaveIndicator status={save} />
        <div className="menu-wrap" ref={menuRef}>
          <button type="button" className="icon-btn" aria-label="Меню попытки" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen(!menuOpen)}>
            <Ellipsis size={20} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" className="menu__item" data-testid="menu-export" onClick={() => { downloadFile(progressFileName(attempt), toProgressJson(attempt), 'application/json'); setMenuOpen(false); }}>
                <Download size={17} />Сохранить файл прогресса
              </button>
              <button type="button" role="menuitem" className="menu__item" onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}>
                <Upload size={17} />Загрузить файл прогресса
              </button>
              {TEACHER_TOOLS && (
                <button type="button" role="menuitem" className="menu__item" data-testid="menu-answers" onClick={() => { setLabOpen(true); setMenuOpen(false); }}>
                  <MessageSquareText size={17} />Ответы заказчика (тест)
                </button>
              )}
              <div className="menu__sep" />
              <button type="button" role="menuitem" className="menu__item" data-testid="menu-reset" onClick={() => { setConfirm('reset'); setMenuOpen(false); }}>
                <RotateCcw size={17} />Начать заново
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Файл прогресса"
            data-testid="menu-import"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importFile(file, (text) => setNotice({ text, ok: false }));
              event.target.value = '';
            }}
          />
        </div>
      </header>

      {packInfo && (
        <div className="banner banner--ok" data-testid="answers-banner">
          <MessageSquareText size={17} />
          <span>Тестовые ответы: {packInfo.title}</span>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setLabOpen(true)}>Настроить</button>
        </div>
      )}
      {lab}
      {notice && (
        <div className={`banner ${notice.ok ? 'banner--ok' : ''}`} role="status">
          {notice.ok ? <Check size={17} /> : <CircleAlert size={17} />}
          <span>{notice.text}</span>
          <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Скрыть сообщение" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}

      {screen === 'dialog' && (
        <div className="dialog-layout" data-layout={layout}>
          {layout === 'wide' && <CasePanel attempt={attempt} scenario={scenario} disclosed={disclosed} />}
          <ChatPanel
            attempt={attempt}
            scenario={scenario}
            layout={layout}
            typing={Boolean(hiddenId)}
            hiddenMessageId={hiddenId}
            highlightId={highlightId}
            readOnly={readOnly}
            onSend={handleSend}
            onChange={update}
            onOpenCase={() => setPanel('case')}
            onOpenRegistry={() => setPanel('registry')}
          />
          {layout !== 'compact' && registry}
        </div>
      )}

      {screen === 'tz' && !readOnly && (
        <TzEditor attempt={attempt} scenario={scenario} layout={layout} onChange={update} onFinish={() => setConfirm('finish')} />
      )}
      {screen === 'tz' && readOnly && attempt.result && <ResultScreen attempt={{ ...attempt, screen: 'result' }} scenario={scenario} />}
      {screen === 'result' && attempt.result && <ResultScreen attempt={attempt} scenario={scenario} />}

      {panel === 'case' && (
        <Sheet title="Описание кейса" side="left" onClose={() => setPanel(null)}>
          <CasePanel attempt={attempt} scenario={scenario} disclosed={disclosed} />
        </Sheet>
      )}
      {panel === 'registry' && (
        <Sheet title="Реестр требований" side="right" onClose={() => setPanel(null)}>
          <RegistryPanel attempt={attempt} scenario={scenario} readOnly={readOnly} inSheet onChange={update} onShowSource={showSource} />
        </Sheet>
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Заменить текущую попытку?"
          confirmLabel="Загрузить файл"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => applyImport(pendingImport)}
        >
          Текущая работа будет заменена попыткой студента «{pendingImport.studentName}». Если она ещё нужна, сначала сохраните файл прогресса.
        </ConfirmDialog>
      )}
      {confirm === 'reset' && (
        <ConfirmDialog
          title="Начать заново?"
          confirmLabel="Удалить и начать заново"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            clearAttempt();
            setAttempt(null);
            setSave({ state: 'idle' });
            setHiddenId(null);
            setConfirm(null);
            setNotice(null);
          }}
        >
          Переписка, реестр и текст ТЗ этой попытки будут удалены из браузера. Если они ещё нужны, сначала сохраните файл прогресса.
        </ConfirmDialog>
      )}
      {confirm === 'finish' && (
        <ConfirmDialog
          title="Завершить попытку?"
          confirmLabel="Завершить и получить оценку"
          cancelLabel="Вернуться"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setHiddenId(null);
            update((current) => finishAttempt(current, scenario));
            setConfirm(null);
          }}
        >
          После завершения откроется эталон, а изменить ответы будет нельзя.
          {emptySections.length > 0 && (
            <p className="field-error" style={{ marginTop: 10 }} data-testid="finish-warning">
              <CircleAlert size={15} />Не заполнено разделов: {emptySections.length} ({emptySections.map((section) => section.id).join(', ')}).
            </p>
          )}
          {attempt.requirements.length === 0 && (
            <p className="field-error" style={{ marginTop: 6 }}><ClipboardList size={15} />В реестре нет ни одного требования.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
