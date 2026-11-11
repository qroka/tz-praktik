// Настройки сервера из переменных окружения.
import { resolve } from 'node:path';

export type Config = {
  port: number;
  host: string;
  dbPath: string;
  staticDir: string;
  /** Базовый путь, под которым отдаётся собранный сайт (совпадает с base в vite.config.ts). */
  basePath: string;
  secureCookies: boolean;
  /** Откуда разрешены запросы студентов (CORS для /api/public). «*» — откуда угодно. */
  publicOrigin: string;
  sessionDays: number;
  adminUser?: string;
  adminPassword?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    dbPath: resolve(env.DB_PATH ?? 'data/tz-praktik.db'),
    staticDir: resolve(env.STATIC_DIR ?? 'dist'),
    basePath: env.BASE_PATH ?? '/tz-praktik/',
    secureCookies: env.COOKIE_SECURE === '1',
    publicOrigin: env.PUBLIC_ORIGIN ?? '*',
    sessionDays: Number(env.SESSION_DAYS ?? 7),
    adminUser: env.ADMIN_USER,
    adminPassword: env.ADMIN_PASSWORD,
  };
}

/** Встроенный кейс живёт в коде сайта, на сервере для него хранятся только настройки и попытки. */
export const BUILTIN_SCENARIO = { id: 'hot-water-unit', title: 'Узел горячей воды для моечной линии' } as const;

/** 13 разделов ТЗ одинаковы для всех сценариев. */
export const TZ_SECTION_TITLES: Record<number, string> = {
  1: 'Наименование системы',
  2: 'Основание для разработки',
  3: 'Назначение и цели системы',
  4: 'Характеристика объекта автоматизации',
  5: 'Контролируемые и регулируемые параметры',
  6: 'Требования к автоматическому регулированию',
  7: 'Режимы работы',
  8: 'Предупредительная и аварийная сигнализация',
  9: 'Требования к исполнительным устройствам',
  10: 'Требования к операторскому интерфейсу',
  11: 'Общие требования к системе управления',
  12: 'Требования к надёжности и безопасности',
  13: 'Требования к разрабатываемой документации',
};
