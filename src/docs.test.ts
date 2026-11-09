// Генератор справочных файлов: `npm run docs`. В обычном прогоне тестов пропускается.
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { scenario } from './data/scenario';
import { addRequirement, createAttempt, finishAttempt, sendQuestion, setTzText } from './state/attempt';
import { toMarkdown } from './state/exporters';
import { buildAnswerTemplate } from './engine/answerPack';

const KIND = { fact: 'Факт', unknown: 'Заказчик не знает', general: 'Общий вопрос', meta: 'Уточнение', social: 'Служебное' } as const;

it.runIf(import.meta.env.MODE === 'docs')('создаёт docs/intents.md, docs/otvety-zakazchika.json и docs/example-result.md', () => {
  const { intents, replies, facts, meta, ambiguities } = scenario;
  const answers = Object.values(replies).flat().flatMap((step) => step.variants).length;
  const lines = [
    '# Реализованные намерения',
    '',
    'Файл создан командой `npm run docs` из `src/data/intents.ts`. Правьте сценарий, а не этот файл.',
    '',
    `Намерений: ${intents.length}. Примеров формулировок: ${intents.flatMap((i) => i.examples).length}. Вариантов ответа: ${answers}. Фактов: ${facts.length}, из них обязательных: ${facts.filter((f) => f.requirementType === 'mandatory').length}.`,
    `Ответов на непонятный вопрос: ${meta.fallback.length + meta.fallbackStrict.length}. Встречных вопросов: ${ambiguities.flatMap((a) => [...a.questions, ...a.strictQuestions]).length}. Реакций на повтор: ${meta.repeatTemplates.length + meta.repeatAgainTemplates.length}. Реакций на неверное значение: ${meta.misheardDisclosed.length + meta.misheardCrossed.length + meta.misheardUndisclosed.length}.`,
    '',
    '| Намерение | Тип | Тема | Что раскрывает | Пример вопроса |',
    '|---|---|---|---|---|',
    ...intents.map((intent) => {
      const opened = (replies[intent.id] ?? []).flatMap((step) => step.facts);
      return `| \`${intent.id}\` — ${intent.title} | ${KIND[intent.kind]} | ${intent.topic} | ${opened.length ? opened.map((id) => `\`${id}\``).join(', ') : '—'} | ${intent.examples[0]} |`;
    }),
    '',
  ];
  writeFileSync('docs/intents.md', lines.join('\n'));
  writeFileSync('docs/otvety-zakazchika.json', JSON.stringify(buildAnswerTemplate(scenario), null, 2));

  let attempt = createAttempt(scenario, 'Пример Студент', 'standard', 2024);
  for (const text of [
    'Здравствуйте! Какая цель автоматизации?',
    'Расскажите всё про установку',
    'Какая температура воды нужна после теплообменника?',
    'Какое отклонение допустимо?',
    'При какой температуре предупреждать оператора?',
    'При какой температуре нужно остановить нагрев?',
    'Что должна делать система при аварийной температуре?',
    'Какое давление?',
    'После насоса',
    'Какая модель контроллера нужна?',
  ]) {
    attempt = sendQuestion(attempt, scenario, text).attempt;
  }
  attempt = addRequirement(attempt, { text: 'Поддерживать температуру воды после теплообменника 60 °C ±2 °C', category: 'regulated', needsClarification: false, sourceMessageId: attempt.messages[6].id });
  attempt = addRequirement(attempt, { text: 'Модель ПЛК предлагает исполнитель', category: 'reliability', needsClarification: true, sourceMessageId: attempt.messages[attempt.messages.length - 1].id });
  attempt = setTzText(attempt, 1, 'Система автоматического управления узлом приготовления горячей воды моечной линии.');
  attempt = setTzText(attempt, 6, 'Система поддерживает температуру воды после теплообменника 60 °C с отклонением не более ±2 °C.');
  attempt = setTzText(attempt, 8, 'Предупреждение по температуре при 70 °C. Авария по температуре при 75 °C: нагрев прекращается.');
  attempt = finishAttempt(attempt, scenario);
  writeFileSync('docs/example-result.md', toMarkdown(attempt, scenario));
});
