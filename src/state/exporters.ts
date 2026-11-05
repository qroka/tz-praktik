// Экспорт результата и файла прогресса. Файлы формируются в браузере и никуда не отправляются.
import type { Attempt, ChatMessage, Scenario } from '../types';
import { validateAttempt } from './attempt';

const DIFFICULTY_LABEL = { learning: 'Учебный', standard: 'Стандартный', strict: 'Строгий' } as const;

export const difficultyLabel = (difficulty: Attempt['difficulty']): string => DIFFICULTY_LABEL[difficulty];

const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const speaker = (message: ChatMessage, attempt: Attempt, scenario: Scenario): string =>
  message.role === 'student' ? attempt.studentName || 'Студент' : scenario.customer.name;

export function toMarkdown(attempt: Attempt, scenario: Scenario): string {
  const lines: string[] = [];
  const result = attempt.result;
  lines.push(`# ТЗ Практикум — результат`, '');
  lines.push(`- **Студент:** ${attempt.studentName}`);
  lines.push(`- **Кейс:** ${scenario.title}`);
  lines.push(`- **Режим:** ${difficultyLabel(attempt.difficulty)}`);
  lines.push(`- **Seed попытки:** ${attempt.seed}`);
  lines.push(`- **Начало:** ${formatDateTime(attempt.startedAt)}`);
  lines.push(`- **Завершение:** ${formatDateTime(attempt.finishedAt)}`, '');

  if (result) {
    lines.push(`## Оценка: ${result.total} из 100 — ${result.grade}`, '');
    lines.push(`- Полнота диалога: ${result.dialogueCompleteness}%`);
    lines.push(`- Полнота ТЗ: ${result.tzCompleteness}%`);
    lines.push(`- Найдено требований: ${result.foundRequirements}`);
    lines.push(`- Обязательных в диалоге: ${result.mandatoryDisclosed} из ${result.mandatoryTotal}`);
    lines.push(`- Обязательных в реестре: ${result.mandatoryInRegistry} из ${result.mandatoryTotal}`);
    lines.push(`- Обязательных в ТЗ: ${result.mandatoryInTz} из ${result.mandatoryTotal}`);
    lines.push(`- Сведений, которых не знает заказчик: ${result.unknownsFound} из ${result.unknownsTotal}`, '');

    lines.push('### Критерии', '', '| Критерий | Баллы | Комментарий |', '|---|---|---|');
    for (const part of result.parts) lines.push(`| ${part.label} | ${String(part.score).replace('.', ',')} / ${part.max} | ${part.note} |`);
    lines.push('');
    if (result.penalties.length) {
      lines.push('### Снижение оценки', '');
      for (const item of result.penalties) lines.push(`- ${item.label}: −${item.points}. ${item.detail}`);
      lines.push('');
    }
    if (result.missedCategories.length) {
      lines.push('### Пропущенные категории', '', ...result.missedCategories.map((item) => `- ${item}`), '');
    }
    if (result.contradictions.length) {
      lines.push('### Противоречия', '', ...result.contradictions.map((item) => `- ${item.source}: «${item.text}». ${item.detail}`), '');
    }
    if (result.generalQuestions.length) {
      lines.push('### Слишком общие вопросы', '', ...result.generalQuestions.map((item) => `- ${item.text}`), '');
    }
    if (result.usefulQuestions.length) {
      lines.push('### Вопросы, давшие полезную информацию', '', ...result.usefulQuestions.map((item) => `- ${item.text}`), '');
    }
    lines.push('### Рекомендации', '', ...result.recommendations.map((item) => `- ${item}`), '');
  }

  lines.push('## Техническое задание', '');
  for (const section of scenario.tzSections) {
    lines.push(`### ${section.id}. ${section.title}`, '', (attempt.tz[section.id] ?? '').trim() || '_Раздел не заполнен._', '');
  }

  lines.push('## Реестр требований', '');
  if (!attempt.requirements.length) lines.push('_Реестр пуст._', '');
  for (const category of scenario.categories) {
    const items = attempt.requirements.filter((item) => item.category === category.id);
    if (!items.length) continue;
    lines.push(`### ${category.title}`, '');
    for (const item of items) {
      const flags = [item.needsClarification ? 'требует уточнения' : '', item.conflict ? 'противоречие' : ''].filter(Boolean).join(', ');
      lines.push(`- ${item.text}${flags ? ` (${flags})` : ''}`);
    }
    lines.push('');
  }

  lines.push('## История переписки', '');
  for (const message of attempt.messages) {
    lines.push(`**${speaker(message, attempt, scenario)}** (${formatDateTime(message.at)}): ${message.text}`, '');
  }

  if (result) {
    lines.push('## Эталон сведений', '', '| Раздел ТЗ | Сведение | Значение | В диалоге | В ТЗ |', '|---|---|---|---|---|');
    for (const row of result.etalon) {
      lines.push(`| ${row.section} | ${row.label} | ${row.value} | ${row.disclosed ? 'да' : 'нет'} | ${row.inTz ? 'да' : 'нет'} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function toPlainText(attempt: Attempt, scenario: Scenario): string {
  return toMarkdown(attempt, scenario)
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/_(Раздел не заполнен\.|Реестр пуст\.)_/g, '$1')
    .replace(/^\|---.*$/gm, '')
    .replace(/^\|\s?(.*?)\s?\|$/gm, (_, row: string) => row.split(' | ').join(' — '));
}

export function toResultJson(attempt: Attempt, scenario: Scenario): string {
  return JSON.stringify(
    {
      service: 'ТЗ Практикум',
      scenario: { id: scenario.id, title: scenario.title },
      student: attempt.studentName,
      difficulty: attempt.difficulty,
      seed: attempt.seed,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      result: attempt.result,
      tz: scenario.tzSections.map((section) => ({ id: section.id, title: section.title, text: attempt.tz[section.id] ?? '' })),
      requirements: attempt.requirements,
      messages: attempt.messages.map(({ id, role, text, at, quality }) => ({ id, role, text, at, quality })),
    },
    null,
    2,
  );
}

export function toProgressJson(attempt: Attempt): string {
  return JSON.stringify(attempt, null, 2);
}

export function progressFileName(attempt: Attempt): string {
  const name = attempt.studentName.trim().replace(/[^\p{L}\d-]+/gu, '_') || 'student';
  return `progress-${name}-${attempt.seed}.json`;
}

export function parseProgress(text: string, scenario: Scenario): ReturnType<typeof validateAttempt> {
  try {
    return validateAttempt(JSON.parse(text), scenario);
  } catch {
    return { ok: false, error: 'Не удалось прочитать файл: это не JSON.' };
  }
}

export function downloadFile(fileName: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
