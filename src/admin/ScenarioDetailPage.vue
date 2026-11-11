<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../api/client';
import { scenario as builtIn } from '../data/scenario';
import { buildScenarioFromPack, checkRecognition, type ScenarioPack } from '../data/scenarioPack';
import type { Intent, ReplyStep, Scenario, ScenarioFact } from '../types';
import { dateTime, TYPE_LABEL, type ScenarioSummary } from './format';

const props = defineProps<{ id: string }>();
const router = useRouter();

const summary = ref<ScenarioSummary | null>(null);
const scenario = ref<Scenario | null>(null);
const pack = ref<ScenarioPack | null>(null);
const error = ref('');
const buildErrors = ref<string[]>([]);
const tab = ref<'facts' | 'general' | 'ambiguity' | 'unknown' | 'structure'>('facts');
const query = ref('');
const category = ref('all');
const recognition = ref<{ total: number; misses: string[] } | null>(null);

onMounted(async () => {
  try {
    const data = await adminApi.get<ScenarioSummary & { pack: ScenarioPack | null }>(`/admin/scenarios/${encodeURIComponent(props.id)}`);
    summary.value = data;
    if (data.kind === 'builtin') {
      scenario.value = builtIn;
    } else if (data.pack) {
      pack.value = data.pack;
      const built = buildScenarioFromPack(data.pack);
      buildErrors.value = built.report.errors;
      scenario.value = built.report.errors.length ? null : built.scenario;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки.';
  }
});

type Source = { intent: Intent; stepIndex: number; steps: number; step: ReplyStep };

/** Кто и как раскрывает каждое сведение: намерения (вопросы студента) и ответы заказчика. */
const sources = computed(() => {
  const map = new Map<string, Source[]>();
  const current = scenario.value;
  if (!current) return map;
  for (const intent of current.intents) {
    const steps = current.replies[intent.id] ?? [];
    steps.forEach((step, stepIndex) => {
      for (const factId of step.facts) {
        const list = map.get(factId) ?? [];
        list.push({ intent, stepIndex, steps: steps.length, step });
        map.set(factId, list);
      }
    });
  }
  return map;
});

const stats = computed(() => {
  const current = scenario.value;
  if (!current) return [];
  // Только вопросы и ответы по сведениям: служебные реплики (приветствие, «что ещё?») есть в любом сценарии.
  const content = current.intents.filter((i) => i.kind === 'fact' || i.kind === 'unknown');
  const variants = content.flatMap((i) => current.replies[i.id] ?? []).reduce((sum, step) => sum + step.variants.length, 0);
  return [
    { label: 'Сведений', value: current.facts.length },
    { label: 'Обязательных', value: current.facts.filter((f) => f.requirementType === 'mandatory').length },
    { label: 'Заказчик не знает', value: current.facts.filter((f) => f.customerConfidence === 'unknown').length },
    { label: 'Формулировок вопросов', value: content.reduce((sum, i) => sum + i.examples.length, 0) },
    { label: 'Вариантов ответа', value: variants },
  ];
});

const categoryItems = computed(() => [{ label: 'Все категории', value: 'all' }, ...(scenario.value?.categories.map((c) => ({ label: c.title, value: c.id })) ?? [])]);

const haystack = (fact: ScenarioFact): string =>
  [fact.label, fact.value, ...(sources.value.get(fact.id) ?? []).flatMap((s) => [...s.intent.examples, ...s.step.variants, ...s.step.short])].join(' ').toLowerCase();

const groups = computed(() => {
  const current = scenario.value;
  if (!current) return [];
  const q = query.value.trim().toLowerCase();
  return current.categories
    .filter((c) => category.value === 'all' || c.id === category.value)
    .map((c) => ({
      category: c,
      facts: current.facts.filter((f) => f.category === c.id && (!q || haystack(f).includes(q))),
    }))
    .filter((g) => g.facts.length);
});
const shownCount = computed(() => groups.value.reduce((sum, g) => sum + g.facts.length, 0));

const generalIntents = computed(() => scenario.value?.intents.filter((i) => ['general', 'social', 'meta'].includes(i.kind)) ?? []);
const KIND_LABEL: Record<string, string> = { general: 'Общий вопрос', social: 'Служебная реплика', meta: 'Уточнение', fact: 'Сведение', unknown: 'Заказчик не знает' };
const UNKNOWN_KIND: Record<string, string> = { survey: 'Требует обследования объекта', undefined: 'Не определено — согласовать', designer: 'Решение предлагает проектировщик' };
const LEVEL: Record<string, string> = { general: 'общий вопрос', specific: 'прямой вопрос', followup: 'после другого сведения' };
const CONFIDENCE: Record<string, string> = { certain: 'точно', approximate: 'примерно', unknown: 'не знает' };

const factLabel = (id: string) => scenario.value?.facts.find((f) => f.id === id)?.label ?? id;

function runRecognition() {
  if (scenario.value && pack.value) recognition.value = checkRecognition(scenario.value, pack.value);
}

const tabs = computed<{ id: typeof tab.value; label: string; count?: number }[]>(() => [
  { id: 'facts', label: 'Сведения', count: scenario.value?.facts.length },
  { id: 'general', label: 'Общие и служебные', count: generalIntents.value.length },
  { id: 'ambiguity', label: 'Встречные вопросы', count: scenario.value?.ambiguities.length },
  { id: 'unknown', label: 'Заказчик не знает', count: scenario.value?.unknownTopics?.length },
  { id: 'structure', label: 'Структура и реплики' },
]);
</script>

<template>
  <div class="space-y-4" data-testid="scenario-detail">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
    <UAlert v-if="buildErrors.length" color="error" variant="subtle" icon="i-lucide-circle-x" title="Файл сценария не собирается">
      <template #description><ul class="list-disc pl-5"><li v-for="e in buildErrors" :key="e">{{ e }}</li></ul></template>
    </UAlert>
    <p v-if="!scenario && !error && !buildErrors.length" class="text-muted">Загрузка…</p>

    <template v-if="scenario && summary">
      <UCard :ui="{ body: 'space-y-3 p-4' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl font-semibold">{{ summary.settings.title ?? scenario.title }}</h2>
              <UBadge :label="`Вариант ${summary.variant}`" color="primary" variant="solid" />
              <UBadge v-if="summary.published" label="Выложен" color="success" variant="subtle" icon="i-lucide-eye" />
              <UBadge v-else label="Не выложен" color="neutral" variant="subtle" icon="i-lucide-eye-off" />
              <UBadge :label="summary.kind === 'builtin' ? 'Встроенный' : 'Из файла'" color="neutral" variant="outline" />
            </div>
            <p class="text-sm text-muted">{{ scenario.subtitle }}</p>
            <p class="max-w-3xl text-sm">{{ summary.settings.publicBrief ?? scenario.publicBrief }}</p>
            <p class="text-xs text-muted">
              Заказчик: {{ scenario.customer.name }}, {{ scenario.customer.role }} · занятие ≈{{ summary.settings.estimatedMinutes ?? scenario.estimatedMinutes }} мин · обновлён {{ dateTime(summary.updatedAt) }}
            </p>
          </div>
          <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="К списку" @click="router.push('/admin/scenarios')" />
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div v-for="s in stats" :key="s.label"><p class="text-xs text-muted">{{ s.label }}</p><p class="text-xl font-semibold tabular-nums">{{ s.value }}</p></div>
        </div>
        <div v-if="pack" class="flex flex-wrap items-center gap-2">
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-search-check" label="Проверить распознавание вопросов" @click="runRecognition" />
          <span v-if="recognition" class="text-sm" :class="recognition.misses.length ? 'text-warning' : 'text-success'">
            Распознаются {{ recognition.total - recognition.misses.length }} из {{ recognition.total }}
          </span>
        </div>
        <ul v-if="recognition?.misses.length" class="max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted"><li v-for="m in recognition.misses" :key="m">{{ m }}</li></ul>
      </UCard>

      <div class="flex flex-wrap gap-1" role="tablist">
        <UButton
          v-for="t in tabs"
          :key="t.id"
          size="sm"
          :label="t.count !== undefined ? `${t.label} · ${t.count}` : t.label"
          :color="tab === t.id ? 'primary' : 'neutral'"
          :variant="tab === t.id ? 'soft' : 'ghost'"
          role="tab"
          :aria-selected="tab === t.id"
          :data-testid="`tab-${t.id}`"
          @click="tab = t.id"
        />
      </div>

      <!-- Сведения -->
      <div v-if="tab === 'facts'" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <UInput v-model="query" icon="i-lucide-search" placeholder="Поиск по сведениям, вопросам и ответам" aria-label="Поиск" data-testid="scenario-search" />
          <USelect v-model="category" :items="categoryItems" aria-label="Категория" />
        </div>
        <p class="text-sm text-muted">Показано сведений: {{ shownCount }}. Раскройте сведение, чтобы увидеть вопросы студентов и ответы заказчика.</p>
        <p v-if="!groups.length" class="py-6 text-center text-muted">Ничего не найдено.</p>

        <section v-for="g in groups" :key="g.category.id" class="space-y-2">
          <div>
            <h3 class="font-semibold">{{ g.category.title }} <span class="text-sm font-normal text-muted">· {{ g.facts.length }}</span></h3>
            <p class="text-xs text-muted">{{ g.category.direction }}</p>
          </div>
          <details v-for="fact in g.facts" :key="fact.id" class="group rounded-lg border border-default bg-default" :data-testid="`fact-${fact.id}`">
            <summary class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-elevated/40">
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition-transform group-open:rotate-90" />
              <span class="font-medium">{{ fact.label }}</span>
              <span class="min-w-0 flex-1 text-sm text-muted">{{ fact.value }}</span>
              <span class="flex flex-wrap gap-1">
                <UBadge :label="TYPE_LABEL[fact.requirementType] ?? fact.requirementType" color="neutral" variant="outline" size="sm" />
                <UBadge v-if="fact.customerConfidence !== 'certain'" :label="CONFIDENCE[fact.customerConfidence]" :color="fact.customerConfidence === 'unknown' ? 'warning' : 'info'" variant="subtle" size="sm" />
                <UBadge :label="`раздел ТЗ ${fact.section}`" color="neutral" variant="subtle" size="sm" />
              </span>
            </summary>
            <div class="space-y-3 border-t border-default p-3 text-sm">
              <p class="text-xs text-muted">
                Раскрывается: {{ LEVEL[fact.disclosureLevel] }}<template v-if="fact.prerequisites?.length">; сначала нужно выяснить: {{ fact.prerequisites.map(factLabel).join(', ') }}</template>
              </p>
              <p v-if="!sources.get(fact.id)?.length" class="text-warning">Ни один вопрос не раскрывает это сведение.</p>
              <div v-for="(source, i) in sources.get(fact.id) ?? []" :key="i" class="grid gap-3 md:grid-cols-2">
                <div class="space-y-1">
                  <p class="font-medium">
                    Вопросы студента
                    <span class="font-normal text-muted">· {{ source.intent.title }}<template v-if="source.steps > 1">, шаг {{ source.stepIndex + 1 }} из {{ source.steps }}</template></span>
                  </p>
                  <ul class="list-disc space-y-0.5 pl-5"><li v-for="q in source.intent.examples" :key="q">{{ q }}</li></ul>
                </div>
                <div class="space-y-1">
                  <p class="font-medium">Ответы заказчика <span class="font-normal text-muted">· выбирается один</span></p>
                  <ul class="list-disc space-y-0.5 pl-5"><li v-for="v in source.step.variants" :key="v">{{ v }}</li></ul>
                  <p class="pt-1 font-medium">На повторный вопрос</p>
                  <ul class="list-disc space-y-0.5 pl-5 text-muted"><li v-for="v in source.step.short" :key="v">{{ v }}</li></ul>
                </div>
              </div>
            </div>
          </details>
        </section>
      </div>

      <!-- Общие и служебные -->
      <div v-else-if="tab === 'general'" class="space-y-2">
        <p class="text-sm text-muted">Общие вопросы не раскрывают конкретных значений и снижают оценку при частом использовании. Служебные реплики — приветствие, «что ещё?», «повторите».</p>
        <details v-for="intent in generalIntents" :key="intent.id" class="group rounded-lg border border-default">
          <summary class="flex cursor-pointer list-none flex-wrap items-center gap-3 p-3 hover:bg-elevated/40">
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition-transform group-open:rotate-90" />
            <span class="font-medium">{{ intent.title }}</span>
            <UBadge :label="KIND_LABEL[intent.kind]" color="neutral" variant="outline" size="sm" />
            <span class="text-xs text-muted">вопросов: {{ intent.examples.length }}</span>
          </summary>
          <div class="grid gap-3 border-t border-default p-3 text-sm md:grid-cols-2">
            <div><p class="mb-1 font-medium">Вопросы студента</p><ul class="list-disc space-y-0.5 pl-5"><li v-for="q in intent.examples" :key="q">{{ q }}</li></ul></div>
            <div v-if="scenario.replies[intent.id]?.length">
              <p class="mb-1 font-medium">Ответы заказчика</p>
              <ul class="list-disc space-y-0.5 pl-5"><li v-for="v in scenario.replies[intent.id][0].variants" :key="v">{{ v }}</li></ul>
              <p v-if="scenario.replies[intent.id][0].facts.length" class="pt-1 text-xs text-muted">Раскрывает: {{ scenario.replies[intent.id][0].facts.map(factLabel).join(', ') }}</p>
            </div>
          </div>
        </details>
      </div>

      <!-- Встречные вопросы -->
      <div v-else-if="tab === 'ambiguity'" class="space-y-2">
        <p class="text-sm text-muted">Если студент спросил слишком расплывчато («какое давление?»), заказчик задаёт встречный вопрос вместо ответа.</p>
        <p v-if="!scenario.ambiguities.length" class="py-6 text-center text-muted">Встречных вопросов в сценарии нет.</p>
        <UCard v-for="a in scenario.ambiguities" :key="a.id" :ui="{ body: 'space-y-1 p-3' }">
          <p class="font-medium">{{ a.id }}</p>
          <ul class="list-disc space-y-0.5 pl-5 text-sm"><li v-for="q in a.questions" :key="q">{{ q }}</li></ul>
        </UCard>
      </div>

      <!-- Заказчик не знает -->
      <div v-else-if="tab === 'unknown'" class="space-y-2">
        <p class="text-sm text-muted">Темы, по которым заказчик честно отвечает «сведений нет». Класс подсказывает студенту, что делать: обследовать объект, согласовать или предложить решение.</p>
        <p v-if="!scenario.unknownTopics?.length" class="py-6 text-center text-muted">Таких тем нет.</p>
        <UCard v-for="u in scenario.unknownTopics ?? []" :key="u.id" :ui="{ body: 'space-y-1 p-3' }">
          <div class="flex flex-wrap items-center gap-2"><p class="font-medium">{{ u.label }}</p><UBadge :label="UNKNOWN_KIND[u.kind]" color="warning" variant="subtle" size="sm" /></div>
          <ul class="list-disc space-y-0.5 pl-5 text-sm"><li v-for="r in u.replies" :key="r">{{ r }}</li></ul>
        </UCard>
      </div>

      <!-- Структура -->
      <div v-else class="grid gap-4 lg:grid-cols-2">
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h3 class="font-semibold">Первая реплика заказчика</h3>
          <ul class="list-disc space-y-0.5 pl-5 text-sm"><li v-for="g in scenario.greeting" :key="g">{{ g }}</li></ul>
        </UCard>
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h3 class="font-semibold">Когда заказчик не понял вопрос <span class="text-sm font-normal text-muted">· {{ scenario.meta.fallback.length }}</span></h3>
          <ul class="max-h-72 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm"><li v-for="f in scenario.meta.fallback" :key="f">{{ f }}</li></ul>
        </UCard>
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h3 class="font-semibold">Категории вопросов</h3>
          <div v-for="c in scenario.categories" :key="c.id" class="text-sm"><p class="font-medium">{{ c.title }}</p><p class="text-xs text-muted">{{ c.direction }}</p></div>
        </UCard>
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h3 class="font-semibold">Разделы ТЗ</h3>
          <div v-for="s in scenario.tzSections" :key="s.id" class="text-sm"><p class="font-medium">{{ s.id }}. {{ s.title }}</p><p class="text-xs text-muted">{{ s.hint }}</p></div>
        </UCard>
      </div>
    </template>
  </div>
</template>
