// Минимальный маршрутизатор поверх node:http: без внешних зависимостей.
import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type SessionUser = { id: number; username: string };

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  ip: string;
  user: SessionUser | null;
  /** Тело запроса как JSON; лимит в байтах. */
  json: <T = unknown>(limit?: number) => Promise<T>;
};

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
export type Access = 'public' | 'admin';

type Route = { method: string; regex: RegExp; keys: string[]; access: Access; handler: Handler };

export class Router {
  routes: Route[] = [];

  add(method: string, path: string, access: Access, handler: Handler) {
    const keys: string[] = [];
    const pattern = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${pattern}$`), keys, access, handler });
  }

  find(method: string, pathname: string): { route: Route; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.regex.exec(pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        try {
          params[key] = decodeURIComponent(match[i + 1]);
        } catch {
          throw new HttpError(400, 'Неверный адрес.');
        }
      });
      return { route, params };
    }
    return pathMatched ? 'method' : null;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

export function sendText(res: ServerResponse, status: number, body: string, type: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

export function sendBuffer(res: ServerResponse, status: number, body: Buffer, type: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

export function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const length = Number(req.headers['content-length'] ?? 0);
    if (length > limit) return reject(new HttpError(413, 'Слишком большой запрос.'));
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Слишком большой запрос.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

/** Простой ограничитель частоты: не больше limit событий за окно на ключ. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  /** true — событие разрешено. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 5000) this.sweep(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }
  reset(key: string) {
    this.hits.delete(key);
  }
  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
