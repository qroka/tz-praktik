// Пароли (scrypt), сессии в SQLite, cookie.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db } from './db.ts';
import type { SessionUser } from './http.ts';

export const SESSION_COOKIE = 'tzp_session';
export const MIN_PASSWORD = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

// Хэш-пустышка: время проверки не выдаёт, существует ли пользователь.
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Пароль не короче ${MIN_PASSWORD} символов.`;
  if (password.length > 200) return 'Пароль слишком длинный.';
  return null;
}

export function createUser(db: Db, username: string, password: string): number {
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, hashPassword(password), now);
  return Number(result.lastInsertRowid);
}

export function login(db: Db, username: string, password: string): SessionUser | null {
  const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return { id: row.id, username: row.username };
}

export function createSession(db: Db, userId: number, days: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha(token), userId, now.toISOString(), expiresAt.toISOString());
  return { token, expiresAt };
}

export function userBySession(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .prepare('SELECT u.id AS id, u.username AS username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(sha(token), new Date().toISOString()) as SessionUser | undefined;
  return row ?? null;
}

export function destroySession(db: Db, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function destroyUserSessions(db: Db, userId: number, exceptToken?: string) {
  if (exceptToken) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, sha(exceptToken));
  else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
