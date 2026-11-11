// Личный кабинет студента: вход по коду, регистрация (ФИО + группа), история попыток, новая попытка.
// Работает только при подключённом сервере; без него сайт ведёт себя по-старому (имя и локальное хранение).
import { computed, ref, shallowRef } from 'vue';
import { ApiError } from '../api/client';
import { clearStudentSession, loadStudentSession, saveStudentSession, studentApi, type HistoryItem, type StudentSession } from '../api/student';
import { refreshCurrentScenario, type PublicScenario } from '../data/activeScenario';
import { normalizeCode } from '../shared/resumeCode';
import { useSession } from './useSession';

const session = shallowRef<StudentSession | null>(loadStudentSession());
const history = ref<HistoryItem[]>([]);
const historyState = ref<'idle' | 'loading' | 'error'>('idle');
const historyError = ref('');
/** Код только что зарегистрированного студента: показывается, пока он его не запишет. */
const newCode = ref<string | null>(null);
/** Сценарий, который получит новая попытка. */
const currentScenario = ref<PublicScenario | null>(null);
/** Причина, по которой пришлось войти заново (токен устарел). */
const expiredNotice = ref(false);

type Result = { ok: true } | { ok: false; error: string };

const failure = (error: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof ApiError && error.status === 0 ? 'Сервер недоступен. Проверьте интернет и повторите.' : error instanceof Error ? error.message : fallback,
});

// Токен перестал подходить (срок вышел или преподаватель выдал новый код): просим войти снова. Незавершённая работа остаётся в браузере.
window.addEventListener('tz-student-expired', () => {
  if (!session.value) return;
  clearStudentSession();
  session.value = null;
  history.value = [];
  expiredNotice.value = true;
});

export function useStudent() {
  const sessionApi = useSession();

  const student = computed(() => session.value?.student ?? null);

  /** Принимает вход: попытка в браузере другого студента убирается (её копия лежит на сервере). */
  async function adopt(next: StudentSession): Promise<void> {
    const local = sessionApi.attempt.value;
    if (local && local.studentId !== next.student.id) sessionApi.reset();
    expiredNotice.value = false;
    session.value = next;
    saveStudentSession(next);
    await refreshHistory();
  }

  async function register(fullName: string, group: string): Promise<Result> {
    try {
      const result = await studentApi.register(fullName, group);
      newCode.value = result.student.code;
      await adopt({ token: result.token, student: result.student });
      return { ok: true };
    } catch (error) {
      return failure(error, 'Не удалось зарегистрироваться.');
    }
  }

  async function login(input: string): Promise<Result> {
    if (!normalizeCode(input)) return { ok: false, error: 'Введите четыре слова кода: через пробел или дефис, например «лиса мост река замок».' };
    try {
      const result = await studentApi.login(input);
      await adopt({ token: result.token, student: result.student });
      return { ok: true };
    } catch (error) {
      return failure(error, 'Не удалось войти.');
    }
  }

  async function refreshHistory(): Promise<void> {
    const current = session.value;
    if (!current) return;
    historyState.value = 'loading';
    historyError.value = '';
    try {
      const data = await studentApi.me(current.token);
      history.value = data.attempts;
      // Преподаватель мог поменять ФИО или группу.
      if (data.student.fullName !== current.student.fullName || data.student.group !== current.student.group || data.student.code !== current.student.code) {
        session.value = { token: current.token, student: data.student };
        saveStudentSession(session.value);
      }
      historyState.value = 'idle';
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      historyState.value = 'error';
      historyError.value = failure(error, 'Не удалось загрузить историю.').error;
    }
    currentScenario.value = (await refreshCurrentScenario()) ?? currentScenario.value;
  }

  /** Выход из аккаунта: сначала сохраняем открытую попытку. */
  async function logout(): Promise<boolean> {
    const left = await sessionApi.leaveAttempt();
    if (!left) return false;
    const current = session.value;
    if (current) {
      try {
        await studentApi.logout(current.token);
      } catch {
        // Сервер недоступен: токен всё равно удаляется отсюда.
      }
    }
    clearStudentSession();
    session.value = null;
    history.value = [];
    newCode.value = null;
    return true;
  }

  /** Начать ещё раз: новая попытка по сценарию, который сейчас выбран преподавателем. */
  async function startNew(): Promise<Result> {
    const me = student.value;
    if (!me) return { ok: false, error: 'Войдите в личный кабинет.' };
    // После просмотра старой попытки активным мог остаться её сценарий.
    const remote = await refreshCurrentScenario();
    if (remote) currentScenario.value = remote;
    sessionApi.startAttempt(me);
    return { ok: true };
  }

  /** Открыть попытку из истории (продолжить или посмотреть результат). */
  async function open(item: HistoryItem): Promise<Result> {
    return sessionApi.openFromHistory(item.key);
  }

  return {
    student,
    history,
    historyState,
    historyError,
    newCode,
    currentScenario,
    expiredNotice,
    register,
    login,
    refreshHistory,
    logout,
    startNew,
    open,
    dismissNewCode: () => (newCode.value = null),
    dismissExpired: () => (expiredNotice.value = false),
  };
}
