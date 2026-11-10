// Анализ журналов UX-аудита: метрики по направлениям, покрытие обязательных сведений.
// Запуск: npx vitest run --config scripts/ux-audit/vitest.audit.config.ts
// Результат: docs/ux-audit/metrics.json и docs/ux-audit/metrics.md
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { scenario } from '../../src/data/scenario';

type Entry = { n: number; question: string; reply: string; quality: string; intentId: string | null; factIds: string[]; newFacts: string[] };

const LOGS = 'docs/ux-audit/logs';
const PERSONAS = [
  ['ivan', 'Иван (средняя подготовка)'],
  ['weak', 'Студент А (слабая)'],
  ['strong', 'Студент Б (уверенная)'],
] as const;

/** 12 направлений задания. Категории фактов сценария сводятся к ним; вопрос без фактов — по словам вопроса. */
const DIRECTIONS: { id: string; title: string; categories: string[]; words: RegExp }[] = [
  { id: 'general', title: 'Назначение и общая картина', categories: ['purpose'], words: /здравств|задач|цел|зачем|автоматиз|расскаж|систем|устан|узел|сейчас|оператор.*(дела|регулир)|вручн/ },
  { id: 'temp', title: 'Температура и нагрев', categories: [], words: /температ|градус|нагрев|перегрев|горяч|холодн|зим|лет/ },
  { id: 'press', title: 'Давление воды', categories: [], words: /давлен|мпа|бар/ },
  { id: 'flow', title: 'Расход и циркуляция', categories: [], words: /расход|циркуляц|проток|куб/ },
  { id: 'pump', title: 'Насос и управление', categories: [], words: /насос|частот|пч|двигател|напор|подач/ },
  { id: 'hx', title: 'Теплообменник и теплоноситель', categories: [], words: /теплообмен|теплонос|обратк|подач.*теплон/ },
  { id: 'valve', title: 'Клапаны и исполнительные механизмы', categories: ['actuators'], words: /клапан|исполнит|привод|воздух|кип/ },
  { id: 'modes', title: 'Режимы работы', categories: ['modes'], words: /режим|ручн|автомат|обслужив/ },
  { id: 'alarm', title: 'Предупреждения и защиты', categories: ['warning', 'protection'], words: /авари|защит|предупр|сигнализ|блокир|останов|перезапуск|квитир|отказ|обрыв|пропад/ },
  { id: 'sensors', title: 'Датчики и контролируемые параметры', categories: ['monitored'], words: /датчик|прибор|измер|контролир|парамет/ },
  { id: 'hmi', title: 'Операторский интерфейс', categories: ['hmi'], words: /экран|панел|оператор|журнал|архив|график|тренд|уставк|сообщен/ },
  { id: 'power', title: 'Электропитание и условия', categories: ['power', 'environment'], words: /питан|напряж|вольт|помещен|цех|ip|взрыв|шкаф|кабел|расстоян|услови/ },
  { id: 'equip', title: 'Оборудование и документация', categories: ['reliability', 'docs', 'object'], words: /контроллер|плк|оборудован|документ|марк|модел|резерв|надёжн|надежн|срок|стоим/ },
];

// Факты, которые по смыслу относятся к узким направлениям, хотя их категория шире.
const FACT_DIRECTION: Record<string, string> = {};
for (const fact of scenario.facts) {
  const id = fact.id;
  let dir = DIRECTIONS.find((d) => d.categories.includes(fact.category))?.id ?? 'equip';
  if (/^temp_|^hmi_trend_temp/.test(id) && !['hmi', 'warning', 'protection'].includes(fact.category)) dir = 'temp';
  if (/^press_/.test(id) && !['warning', 'protection'].includes(fact.category)) dir = 'press';
  if (/^flow_/.test(id) && !['protection', 'hmi'].includes(fact.category)) dir = 'flow';
  if (/^pump_|^vfd_/.test(id)) dir = 'pump';
  if (/^hx_|^hc_/.test(id)) dir = 'hx';
  if (/^valve_|^air_/.test(id)) dir = 'valve';
  if (/^obj_flow|^sys_name|^unk_basis/.test(id)) dir = 'general';
  FACT_DIRECTION[id] = dir;
}

