// Проходит учебный сценарий в браузере и снимает ключевые экраны на проверяемых ширинах.
// Запуск: сначала `npm run preview -- --port 4173`, затем `npm run screenshots [папка]`.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/tz-praktik/';
const OUT = process.argv[2] ?? 'docs/screenshots';
const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [430, 900],
  [375, 760],
  [320, 640],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];

for (const [width, height] of SIZES) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 860 });
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${width}: ${error.message}`));
  page.on('console', (message) => message.type() === 'error' && problems.push(`${width}: ${message.text()}`));
  const shot = (name) => page.screenshot({ path: `${OUT}/${width}-${name}.png` });

  await page.goto(BASE);
  await shot('start');
  await page.getByLabel('Имя студента').fill('Ирина Тестова');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  for (const question of ['Какая температура воды нужна после теплообменника?', 'Какое отклонение допустимо?', 'Какое давление после насоса?']) {
    const before = await page.getByTestId('message-customer').count();
    await page.getByLabel('Ваш вопрос заказчику').fill(question);
    await page.getByRole('button', { name: 'Отправить' }).click();
    await page.waitForFunction((count) => document.querySelectorAll('[data-testid="message-customer"]').length > count, before);
    await page.waitForTimeout(300);
  }
  await shot('dialog');
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (hasOverflow) problems.push(`${width}: горизонтальная прокрутка на экране диалога`);

  const screens = [[/Реестр требований/, 'registry'], [/Редактор ТЗ/, 'tz'], [/Мой прогресс/, 'progress']];
  for (const [label, name] of screens) {
    // Уже 1024 px боковая панель выезжает по кнопке меню.
    if (width < 1024) await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: label }).first().click();
    await page.waitForTimeout(250);
    await shot(name);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push(`${width}: горизонтальная прокрутка на экране «${name}»`);
  }
  await context.close();
}

await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Снимки сохранены в ${OUT}`);
