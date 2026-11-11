// Запуск: npm run server
import { randomBytes } from 'node:crypto';
import { createApp } from './app.ts';
import { createUser } from './auth.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';

const config = loadConfig();
const db = openDb(config.dbPath);

// Первый запуск: создаём администратора. Пароль берётся из ADMIN_PASSWORD или генерируется и печатается один раз.
const users = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
if (users === 0) {
  const username = config.adminUser ?? 'admin';
  const generated = !config.adminPassword;
  const password = config.adminPassword ?? randomBytes(9).toString('base64url');
  createUser(db, username, password);
  console.log(`Создан администратор «${username}».`);
  if (generated) console.log(`Пароль (показан один раз, смените его в панели): ${password}`);
}

const { server } = createApp(db, config);
server.listen(config.port, config.host, () => {
  console.log(`Сервер: http://${config.host}:${config.port}${config.basePath}  (панель: ${config.basePath === '/' ? '/admin' : '#/admin'})`);
  console.log(`База данных: ${config.dbPath}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
