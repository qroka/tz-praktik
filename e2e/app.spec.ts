import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function start(page: Page, name = 'Ирина Тестова', level?: RegExp) {
  await page.goto('/');
  await page.getByLabel('Имя студента').fill(name);
  if (level) await page.getByRole('radio', { name: level }).check();
  await page.getByRole('button', { name: 'Начать диалог' }).click();
  await expect(page.getByTestId('message-customer').first()).toBeVisible();
}

/** Отправляет вопрос и ждёт появления ответа. Возвращает текст ответа. */
async function ask(page: Page, question: string): Promise<string> {
  const customer = page.getByTestId('message-customer');
  const before = await customer.count();
  await page.getByLabel('Ваш вопрос заказчику').fill(question);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(customer).toHaveCount(before + 1, { timeout: 5000 });
  return (await customer.last().locator('.bubble').textContent()) ?? '';
}

async function capture(page: Page, text: string, category: string) {
  await page.getByTestId('message-customer').last().getByRole('button', { name: 'Зафиксировать' }).click();
  const form = page.getByTestId('requirement-form');
  await form.getByLabel('Формулировка требования').fill(text);
  await form.getByLabel('Категория').selectOption({ label: category });
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
  await expect(form).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('1. Запуск новой попытки и проверка ввода', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ТЗ Практикум' })).toBeVisible();
  await expect(page.getByText('Узел горячей воды для моечной линии')).toBeVisible();
  await expect(page.getByText('тем для исследования')).toBeVisible();
  await expect(page.getByText('скрытых требований')).toBeVisible();

  await page.getByRole('button', { name: 'Начать диалог' }).click();
  await expect(page.getByRole('alert')).toContainText('Укажите имя');
  await page.getByLabel('Имя студента').fill('Ирина');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Начать диалог' }).click();
  await expect(page.getByLabel('Ваш вопрос заказчику')).toBeVisible();
  await expect(page.getByTestId('registry-empty')).toBeVisible();
});

test('2–4. Вопрос, релевантный ответ, индикатор набора, уточнение', async ({ page }) => {
  await start(page);
  const input = page.getByLabel('Ваш вопрос заказчику');

  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('alert')).toContainText('напишите вопрос');

  await input.fill('Какая температура воды нужна после теплообменника?');
  await input.press('Enter');
  await expect(page.getByTestId('typing')).toBeVisible();
  await expect(page.getByTestId('message-customer')).toHaveCount(2);
  const answer = await page.getByTestId('message-customer').last().locator('.bubble').textContent();
  expect(answer).toContain('60');
  expect(answer).not.toMatch(/70|75/);
  await expect(page.getByTestId('typing')).toHaveCount(0);

  const follow = await ask(page, 'Какое отклонение допустимо?');
  expect(follow).toMatch(/2|двух/);

  const vague = await ask(page, 'Какое давление?');
  expect(vague).not.toMatch(/\d/);
  expect(vague).toMatch(/давлен/i);
  const resolved = await ask(page, 'После насоса');
  expect(resolved).toMatch(/0,3/);

  // Уточнение привязывается к конкретному сообщению.
  await page.getByTestId('message-customer').nth(1).getByRole('button', { name: 'Уточнить' }).click();
  await expect(page.getByTestId('reply-target')).toContainText('Уточнение');
  const precise = await ask(page, 'Это точно или примерно?');
  expect(precise.length).toBeGreaterThan(0);
  await expect(page.getByTestId('reply-target')).toHaveCount(0);

  // Повторить вопрос: текст возвращается в поле ввода.
  await page.getByTestId('message-student').first().getByRole('button', { name: 'Задать снова' }).click();
  await expect(input).toHaveValue('Какая температура воды нужна после теплообменника?');
});

test('«Расскажите всё» не выдаёт значений одним сообщением', async ({ page }) => {
  await start(page);
  const answer = await ask(page, 'Расскажите всё про установку');
  expect(answer).not.toMatch(/\d/);
});

