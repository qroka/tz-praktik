// Проходит полный сценарий в браузере и снимает ключевые экраны на всех проверяемых ширинах.
// Запуск: сначала `npm run preview -- --port 4173`, затем `npm run screenshots`.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.argv[2] ?? 'docs/screenshots';
const WIDTHS = [
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 740],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const problems = [];
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) problems.push(`console ${message.type()}: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

async function audit(label) {
  const report = await page.evaluate(() => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) out.push(`горизонтальная прокрутка страницы: ${doc.scrollWidth} > ${window.innerWidth}`);
    for (const el of document.querySelectorAll('button, .tab, .chip, .btn, .field__label, .bubble, h1, h2, h3, .req__text, .progress-row__name')) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`обрезан текст: ${el.textContent.slice(0, 40)}`);
      if (rect.right > window.innerWidth + 1) out.push(`за правым краем: ${el.textContent.slice(0, 40)} (${Math.round(rect.right)})`);
      if (rect.left < -1) out.push(`за левым краем: ${el.textContent.slice(0, 40)}`);
    }
    return out;
  });
  for (const line of report) problems.push(`[${label}] ${line}`);
}

async function shoot(name) {
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    await audit(`${name} ${width}`);
    await page.screenshot({ path: `${OUT}/${name}-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(80);
}

async function ask(text) {
  const customer = page.getByTestId('message-customer');
  const before = await customer.count();
  await page.getByLabel('Ваш вопрос заказчику').fill(text);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await customer.nth(before).waitFor();
}

async function capture(text, category) {
  await page.getByTestId('message-customer').last().getByRole('button', { name: 'Зафиксировать' }).click();
  const form = page.getByTestId('requirement-form');
  await form.getByLabel('Формулировка требования').fill(text);
  await form.getByLabel('Категория').selectOption({ label: category });
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
}

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await shoot('01-start');

await page.getByRole('button', { name: 'Начать диалог' }).click();
await shoot('02-start-error');
await page.getByLabel('Имя студента').fill('Ирина Колесникова');
await page.getByRole('radio', { name: /Учебный/ }).check();
await page.getByRole('button', { name: 'Начать диалог' }).click();
await page.getByTestId('message-customer').first().waitFor();
await shoot('03-dialog-empty');

const script = [
  ['Здравствуйте! Подскажите, для чего вам нужна автоматизация?', null],
  ['Расскажите всё про установку', null],
  ['Какая температура воды нужна после теплообменника?', ['Температура воды после теплообменника: 60 °C', 'Регулируемые параметры']],
  ['Какое отклонение допустимо?', ['Допустимое отклонение температуры: ±2 °C', 'Регулируемые параметры']],
  ['При какой температуре предупреждать оператора?', ['Предупреждение при температуре 70 °C', 'Предупредительная сигнализация']],
  ['При какой температуре нужно остановить нагрев?', ['Аварийная температура 75 °C, нагрев прекращается', 'Аварийные защиты']],
  ['Какое давление?', null],
  ['После насоса', ['Давление после насоса 0,30 МПа', 'Регулируемые параметры']],
  ['Значит, давление после насоса 0,35 МПа?', null],
  ['Какая модель контроллера нужна?', ['Модель ПЛК предлагает исполнитель, требуется промышленный контроллер с резервом', 'Надёжность и безопасность']],
  [
    'У меня довольно длинный вопрос: мы обсуждали температуру, а теперь хочу понять, что должна показывать панель оператора на основном экране, какие параметры он обязан видеть постоянно и что у него должно быть перед глазами во время обычной смены?',
    ['Основной экран показывает температуру после теплообменника и давление до и после насоса', 'Операторский интерфейс'],
  ],
];
for (const [question, requirement] of script) {
  await ask(question);
  if (requirement) await capture(...requirement);
}
await page.getByRole('button', { name: 'Добавить' }).first().click();
const manual = page.getByTestId('requirement-form');
await manual.getByLabel('Формулировка требования').fill('Уточнить реквизиты документа: основание для разработки. Очень длинная формулировка записи, чтобы проверить перенос строк в реестре и отсутствие обрезанного текста на узких экранах.');
await manual.getByLabel('Категория').selectOption({ label: 'Назначение и цели' });
await manual.getByRole('button', { name: 'Добавить' }).click();
const flagged = page.getByTestId('requirement').filter({ hasText: 'реквизиты' });
await flagged.getByRole('button', { name: 'Требует уточнения' }).click();
await page.waitForTimeout(300);
await shoot('04-dialog');

