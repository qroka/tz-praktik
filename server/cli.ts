// Управление администраторами из консоли.
//   npm run server:admin -- create <логин> <пароль>
//   npm run server:admin -- password <логин> <новый пароль>
//   npm run server:admin -- list
import { createUser, destroyUserSessions, hashPassword, validatePassword } from './auth.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';

const [command, username, password] = process.argv.slice(2);
const db = openDb(loadConfig().dbPath);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (command === 'list') {
  for (const row of db.prepare('SELECT username, created_at, last_login_at FROM users ORDER BY username').all() as { username: string; created_at: string; last_login_at: string | null }[]) {
    console.log(`${row.username}\tсоздан ${row.created_at}\tвход ${row.last_login_at ?? 'не было'}`);
  }
} else if (command === 'create' || command === 'password') {
  if (!username || !password) fail('Укажите логин и пароль.');
  const problem = validatePassword(password);
  if (problem) fail(problem);
  if (command === 'create') {
    try {
      createUser(db, username, password);
      console.log(`Администратор «${username}» создан.`);
    } catch {
      fail('Такой логин уже есть.');
    }
  } else {
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined;
    if (!row) fail('Пользователь не найден.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.id);
    destroyUserSessions(db, row.id);
    console.log('Пароль изменён, все сессии пользователя закрыты.');
  }
} else {
  fail('Команды: create <логин> <пароль>, password <логин> <пароль>, list');
}
db.close();