test('5. Сохранение требования: правка, фильтры, отметки, объединение, удаление', async ({ page }) => {
  await start(page);
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await page.getByTestId('message-customer').last().getByRole('button', { name: 'Зафиксировать' }).click();
  const form = page.getByTestId('requirement-form');
  await expect(form.getByLabel('Формулировка требования')).not.toHaveValue('');
  await form.getByLabel('Формулировка требования').fill('');
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
  await expect(form.getByRole('alert').first()).toContainText('не может быть пустым');
  await form.getByLabel('Формулировка требования').fill('Поддерживать температуру воды 60 °C');
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();
  await expect(form.getByRole('alert')).toContainText('Выберите категорию');
  await form.getByLabel('Категория').selectOption({ label: 'Регулируемые параметры' });
  await form.getByRole('button', { name: 'Сохранить в реестр' }).click();

  const rows = page.getByTestId('requirement');
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('registry-count')).toHaveText('1');
  await expect(rows.first()).toContainText('Сообщение №');
  await expect(page.getByTestId('message-customer').last()).toContainText('В реестре');

  await ask(page, 'Какое отклонение допустимо?');
  await capture(page, 'Отклонение температуры ±2 °C', 'Регулируемые параметры');
  await expect(rows).toHaveCount(2);

  // Ручное добавление.
  await page.getByRole('button', { name: 'Добавить' }).click();
  const manual = page.getByTestId('requirement-form');
  await manual.getByLabel('Формулировка требования').fill('Запись вручную');
  await manual.getByLabel('Категория').selectOption({ label: 'Документация' });
  await manual.getByRole('button', { name: 'Добавить' }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('Добавлено вручную')).toBeVisible();

  // Отметки и фильтры.
  const last = rows.filter({ hasText: 'Запись вручную' });
  await last.getByRole('button', { name: 'Требует уточнения' }).click();
  await last.getByRole('button', { name: 'Противоречие' }).click();
  await page.getByRole('button', { name: 'Уточнить: 1' }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Уточнить: 1' }).click();
  await page.getByLabel('Фильтр по категории').selectOption({ label: 'Регулируемые параметры' });
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Фильтр по категории').selectOption({ label: 'Все категории' });

  // Редактирование и смена категории.
  await last.getByRole('button', { name: 'Редактировать' }).click();
  const edit = page.getByTestId('requirement-form');
  await edit.getByLabel('Формулировка требования').fill('Запись исправлена');
  await edit.getByLabel('Категория').selectOption({ label: 'Назначение и цели' });
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Назначение и цели' })).toBeVisible();

  // Объединение.
  await page.getByRole('button', { name: 'Объединить' }).click();
  await rows.filter({ hasText: '60 °C' }).getByLabel('Выбрать для объединения').check();
  await rows.filter({ hasText: '±2' }).getByLabel('Выбрать для объединения').check();
  await page.getByLabel('Общая формулировка').fill('Температура 60 ±2 °C');
  await page.getByRole('button', { name: 'Объединить записи: 2' }).click();
  await expect(rows).toHaveCount(2);

  // Удаление с подтверждением.
  const merged = rows.filter({ hasText: 'Запись исправлена' });
  await merged.getByRole('button', { name: 'Удалить' }).click();
  await merged.getByRole('button', { name: 'Отмена' }).click();
  await expect(rows).toHaveCount(2);
  await merged.getByRole('button', { name: 'Удалить' }).click();
  await merged.getByRole('group', { name: 'Подтверждение удаления' }).getByRole('button', { name: 'Удалить' }).click();
  await expect(rows).toHaveCount(1);

  // Ссылка на источник.
  await rows.first().getByRole('button', { name: /Сообщение №/ }).click();
  await expect(page.locator('.msg--highlight')).toBeVisible();
});

test('6–7. Заполнение ТЗ, перенос требования, завершение и оценка', async ({ page }) => {
  await start(page);
  await ask(page, 'Какая температура воды нужна после теплообменника?');
  await capture(page, 'Поддерживать температуру воды после теплообменника 60 °C', 'Регулируемые параметры');
  await ask(page, 'Какая модель контроллера нужна?');

  await page.getByRole('button', { name: 'Техническое задание' }).click();
  await expect(page.getByTestId('tz-filled')).toHaveText('0 из 13');
  await page.getByRole('button', { name: /Наименование системы/ }).click();
  await page.getByLabel(/Текст раздела/).fill('Система автоматического управления узлом приготовления горячей воды моечной линии.');
  await expect(page.getByTestId('tz-filled')).toHaveText('1 из 13');

  await page.getByRole('button', { name: /Требования к автоматическому регулированию/ }).click();
  await page.getByText('Поддерживать температуру воды после теплообменника 60 °C').click();
  await page.getByRole('button', { name: /Перенести в раздел 6/ }).click();
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
  await expect(page.getByText('Полнота ТЗ')).toBeVisible();
  await expect(page.getByText('Найдено требований')).toBeVisible();
  await expect(page.getByTestId('missed')).toContainText('Пропущенные категории');
  await expect(page.getByTestId('useful-questions')).toContainText('Какая модель контроллера нужна?');
  await expect(page.getByTestId('final-tz')).toContainText('Система автоматического управления');
  await page.getByTestId('etalon').locator('summary').click();
  await expect(page.getByTestId('etalon')).toContainText('Аварийная температура');
  await page.getByTestId('transcript').locator('summary').click();
  await expect(page.getByTestId('transcript')).toContainText('Какая модель контроллера нужна?');
});

