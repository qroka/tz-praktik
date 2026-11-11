// Аккаунт студента: сессия в браузере и запросы к серверу.
// Токен лежит в localStorage и уходит в заголовке Authorization: сайт может стоять на другом адресе, чем сервер.
import { request } from './client';

const KEY = 'tz-praktikum:student:v1';

export type StudentProfile = { id: number; fullName: string; group: string; code: string };
export type StudentSession = { token: string; student: StudentProfile };

/** Строка истории в личном кабинете. key — номер попытки для её открытия. */
export type HistoryItem = {
  key: string;
  scenarioId: string;
  scenarioTitle: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  score: number | null;
  grade: string | null;
  questions: number;
  disclosed: number;
};

export function loadStudentSession(): StudentSession | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<StudentSession> | null;
    const student = raw?.student;
    if (!raw || typeof raw.token !== 'string' || !student || typeof student.id !== 'number' || typeof student.fullName !== 'string') return null;
    return { token: raw.token, student: { id: student.id, fullName: student.fullName, group: student.group ?? '', code: student.code ?? '' } };
  } catch {
    return null;
  }
}

export function saveStudentSession(session: StudentSession): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Без хранилища вход не переживёт перезагрузку страницы, но работать можно.
  }
}

export function clearStudentSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Нечего очищать.
  }
}

export const getStudentToken = (): string | null => loadStudentSession()?.token ?? null;

type Authorized = { student: StudentProfile; token: string };

export const studentApi = {
  groups: () => request<{ groups: string[] }>('/student/groups', { timeout: 8000 }),
  register: (fullName: string, group: string) => request<Authorized>('/student/register', { method: 'POST', body: { fullName, group } }),
  login: (code: string) => request<Authorized>('/student/login', { method: 'POST', body: { code } }),
  logout: (token: string) => request<{ ok: true }>('/student/logout', { method: 'POST', body: {}, token, timeout: 5000 }),
  me: (token: string) => request<{ student: StudentProfile; attempts: HistoryItem[] }>('/student/me', { token }),
};