function directionOf(entry: Entry): string {
  const facts = entry.factIds.length ? entry.factIds : [];
  if (facts.length) {
    const counts: Record<string, number> = {};
    for (const id of facts) counts[FACT_DIRECTION[id] ?? 'equip'] = (counts[FACT_DIRECTION[id] ?? 'equip'] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  const text = entry.question.toLowerCase();
  // Узкие направления проверяем раньше общего.
  for (const d of [...DIRECTIONS.slice(1), DIRECTIONS[0]]) if (d.words.test(text)) return d.id;
  return 'general';
}

const USEFUL = new Set(['useful', 'unknown_found', 'confirmation']);

it('метрики UX-аудита', () => {
  const factById = new Map(scenario.facts.map((f) => [f.id, f]));
  const mandatory = scenario.facts.filter((f) => f.requirementType === 'mandatory');
  const out: Record<string, unknown> = {};
  const md: string[] = ['# Метрики UX-аудита (рассчитаны по журналам)', ''];

  for (const [key, title] of PERSONAS) {
    const file = `${LOGS}/${key}.jsonl`;
    if (!existsSync(file)) continue;
    const entries = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Entry);
    const disclosed = new Set(entries.flatMap((e) => e.newFacts));
    const byQuality: Record<string, number> = {};
    for (const e of entries) byQuality[e.quality] = (byQuality[e.quality] ?? 0) + 1;
    const noNew = entries.filter((e) => e.newFacts.length === 0).length;
    const firstUseful = (n: number) => entries.slice(0, n).flatMap((e) => e.newFacts).filter((id) => factById.get(id)?.requirementType === 'mandatory').length;

    const dirRows = DIRECTIONS.map((d) => {
      const own = entries.filter((e) => directionOf(e) === d.id);
      const dirMandatory = mandatory.filter((f) => FACT_DIRECTION[f.id] === d.id);
      const got = dirMandatory.filter((f) => disclosed.has(f.id)).length;
      return {
        direction: d.title,
        questions: own.length,
        useful: own.filter((e) => e.newFacts.length > 0 || e.quality === 'unknown_found').length,
        unrecognized: own.filter((e) => e.quality === 'unrecognized').length,
        clarify: own.filter((e) => e.quality === 'clarify').length,
        noNewInfo: own.filter((e) => e.newFacts.length === 0).length,
        facts: own.reduce((sum, e) => sum + e.newFacts.length, 0),
        mandatoryGot: got,
        mandatoryTotal: dirMandatory.length,
        mandatoryMissing: dirMandatory.filter((f) => !disclosed.has(f.id)).map((f) => f.label),
      };
    });

    const mandatoryGot = mandatory.filter((f) => disclosed.has(f.id)).length;
    const unknowns = scenario.facts.filter((f) => f.customerConfidence === 'unknown');
    const summary = {
      messages: entries.length,
      byQuality,
      usefulShare: +(entries.filter((e) => e.newFacts.length > 0 || e.quality === 'unknown_found').length / entries.length).toFixed(2),
      recognizedShare: +(entries.filter((e) => e.quality !== 'unrecognized').length / entries.length).toFixed(2),
      noNewInfo: noNew,
      factsDisclosed: disclosed.size,
      mandatoryGot,
      mandatoryTotal: mandatory.length,
      mandatoryCoverage: +(mandatoryGot / mandatory.length).toFixed(2),
      unknownsFound: unknowns.filter((f) => disclosed.has(f.id)).length,
      unknownsTotal: unknowns.length,
      mandatoryAfter20: firstUseful(20),
      mandatoryAfter40: firstUseful(40),
    };
    out[key] = { summary, directions: dirRows };

    md.push(`## ${title}`, '');
    md.push(`Сообщений: **${summary.messages}**. Полезных ответов (новые сведения или честное «не знаю»): **${Math.round(summary.usefulShare * 100)}%**. Понято (не «не понял»): **${Math.round(summary.recognizedShare * 100)}%**. Без новой информации: **${summary.noNewInfo}**.`);
    md.push(`Обязательные сведения: **${mandatoryGot} из ${mandatory.length}** (${Math.round(summary.mandatoryCoverage * 100)}%). После 20 сообщений: ${summary.mandatoryAfter20}, после 40: ${summary.mandatoryAfter40}. Сведения «заказчик не знает»: ${summary.unknownsFound} из ${summary.unknownsTotal}.`);
    md.push(`Типы ответов: ${Object.entries(byQuality).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
    md.push('| Направление | Вопросов | С пользой | Не понял | Встречный | Без новых сведений | Фактов | Обязательных |', '|---|---|---|---|---|---|---|---|');
    for (const r of dirRows) md.push(`| ${r.direction} | ${r.questions} | ${r.useful} | ${r.unrecognized} | ${r.clarify} | ${r.noNewInfo} | ${r.facts} | ${r.mandatoryGot}/${r.mandatoryTotal} |`);
    md.push('');
    const missing = dirRows.flatMap((r) => r.mandatoryMissing.map((m) => `${r.direction}: ${m}`));
    md.push(`<details><summary>Не получено обязательных сведений: ${missing.length}</summary>`, '', ...missing.map((m) => `- ${m}`), '', '</details>', '');
    md.push('Проблемные сообщения (не понял / встречный / без новых сведений):', '', '| № | Вопрос | Тип | intentId | Ответ |', '|---|---|---|---|---|');
    for (const e of entries.filter((x) => x.newFacts.length === 0 && x.quality !== 'unknown_found' && x.quality !== 'social')) {
      md.push(`| ${e.n} | ${e.question.replace(/\|/g, '/')} | ${e.quality} | ${e.intentId ?? '—'} | ${e.reply.replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
    }
    md.push('');
  }
  writeFileSync('docs/ux-audit/metrics.json', JSON.stringify(out, null, 2));
  writeFileSync('docs/ux-audit/metrics.md', md.join('\n'));
});