await page.getByTestId('message-customer').last().getByRole('button', { name: 'Зафиксировать' }).click();
await shoot('05-capture-form');
await page.getByTestId('requirement-form').getByRole('button', { name: 'Отмена' }).click();

for (const [width, height] of [[768, 1024], [390, 844]]) {
  await page.setViewportSize({ width, height });
  await page.getByTestId('open-registry').click();
  await page.waitForTimeout(150);
  await audit(`06-registry ${width}`);
  await page.screenshot({ path: `${OUT}/06-registry-sheet-${width}.png` });
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await page.getByRole('button', { name: 'Кейс' }).click();
  await page.waitForTimeout(150);
  await audit(`07-case ${width}`);
  await page.screenshot({ path: `${OUT}/07-case-sheet-${width}.png` });
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
}
await page.setViewportSize({ width: 1440, height: 900 });

await page.getByRole('button', { name: 'Техническое задание' }).click();
await shoot('08-tz-empty');
const tz = {
  1: 'Система автоматического управления узлом приготовления горячей воды моечной линии.',
  3: 'Система обеспечивает подачу воды на мойку с заданной температурой и давлением и исключает ручное регулирование оператором.',
  6: 'Система поддерживает температуру воды после теплообменника 60 °C с допустимым отклонением ±2 °C.\nТребуемое давление после насоса 0,30 МПа.',
  8: 'Предупреждение по температуре при 70 °C.\nАвария по температуре при 75 °C: нагрев прекращается.',
};
for (const [id, text] of Object.entries(tz)) {
  await page.getByRole('button', { name: new RegExp(`^${id}\\D`) }).click();
  await page.getByLabel(/Текст раздела/).fill(text);
}
await page.getByRole('button', { name: /^10\D/ }).click();
await shoot('09-tz-filled');

await page.getByText('Основной экран показывает температуру').click();
await page.getByRole('button', { name: /Перенести в раздел 10/ }).click();
await page.getByTestId('finish').click();
await page.waitForTimeout(150);
await shoot('10-finish-confirm');
await page.getByRole('button', { name: 'Завершить и получить оценку' }).click();
await page.getByTestId('score').waitFor();
await page.waitForTimeout(250);
await shoot('11-result');
await page.evaluate(() => document.querySelector('.result-scroll').scrollTo(0, 700));
await shoot('12-result-details');
await page.getByTestId('etalon').locator('summary').click();
await page.getByTestId('etalon').scrollIntoViewIfNeeded();
await shoot('13-result-etalon');

await page.emulateMedia({ media: 'print' });
await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
await page.waitForTimeout(100);
await page.pdf({ path: `${OUT}/14-print.pdf`, format: 'A4' });
await page.setViewportSize({ width: 800, height: 1100 });
await page.screenshot({ path: `${OUT}/14-print.png` });
await page.setViewportSize({ width: 1440, height: 900 });
await page.emulateMedia({ media: 'screen' });

// Проверка на сенсорном телефоне: действия видны всегда.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
const phonePage = await phone.newPage();
await phonePage.goto(BASE);
await phonePage.getByLabel('Имя студента').fill('Телефон');
await phonePage.getByRole('button', { name: 'Начать диалог' }).click();
for (const text of ['Какая температура воды нужна после теплообменника?', 'Какая модель контроллера нужна?']) {
  const customer = phonePage.getByTestId('message-customer');
  const before = await customer.count();
  await phonePage.getByLabel('Ваш вопрос заказчику').fill(text);
  await phonePage.getByRole('button', { name: 'Отправить' }).click();
  await customer.nth(before).waitFor();
}
await phonePage.waitForTimeout(200);
await phonePage.screenshot({ path: `${OUT}/15-phone-touch-390.png` });
await phonePage.getByTestId('message-customer').last().getByRole('button', { name: 'Зафиксировать' }).click();
await phonePage.waitForTimeout(200);
await phonePage.screenshot({ path: `${OUT}/16-phone-capture-390.png` });
await phone.close();

await browser.close();
if (problems.length) {
  console.log(`НАЙДЕНЫ ЗАМЕЧАНИЯ (${problems.length}):`);
  console.log([...new Set(problems)].join('\n'));
} else {
  console.log('Замечаний нет: консоль чистая, прокрутки и обрезанного текста нет.');
}