test('Эталон недоступен до завершения', async ({ page }) => {
  await start(page);
  await expect(page.getByText('Аварийная температура')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Результат' })).toHaveCount(0);
});

test('8. Перезагрузка страницы и восстановление', async ({ page }) => {
  await start(page, 'Восстановление');
  await ask(page, 'Какое давление нужно после насоса?');
  await capture(page, 'Давление после насоса 0,30 МПа', 'Регулируемые параметры');
  await page.getByRole('button', { name: 'Техническое задание' }).click();
  await page.getByLabel(/Текст раздела/).fill('Черновик раздела');
  await expect(page.getByTestId('save-state')).toContainText('Сохранено');

  await page.reload();
  await expect(page.getByLabel(/Текст раздела/)).toHaveValue('Черновик раздела');
  await page.getByRole('button', { name: 'Диалог' }).click();
  await expect(page.getByTestId('message-student')).toHaveCount(1);
  await expect(page.getByTestId('requirement')).toHaveCount(1);
  await expect(page.getByText('Восстановление', { exact: true })).toBeVisible();

  // Сброс с подтверждением.
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByTestId('menu-reset').click();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('message-student')).toHaveCount(1);
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByTestId('menu-reset').click();
  await page.getByRole('button', { name: 'Удалить и начать заново' }).click();
  await expect(page.getByRole('heading', { name: 'ТЗ Практикум' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ТЗ Практикум' })).toBeVisible();
});

test('9. Экспорт результата и импорт файла прогресса', async ({ page }) => {
  await start(page, 'Экспорт');
  await ask(page, 'Какое давление до насоса?');
  await page.getByRole('button', { name: 'Техническое задание' }).click();
  await page.getByLabel(/Текст раздела/).fill('Текст для экспорта');
  await page.getByTestId('finish').click();
  await page.getByRole('button', { name: 'Завершить и получить оценку' }).click();
  await expect(page.getByTestId('score')).toBeVisible();

  const download = async (testId: string) => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
    return { name: file.suggestedFilename(), text: readFileSync((await file.path())!, 'utf8') };
  };

  const md = await download('export-md');
  expect(md.name).toBe('result.md');
  expect(md.text).toContain('# ТЗ Практикум');
  expect(md.text).toContain('Текст для экспорта');

  const txt = await download('export-txt');
  expect(txt.name).toBe('result.txt');
  expect(txt.text).not.toContain('**');

  const json = await download('export-json');
  expect(json.name).toBe('result.json');
  expect(JSON.parse(json.text).student).toBe('Экспорт');

  const progress = await download('export-progress');
  expect(progress.name).toMatch(/^progress-Экспорт-\d+\.json$/);

  // Импорт после сброса.
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByTestId('menu-reset').click();
  await page.getByRole('button', { name: 'Удалить и начать заново' }).click();

  await page.getByTestId('start-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('версия');

  await page.getByTestId('start-import').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(progress.text) });
  await expect(page.getByTestId('score')).toBeVisible();
  await expect(page.getByTestId('final-tz')).toContainText('Текст для экспорта');
});

test('Импорт поверх открытой попытки требует подтверждения', async ({ page }) => {
  await start(page, 'Первый');
  await ask(page, 'Какой напор у насоса?');
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-export').click()]);
  const saved = readFileSync((await file.path())!);
  await ask(page, 'Какая мощность двигателя насоса?');
  await expect(page.getByTestId('message-student')).toHaveCount(2);

  await page.getByTestId('menu-import').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: saved });
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('message-student')).toHaveCount(2);

  await page.getByTestId('menu-import').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: saved });
  await page.getByRole('button', { name: 'Загрузить файл' }).click();
  await expect(page.getByTestId('message-student')).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('загружена');
});

test('Учебный режим показывает направления, строгий скрывает прогресс', async ({ page }) => {
  await start(page, 'Учебный', /Учебный/);
  await expect(page.getByTestId('directions')).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await start(page, 'Строгий', /Строгий/);
  await expect(page.getByTestId('directions')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveCount(0);
  await expect(page.getByText('Строгий режим')).toBeVisible();
});

test('Клавиатура: форма старта и отправка проходят без мыши', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Имя студента').focus();
  await page.keyboard.type('Клавиатура');
  await page.keyboard.press('Enter');
  const input = page.getByLabel('Ваш вопрос заказчику');
  await input.focus();
  await page.keyboard.type('Какой напор у насоса?');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('message-customer')).toHaveCount(2);
  await expect(input).toBeFocused();
  await expect(page.getByRole('log')).toHaveAttribute('aria-live', 'polite');
});

