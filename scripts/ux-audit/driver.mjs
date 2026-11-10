// UX-аудит: драйвер реального приложения через Playwright.
// Студент видит только то, что видно в интерфейсе. Исследователь получает журнал с распознанным намерением и фактами.
//
// Запуск: сначала собрать и поднять приложение (npx vite build && npx vite preview --port 4173 --strictPort),
// затем: node scripts/ux-audit/driver.mjs  (порт 5310).
//
// HTTP:
//   GET  /intro                       — видимый текст стартовой страницы
//   POST /start   {session, name}     — начать попытку, вернуть приветствие и видимый текст экрана
//   POST /ask     {session, text}     — задать вопрос, вернуть ответ заказчика (только текст)
//   GET  /screen?session=…            — видимый текст текущего экрана (подсказки, прогресс)
//   POST /stop    {session}
import { chromium } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:4173/tz-praktik/';
const PORT = Number(process.env.DRIVER_PORT ?? 5310);
// LOG_DIR — каталог журналов прогона (по умолчанию базовый аудит docs/ux-audit/logs).
const LOG_DIR = process.env.LOG_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'ux-audit', 'logs');
const KEY = 'tz-praktikum:attempt:v1';
mkdirSync(LOG_DIR, { recursive: true });

const browser = await chromium.launch();
const sessions = new Map();

const visible = (page) => page.evaluate(() => document.body.innerText);
const attemptOf = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);

async function start(session, name) {
  if (sessions.has(session)) await sessions.get(session).context.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByLabel('Имя студента').fill(name);
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await page.getByTestId('message-customer').first().waitFor();
  sessions.set(session, { context, page, n: 0 });
  writeFileSync(join(LOG_DIR, `${session}.jsonl`), '');
  await page.screenshot({ path: join(LOG_DIR, `${session}-start.png`) });
  const first = page.getByTestId('message-customer').first();
  const greeting = ((await first.locator('.bubble').count()) ? await first.locator('.bubble').innerText() : await first.innerText()).trim();
  return { greeting, screen: await visible(page) };
}

async function ask(session, text) {
  const s = sessions.get(session);
  if (!s) throw new Error('Сначала /start');
  const { page } = s;
  const customer = page.getByTestId('message-customer');
  const before = await customer.count();
  const disclosedBefore = (await attemptOf(page))?.engine?.disclosed ?? [];
  const t0 = Date.now();
  await page.getByLabel('Ваш вопрос заказчику').fill(text);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [`[data-testid="message-customer"]`, before], { timeout: 15000 });
  await page.getByTestId('typing').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  const bubble = customer.last().locator('.bubble');
  const reply = ((await bubble.count()) ? await bubble.innerText() : await customer.last().innerText()).trim();
  const attempt = await attemptOf(page);
  const student = [...(attempt?.messages ?? [])].reverse().find((m) => m.role === 'student');
  const disclosed = attempt?.engine?.disclosed ?? [];
  s.n += 1;
  const entry = {
    n: s.n,
    question: text,
    reply,
    quality: student?.quality ?? null,
    intentId: student?.intentId ?? null,
    factIds: student?.factIds ?? [],
    newFacts: disclosed.filter((id) => !disclosedBefore.includes(id)),
    ms: Date.now() - t0,
  };
  appendFileSync(join(LOG_DIR, `${session}.jsonl`), `${JSON.stringify(entry)}\n`);
  return { reply };
}

function body(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, payload) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };
  try {
    if (url.pathname === '/intro') {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(BASE);
      await page.screenshot({ path: join(LOG_DIR, 'intro.png'), fullPage: true });
      const text = await visible(page);
      await context.close();
      return send(200, { screen: text });
    }
    if (url.pathname === '/screen') {
      const s = sessions.get(url.searchParams.get('session'));
      return s ? send(200, { screen: await visible(s.page) }) : send(404, { error: 'нет сессии' });
    }
    const data = await body(req);
    if (url.pathname === '/start') return send(200, await start(data.session, data.name ?? 'Студент'));
    if (url.pathname === '/ask') return send(200, await ask(data.session, data.text));
    if (url.pathname === '/stop') {
      await sessions.get(data.session)?.context.close();
      sessions.delete(data.session);
      return send(200, { ok: true });
    }
    send(404, { error: 'нет такого адреса' });
  } catch (error) {
    send(500, { error: String(error?.message ?? error) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`ux-audit driver on http://127.0.0.1:${PORT}`));
