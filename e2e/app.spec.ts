import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function start(page: Page, name = 'Ирина Тестова') {
  await page.goto('./');
  await page.getByLabel('Имя студента').fill(name);
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByTestId('message-customer').first()).toBeVisible();
}

/** Отправляет вопрос и ждёт появления ответа. Возвращает текст ответа. */
async function ask(page: Page, question: string): Promise<string> {
  const customer = page.getByTestId('message-customer');
  const before = await customer.count();
  await page.getByLabel('Ваш вопрос заказчику').fill(question);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(customer).toHaveCount(before + 1, { timeout: 5000 });
  await expect(page.getByTestId('typing')).toHaveCount(0);
  return (await customer.last().locator('.bubble').textContent()) ?? '';
}

async function pickCategory(page: Page, scope: Locator, title: string) {
  await scope.getByRole('combobox').click();
  await page.getByRole('option', { name: title, exact: true }).click();
}

async function fillRequirement(page: Page, text: string, category: string, submit: string) {
  const form = page.getByTestId('requirement-form');
  await form.getByLabel('Формулировка требования').fill(text);
  await pickCategory(page, form, category);
  await form.getByRole('button', { name: submit, exact: true }).click();
  await expect(form).toHaveCount(0);
}

async function capture(page: Page, text: string, category: string) {
  await page.getByTestId('message-customer').last().getByRole('button', { name: 'Сохранить как требование' }).click();
  await fillRequirement(page, text, category, 'Сохранить в реестр');
}

const nav = (page: Page, name: RegExp) => page.getByRole('button', { name }).first();

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('1. Запуск: учебный режим, проверка имени, нет выбора сложности', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: 'ТЗ Практикум' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('техническое задание');
  await expect(page.getByText('Узел горячей воды для моечной линии').first()).toBeVisible();
  await expect(page.getByText(/standard|strict|Строгий|Стандартный|seed/i)).toHaveCount(0);
  await expect(page.getByText('Ответы заказчика (тест)')).toHaveCount(0);

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByText('Укажите имя')).toBeVisible();
  await page.getByLabel('Имя студента').fill('Ирина');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByLabel('Ваш вопрос заказчику')).toBeVisible();
  await expect(page.getByTestId('mode-label')).toHaveCount(0);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tz-praktikum:attempt:v1') ?? 'null'));
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('tz-praktikum:attempt:v1') ?? 'null')?.difficulty)).toBe('learning');
  expect(saved === null || saved.version === 1).toBe(true);
});