test.describe('10. Мобильная компоновка', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('чат — основной экран, панели открываются отдельно', async ({ page }) => {
    await start(page, 'Мобильный');
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);
    await expect(page.getByRole('complementary', { name: 'Реестр требований' })).toHaveCount(0);

    const input = page.getByLabel('Ваш вопрос заказчику');
    const box = await input.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(780);

    await ask(page, 'Какая температура воды нужна после теплообменника?');
    await capture(page, 'Температура воды после теплообменника 60 °C', 'Регулируемые параметры');
    expect(await noOverflow()).toBe(true);
    const after = await input.boundingBox();
    expect(after!.y + after!.height).toBeLessThanOrEqual(780);

    await page.getByRole('button', { name: 'Кейс' }).click();
    await expect(page.getByRole('dialog', { name: 'Описание кейса' })).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть панель' }).click();

    await page.getByTestId('open-registry').click();
    const sheet = page.getByRole('dialog', { name: 'Реестр требований' });
    await expect(sheet.getByTestId('requirement')).toHaveCount(1);
    await sheet.getByRole('button', { name: /Сообщение №/ }).click();
    await expect(sheet).toHaveCount(0);

    await page.getByRole('button', { name: 'ТЗ', exact: true }).click();
    await page.getByLabel('Раздел ТЗ').selectOption('6');
    await page.getByTestId('open-picker').click();
    await page.getByRole('dialog').getByRole('button', { name: /Закрыть/ }).click();
    await page.getByLabel(/Текст раздела/).fill('Текст на телефоне');
    await page.getByTestId('finish').click();
    await page.getByRole('button', { name: 'Завершить и получить оценку' }).click();
    await expect(page.getByTestId('score')).toBeVisible();
    expect(await noOverflow()).toBe(true);
  });
});

test('Ответы заказчика (тест): шаблон, загрузка, проверка вопросов, диалог, возврат', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-answers').click();
  const lab = page.getByTestId('answer-lab');
  await expect(lab).toContainText('Сейчас работают исходные ответы');

  const [template] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lab-template').click()]);
  expect(template.suggestedFilename()).toBe('otvety-zakazchika.json');
  const pack = JSON.parse(readFileSync((await template.path())!, 'utf8'));
  expect(pack.answers.length).toBeGreaterThan(50);

  await page.getByTestId('lab-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ "format": ') });
  await expect(page.getByTestId('lab-errors')).toContainText('JSON');

  const temp = pack.answers.find((entry: { id: string }) => entry.id === 'temp_setpoint');
  temp.replies = ['На мойку нужно 60 градусов, не меньше.'];
  pack.title = 'Черновик Иры';
  pack.answers.push({ title: 'Персонал', questions: ['Кто будет обслуживать систему?'], replies: ['Наши наладчики, по двое на смену.'] });
  await page.getByTestId('lab-file').setInputFiles({ name: 'my.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.getByTestId('lab-errors')).toHaveCount(0);
  await expect(page.getByTestId('lab-summary')).toContainText('новых: 1');
  await expect(lab).toContainText('Черновик Иры');

  await page.getByLabel('Вопросы студента, по одному на строку').fill('Какая температура воды нужна после теплообменника?\nКто будет обслуживать систему?\nабракадабра');
  await page.getByTestId('lab-run').click();
  const rows = page.getByTestId('lab-rows').locator('li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('не меньше');
  await expect(rows.nth(1)).toContainText('наладчики');
  await expect(rows.nth(2)).toContainText('Не понял');
  await expect(rows.nth(0)).toContainText('temp_setpoint');
  await expect(rows.nth(0)).toContainText('оценка:');
  await expect(rows.nth(2)).toContainText('Нет подходящего правила');
  const [csv] = await Promise.all([page.waitForEvent('download'), lab.getByRole('button', {name: 'Скачать таблицу (Excel)'}).click()]);
  const exported = readFileSync((await csv.path())!, 'utf8');
  expect(exported).toContain('intentId');
  expect(exported).toContain('Причина');
  expect(exported).toContain('temp_setpoint');

  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(page.getByTestId('answers-active')).toContainText('Черновик Иры');
  await page.getByLabel('Имя студента').fill('Ира');
  await page.getByRole('button', { name: 'Начать диалог' }).click();
  await expect(page.getByTestId('answers-banner')).toContainText('Черновик Иры');
  expect(await ask(page, 'Какая температура воды нужна после теплообменника?')).toBe('На мойку нужно 60 градусов, не меньше.');

  await page.reload();
  await expect(page.getByTestId('answers-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Меню попытки' }).click();
  await page.getByTestId('menu-answers').click();
  await page.getByTestId('lab-reset').click();
  await expect(page.getByTestId('answer-lab')).toContainText('Сейчас работают исходные ответы');
  await page.getByRole('button', { name: 'Закрыть панель' }).click();
  await expect(page.getByTestId('answers-banner')).toHaveCount(0);
});
