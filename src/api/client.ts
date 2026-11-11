// Обращения к серверу. Без сервера (например, на GitHub Pages) всё работает локально, как раньше.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; admin?: boolean; timeout?: number; raw?: boolean };

/** Запрос к серверу. Ответ, не являющийся JSON (например, страница 404 статического хостинга), считается «сервера нет». */
export async function request<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeout ?? 15000);
  try {
    const response = await fetch(BASE + path, {
      method: options.method ?? 'GET',
      credentials: options.admin ? 'include' : 'omit',
      signal: controller.signal,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.admin && options.method && options.method !== 'GET' ? { 'X-Requested-With': 'tzp' } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (options.raw) {
      if (!response.ok) throw new ApiError(response.status, await errorText(response));
      return (await response.blob()) as T;
    }
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new ApiError(0, 'Сервер недоступен.');
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      if (options.admin && response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('tz-admin-expired'));
      throw new ApiError(response.status, data.error ?? 'Ошибка запроса.');
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Сервер недоступен.');
  } finally {
    window.clearTimeout(timer);
  }
}

async function errorText(response: Response): Promise<string> {
  try {
    return ((await response.json()) as { error?: string }).error ?? 'Ошибка запроса.';
  } catch {
    return 'Ошибка запроса.';
  }
}

export const adminApi = {
  get: <T>(path: string) => request<T>(path, { admin: true }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { admin: true, method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { admin: true, method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { admin: true, method: 'DELETE' }),
  file: (path: string) => request<Blob>(path, { admin: true, raw: true }),
};