test('2–4. Вопрос, ответ, прогресс, уточнение, повтор', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('coverage-percent')).toHaveText('0%');
  const input = page.getByLabel('Ваш вопрос заказчику');

  await input.fill('Какая температура воды нужна после теплообменника?');
  await input.press('Enter');
  await expect(page.getByTestId('typing')).toBeVisible();
  await expect(page.getByTestId('message-customer')).toHaveCount(2);
  const answer = await page.getByTestId('message-customer').last().locator('.bubble').textContent();
  expect(answer).toContain('60');
  await expect(page.getByTestId('typing')).toHaveCount(0);
  await expect(page.getByTestId('coverage-percent')).not.toHaveText('0%');
  await expect(page.getByTestId('explored-count')).toContainText('из 13');

  expect(await ask(page, 'Какое отклонение допустимо?')).toMatch(/2|двух/);
  // Кнопок «Уточнить» и «Повторить» нет; заказчик переспрашивает — появляется центральная метка.
  expect(await ask(page, 'Какое давление?')).not.toMatch(/\d/);
  await expect(page.getByTestId('message-note')).toContainText('Заказчик уточняет');
  await expect(page.getByRole('button', { name: 'Уточнить', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Задать снова' })).toHaveCount(0);
  expect((await ask(page, 'После насоса')).length).toBeGreaterThan(0);
});

test('«Расскажите всё» не выдаёт значений', async ({ page }) => {
  await start(page);
  expect(await ask(page, 'Расскажите всё про установку')).not.toMatch(/\d/);
});

test('5. Реестр: фиксация, правка, фильтры, объединение, удаление, источник', async ({ page }) => {
  await start(page);
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await page.getByTestId('message-customer').last().getByRole('button', { name: 'Сохранить как требование' }).click();
  const form = page.getByTestId('requirement-form');
  await expect(form.getByLabel('Формулировка требования')).not.toHaveValue('');
  await form.getByLabel('Формулировка требования').fill('');
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
  await expect(form).toContainText('не может быть пустым');
  await form.getByLabel('Формулировка требования').fill('Поддерживать температуру воды 60 °C');
  await pickCategory(page, form, 'Регулируемые параметры');
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('message-customer').last()).toContainText('В реестре');

  await ask(page, 'Какое отклонение допустимо?');
  await capture(page, 'Отклонение температуры ±2 °C', 'Регулируемые параметры');

  await nav(page, /Реестр требований/).click();
  const rows = page.getByTestId('requirement');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('registry-count')).toHaveText('2');

  await page.getByRole('button', { name: 'Добавить' }).click();
  await fillRequirement(page, 'Запись вручную', 'Документация', 'Добавить');
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('Добавлено вручную')).toBeVisible();

  const manual = rows.filter({ hasText: 'Запись вручную' });
  await manual.getByRole('button', { name: 'Требует уточнения' }).click();
  await manual.getByRole('button', { name: 'Противоречие' }).click();
  await page.getByRole('button', { name: 'Уточнить: 1' }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Уточнить: 1' }).click();
  await expect(rows).toHaveCount(3);

  await manual.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByTestId('requirement-form').getByLabel('Формулировка требования').fill('Запись исправлена');
  await page.getByTestId('requirement-form').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(rows.filter({ hasText: 'Запись исправлена' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Объединить' }).click();
  await rows.filter({ hasText: '60 °C' }).getByRole('checkbox').click();
  await rows.filter({ hasText: '±2' }).getByRole('checkbox').click();
  await page.getByLabel('Общая формулировка').fill('Температура 60 ±2 °C');
  await page.getByRole('button', { name: 'Объединить записи: 2' }).click();
  await expect(rows).toHaveCount(2);

  const edited = rows.filter({ hasText: 'Запись исправлена' });
  await edited.getByRole('button', { name: 'Удалить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
  await expect(rows).toHaveCount(2);
  await edited.getByRole('button', { name: 'Удалить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(rows).toHaveCount(1);

  await rows.first().getByRole('button', { name: 'Показать в переписке' }).click();
  await expect(page.locator('.msg-highlight')).toBeVisible();
});

test('6–7. ТЗ: 13 разделов, перенос, завершение, оценка, эталон', async ({ page }) => {
  await start(page);
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await capture(page, 'Поддерживать температуру воды после теплообменника 60 °C', 'Регулируемые параметры');
  await ask(page, 'Какая модель контроллера нужна?');

  await nav(page, /Редактор ТЗ/).click();
  await expect(page.getByTestId('tz-filled')).toHaveText('0 из 13');
  await expect(page.getByTestId('tz-hint')).toBeVisible();
  await page.getByLabel(/Текст раздела/).fill('Система автоматического управления узлом приготовления горячей воды моечной линии.');
  await expect(page.getByTestId('tz-filled')).toHaveText('1 из 13');

  await page.getByRole('button', { name: /Требования к автоматическому регулированию/ }).click();
  await page.getByTestId('add-to-tz').click();
  await expect(page.getByLabel(/Текст раздела/)).toHaveValue(/Поддерживать температуру/);
  await page.getByLabel(/Текст раздела/).fill('Система поддерживает температуру воды после теплообменника 60 °C.');

  await page.getByTestId('finish').click();
  await expect(page.getByTestId('finish-warning')).toContainText('Не заполнено разделов: 11');
  await page.getByRole('button', { name: 'Завершить и получить оценку' }).click();

  await expect(page.getByTestId('result')).toBeVisible();
  const score = Number((await page.getByTestId('score').textContent())?.match(/\d+/)?.[0]);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThan(40);
  await expect(page.getByText('Полнота диалога')).toBeVisible();
  await expect(page.getByTestId('missed')).toContainText('Пропущенные категории');
  await expect(page.getByTestId('recommendations')).toBeVisible();
  await expect(page.getByTestId('final-tz')).toContainText('Система автоматического управления');
  await page.getByRole('button', { name: /Полезные вопросы/ }).click();
  await expect(page.getByTestId('useful-questions')).toContainText('Какая модель контроллера нужна?');
  await page.getByRole('button', { name: /Эталон сведений/ }).click();
  await expect(page.getByTestId('etalon')).toContainText('Аварийная температура');
  await page.getByRole('button', { name: /История переписки/ }).click();
  await expect(page.getByTestId('transcript')).toContainText('Какая модель контроллера нужна?');
});

test('Эталон недоступен до завершения', async ({ page }) => {
  await start(page);
  await expect(page.getByText('Аварийная температура')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Результат' })).toHaveCount(0);
  await nav(page, /Мой прогресс/).click();
  await expect(page.getByText('Аварийная температура')).toHaveCount(0);
});

test('8. Перезагрузка восстанавливает экран, переписку, реестр и ТЗ; сброс с подтверждением', async ({ page }) => {
  await start(page, 'Восстановление');
  await ask(page, 'Какое давление нужно после насоса?');
  await capture(page, 'Давление после насоса 0,30 МПа', 'Регулируемые параметры');
  await nav(page, /Редактор ТЗ/).click();
  await page.getByLabel(/Текст раздела/).fill('Черновик раздела');
  await expect(page.getByTestId('save-state')).toContainText('Сохранено');

  await page.reload();
  await expect(page.getByLabel(/Текст раздела/)).toHaveValue('Черновик раздела');
  await nav(page, /Диалог/).click();
  await expect(page.getByTestId('message-student')).toHaveCount(1);
  await nav(page, /Реестр требований/).click();
  await expect(page.getByTestId('requirement')).toHaveCount(1);
  await expect(page.getByTestId('student-name')).toHaveText('Восстановление');

  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByRole('menuitem', { name: 'Начать заново' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('requirement')).toHaveCount(1);
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByRole('menuitem', { name: 'Начать заново' }).click();
  await page.getByRole('button', { name: 'Удалить и начать заново' }).click();
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible();
});

test('9. Экспорт и импорт файла прогресса', async ({ page }) => {
  await start(page, 'Экспорт');
  await ask(page, 'Какое давление до насоса?');
  await nav(page, /Редактор ТЗ/).click();
  await page.getByLabel(/Текст раздела/).fill('Текст для экспорта');
  await page.getByTestId('finish').click();
  await page.getByRole('button', { name: 'Завершить и получить оценку' }).click();
  await expect(page.getByTestId('score')).toBeVisible();

  // На экране результата выгрузок для студента нет, файл прогресса сохраняется из меню попытки.
  for (const id of ['export-md', 'export-txt', 'export-json', 'export-progress']) await expect(page.getByTestId(id)).toHaveCount(0);
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Сохранить файл прогресса' }).click()]);
  const progress = { name: file.suggestedFilename(), text: readFileSync((await file.path())!, 'utf8') };
  expect(progress.name).toMatch(/^progress-Экспорт-\d+\.json$/);

  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByRole('menuitem', { name: 'Начать заново' }).click();
  await page.getByRole('button', { name: 'Удалить и начать заново' }).click();

  await page.getByTestId('start-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByText(/версия/)).toBeVisible();
  await page.getByTestId('start-import').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(progress.text) });
  await expect(page.getByTestId('score')).toBeVisible();
  await expect(page.getByTestId('final-tz')).toContainText('Текст для экспорта');
});

test('Legacy: файл прогресса стандартного режима загружается без потерь', async ({ page }) => {
  await start(page, 'Старый');
  await ask(page, 'Какой напор у насоса?');
  const raw = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('tz-praktikum:attempt:v1')!);
    data.difficulty = 'standard';
    return JSON.stringify(data);
  });
  await page.evaluate((value) => localStorage.setItem('tz-praktikum:attempt:v1', value), raw);
  await page.reload();
  await expect(page.getByTestId('message-student')).toHaveCount(1);
  await expect(page.getByText('Незавершённая попытка из прежней версии', { exact: true })).toBeVisible();
});

test('Клавиатура: старт и отправка без мыши', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Имя студента').focus();
  await page.keyboard.type('Клавиатура');
  await page.keyboard.press('Enter');
  const input = page.getByLabel('Ваш вопрос заказчику');
  await input.focus();
  await page.keyboard.type('Какой напор у насоса?');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('message-customer')).toHaveCount(2);
  await expect(page.getByRole('log')).toHaveAttribute('aria-live', 'polite');
});

test.describe('10. Мобильная компоновка 375 px', () => {
  test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true });

  test('все функции доступны, горизонтальной прокрутки нет', async ({ page }) => {
    await start(page, 'Мобильный');
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);

    await ask(page, 'Какая температура воды нужна после теплообменника?');
    await capture(page, 'Температура воды после теплообменника 60 °C', 'Регулируемые параметры');
    expect(await noOverflow()).toBe(true);
    const box = await page.getByLabel('Ваш вопрос заказчику').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(760);

    await page.getByTestId('open-progress').click();
    await expect(page.getByRole('dialog').getByTestId('coverage-percent')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('open-registry').click();
    await expect(page.getByRole('dialog').getByTestId('requirement')).toHaveCount(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Показать в переписке' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Открыть боковую панель' }).click();
    await page.getByRole('button', { name: /Редактор ТЗ/ }).click();
    await page.getByLabel('Раздел ТЗ').click();
    await page.getByRole('option', { name: /^6\./ }).click();
    await page.getByLabel(/Текст раздела/).fill('Текст на телефоне');
    await page.getByTestId('finish').click();
    await page.getByRole('button', { name: 'Завершить и получить оценку' }).click();
    await expect(page.getByTestId('score')).toBeVisible();
    expect(await noOverflow()).toBe(true);
  });
});

