// E2E по ТЗ на исправление UX диалога: реальный интерфейс, без доступа к движку.
import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, url = './') {
  await page.goto(url);
  await page.getByLabel('Имя студента').fill('Иван Петров');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByTestId('message-customer').first()).toBeVisible();
}

async function ask(page: Page, question: string): Promise<string> {
  const customer = page.getByTestId('message-customer');
  const before = await customer.count();
  await page.getByLabel('Ваш вопрос заказчику').fill(question);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(customer).toHaveCount(before + 1, { timeout: 5000 });
  await expect(page.getByTestId('typing')).toHaveCount(0);
  return (await customer.last().locator('.bubble').textContent()) ?? '';
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('стартовый экран: время, пример вопроса, реестр, виды сведений, направления', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('time-plan')).toContainText('50–60');
  await expect(page.getByTestId('example-question')).toContainText('Здравствуйте');
  await expect(page.getByText('Реестр требований — ваши подтверждённые сведения')).toBeVisible();
  await expect(page.getByText('Есть сейчас')).toBeVisible();
  await expect(page.getByText('Предлагаете вы')).toBeVisible();
  // Ни одного значения из скрытой модели на стартовом экране.
  await expect(page.locator('body')).not.toContainText(/0,45|75 °C|2,2 кВт/);
});

test('приветствие + вопрос: заказчик здоровается и отвечает по сути', async ({ page }) => {
  await start(page);
  // Под приветствием нет кнопки сохранения: сведений в нём нет.
  await expect(page.getByTestId('message-customer').first().getByRole('button', { name: 'Сохранить как требование' })).toHaveCount(0);
  const answer = await ask(page, 'Здравствуйте. Из чего состоит узел?');
  expect(answer).toMatch(/здравств|добрый/i);
  expect(answer).toMatch(/теплообмен/i);
  await expect(page.getByTestId('message-customer').last().getByRole('button', { name: 'Сохранить как требование' })).toBeVisible();
});

test('технический вопрос с двумя атрибутами — один ответ без «по одному»', async ({ page }) => {
  await start(page);
  const answer = await ask(page, 'Какую температуру держать и какой допуск?');
  expect(answer).toMatch(/60/);
  expect(answer).toMatch(/2|двух/);
  expect(answer).not.toMatch(/по одному/i);
  const pump = await ask(page, 'Мощность, подача, напор насоса?');
  expect(pump).toMatch(/2,2/);
  expect(pump).toMatch(/32/);
});

test('переход «сейчас» → «нужно»: разные ответы', async ({ page }) => {
  await start(page);
  const now = await ask(page, 'Какие режимы работы есть сейчас?');
  expect(now).toMatch(/вручн|руками|оператор/i);
  expect(now).not.toMatch(/обслуживан/i);
  const future = await ask(page, 'Какие режимы нужно предусмотреть?');
  expect(future).toMatch(/обслуживан/i);
  const pumpNow = await ask(page, 'Как сейчас управляется насос?');
  expect(pumpNow).toMatch(/не уточн|на объекте/i);
});

test('неизвестное: честный ответ и отметка в реестре «требует уточнения»', async ({ page }) => {
  await start(page);
  const answer = await ask(page, 'Хорошо. Есть ли бак?');
  expect(answer).toMatch(/на объекте|не уточн|сведений нет/i);
  const last = page.getByTestId('message-customer').last();
  await expect(last.getByTestId('uncertainty-badge')).toContainText('обследования');
  await expect(last.getByRole('button', { name: 'Сохранить как требование' })).toHaveCount(0);
  await last.getByTestId('mark-clarify').click();
  const form = page.getByTestId('requirement-form');
  await expect(form.getByLabel('Формулировка требования')).toHaveValue(/Уточнить/);
  await expect(form.getByRole('checkbox', { name: 'Требует уточнения' })).toBeChecked();
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
  await expect(form).toHaveCount(0);
});

test('прогресс: доля обязательных сведений, без числа скрытых пунктов у неначатых тем', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('coverage-percent')).toHaveText('0%');
  const statuses = page.getByTestId('direction-status');
  await expect(statuses.first()).toHaveText(/Не начато/);
  await expect(page.getByTestId('progress')).not.toContainText(/\d+\/\d+/);
  await ask(page, 'Какую температуру держать и какой допуск?');
  await expect(page.getByTestId('explored-count')).toContainText('Затронуто');
  await expect(page.getByTestId('explored-count')).toContainText('из 13');
  const percent = Number((await page.getByTestId('coverage-percent').textContent())?.replace('%', ''));
  // Два обязательных сведения из 86 — несколько процентов, а не «8% тем».
  expect(percent).toBeGreaterThan(0);
  expect(percent).toBeLessThan(5);
});

test('режим преподавателя показывает диагностику, обычный — нет', async ({ page }) => {
  await start(page);
  await ask(page, 'Какие характеристики у насоса?');
  await expect(page.getByTestId('teacher-diagnostic')).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await start(page, './?teacher');
  await ask(page, 'Какие характеристики у насоса?');
  await expect(page.getByTestId('teacher-diagnostic').last()).toContainText('Паспорт');
});