test.describe('Мобильный сброс', () => {
  test.use({ viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true });

  test('«Начать заново» в боковом меню открывает подтверждение и сбрасывает попытку', async ({ page }) => {
    await start(page, 'Телефон');
    await page.getByRole('button', { name: 'Открыть боковую панель' }).click();
    await page.getByRole('button', { name: 'Меню попытки' }).click();
    await page.getByRole('menuitem', { name: 'Начать заново' }).tap();
    await expect(page.getByRole('button', { name: 'Удалить и начать заново' })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить и начать заново' }).tap();
    await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible();
  });
});

test('Тема и режим переключаются и сохраняются', async ({ page }) => {
  await start(page, 'Тема');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByRole('tab', { name: 'Светлая' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  await page.getByRole('menuitem', { name: 'По умолчанию' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Небо' }).click();
  await expect(page.locator('html')).toHaveCSS('--ui-radius', '0.75rem');

  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveCSS('--ui-radius', '0.75rem');
});

test('Редактор ТЗ: справа реестр, запись добавляется в выбранный раздел одной кнопкой', async ({ page }) => {
  await start(page, 'Раздел');
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await capture(page, 'Поддерживать температуру воды 60 °C', 'Регулируемые параметры');

  await nav(page, /Редактор ТЗ/).click();
  await expect(page.getByTestId('coverage-percent')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Требования к автоматическому регулированию/ }).click();
  await page.getByTestId('add-to-tz').click();
  await expect(page.getByLabel(/Текст раздела/)).toHaveValue(/Поддерживать температуру воды 60/);
  await expect(page.getByTestId('add-to-tz')).toBeDisabled();
});

test('Редактор ТЗ: записи в боковом реестре нельзя править и помечать', async ({ page }) => {
  await start(page, 'Только чтение');
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await capture(page, 'Поддерживать температуру воды 60 °C', 'Регулируемые параметры');
  await nav(page, /Редактор ТЗ/).click();
  const row = page.getByTestId('requirement');
  await expect(row).toHaveCount(1);
  for (const name of ['Редактировать', 'Требует уточнения', 'Противоречие', 'Удалить']) await expect(row.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Объединить' })).toHaveCount(0);
  await nav(page, /Реестр требований/).click();
  await expect(page.getByTestId('requirement').getByRole('button', { name: 'Редактировать' })).toBeVisible();
});

test('Редактор ТЗ: после удаления строки из текста запись можно добавить снова', async ({ page }) => {
  await start(page, 'Повтор');
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await capture(page, 'Поддерживать температуру воды 60 °C', 'Регулируемые параметры');
  await nav(page, /Редактор ТЗ/).click();
  await page.getByRole('button', { name: /Требования к автоматическому регулированию/ }).click();
  await page.getByTestId('add-to-tz').click();
  await expect(page.getByTestId('add-to-tz')).toBeDisabled();
  await page.getByLabel(/Текст раздела/).fill('');
  await expect(page.getByTestId('add-to-tz')).toBeEnabled();
  await page.getByTestId('add-to-tz').click();
  await expect(page.getByLabel(/Текст раздела/)).toHaveValue(/Поддерживать температуру воды 60/);
});

test('Логотип и фавикон красятся основным цветом выбранной темы', async ({ page }) => {
  await start(page, 'Цвет');
  const icon = () => page.evaluate(() => document.querySelector('link[rel="icon"]')!.getAttribute('href')!);
  const logoColor = () => page.locator('aside svg, [data-slot="header"] svg').first().evaluate((el) => getComputedStyle(el).color);
  await expect.poll(icon).toContain('data:image/svg+xml');
  const before = await icon();
  const beforeLogo = await logoColor();

  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByRole('menuitem', { name: 'По умолчанию' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Багрянец' }).click();
  await expect.poll(icon).not.toBe(before);
  expect(await logoColor()).not.toBe(beforeLogo);
});
