<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { adminApi } from '../api/client';
import { CATEGORY_TITLES, day, filterParams, groupItems, loadGroups, TYPE_LABEL, type GroupInfo, type ScenarioSummary } from './format';

type Stats = {
  totals: { attempts: number; finished: number; inProgress: number; students: number; avgScore: number | null; medianScore: number | null; minScore: number | null; maxScore: number | null; avgMinutes: number | null; avgQuestions: number | null };
  grades: { grade: string; count: number }[];
  byDay: { day: string; count: number }[];
  parts: { id: string; label: string; avg: number; max: number }[];
  facts: { factId: string; label: string; section: number; category: string; requirementType: string; disclosedPct: number; inRegistryPct: number; inTzPct: number }[];
  penalties: { id: string; label: string; count: number; points: number }[];
  missedCategories: { category: string; count: number }[];
  topGeneralQuestions: { text: string; count: number }[];
};

const scenarios = ref<ScenarioSummary[]>([]);
const scenario = ref('all');
const stats = ref<Stats | null>(null);
const error = ref('');
const group = ref('all');
const groups = ref<GroupInfo[]>([]);
const showAllFacts = ref(false);

const scenarioItems = computed(() => [{ label: 'Все сценарии', value: 'all' }, ...scenarios.value.map((item) => ({ label: item.settings.title ?? item.title, value: item.id }))]);

async function load() {
  error.value = '';
  try {
    stats.value = await adminApi.get<Stats>(`/admin/stats?${filterParams({ scenario: scenario.value, group: group.value }, ['scenario', 'group'])}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки.';
  }
}

onMounted(async () => {
  try {
    scenarios.value = (await adminApi.get<{ items: ScenarioSummary[] }>('/admin/scenarios')).items;
    groups.value = await loadGroups();
  } catch {
    // Списки нужны только для фильтров.
  }
  await load();
});
watch([scenario, group], load);

const cards = computed(() => {
  const t = stats.value?.totals;
  if (!t) return [];
  return [
    { label: 'Попыток', value: t.attempts, note: `завершено ${t.finished}, в процессе ${t.inProgress}` },
    { label: 'Студентов', value: t.students, note: 'по уникальным именам' },
    { label: 'Средний балл', value: t.avgScore ?? '—', note: t.finished ? `медиана ${t.medianScore}, от ${t.minScore} до ${t.maxScore}` : 'нет завершённых' },
    { label: 'Среднее время', value: t.avgMinutes === null ? '—' : `${t.avgMinutes} мин`, note: 'от начала до завершения' },
    { label: 'Вопросов', value: t.avgQuestions ?? '—', note: 'в среднем за попытку' },
  ];
});

const maxDay = computed(() => Math.max(1, ...(stats.value?.byDay.map((d) => d.count) ?? [1])));
const maxGrade = computed(() => Math.max(1, ...(stats.value?.grades.map((g) => g.count) ?? [1])));
const visibleFacts = computed(() => (showAllFacts.value ? stats.value?.facts : stats.value?.facts.slice(0, 12)) ?? []);
</script>

<template>
  <div class="space-y-6" data-testid="dashboard">
    <Teleport to="#admin-navbar-actions" defer>
      <USelect v-model="group" :items="groupItems(groups)" class="w-32 sm:w-44" aria-label="Группа" data-testid="dashboard-group" />
      <USelect v-model="scenario" :items="scenarioItems" class="w-32 sm:w-56" aria-label="Сценарий" />
    </Teleport>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

    <template v-if="stats">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <UCard v-for="card in cards" :key="card.label" :ui="{ body: 'p-4' }">
          <p class="text-sm text-muted">{{ card.label }}</p>
          <p class="text-3xl font-semibold" data-testid="stat-value">{{ card.value }}</p>
          <p class="text-xs text-muted">{{ card.note }}</p>
        </UCard>
      </div>

      <UAlert v-if="!stats.totals.attempts" color="info" variant="subtle" icon="i-lucide-info" title="Попыток пока нет" description="Когда студенты откроют сайт, подключённый к серверу, их переписка и результаты появятся здесь." />

      <div class="grid gap-4 lg:grid-cols-2">
        <UCard :ui="{ body: 'space-y-3 p-4' }">
          <h2 class="font-semibold">Оценки</h2>
          <p v-if="!stats.grades.length" class="text-sm text-muted">Завершённых попыток нет.</p>
          <div v-for="g in stats.grades" :key="g.grade" class="flex items-center gap-3 text-sm">
            <span class="w-40 shrink-0">{{ g.grade }}</span>
            <div class="h-3 flex-1 rounded bg-elevated"><div class="h-3 rounded bg-primary" :style="{ width: `${(g.count / maxGrade) * 100}%` }" /></div>
            <span class="w-8 text-right tabular-nums">{{ g.count }}</span>
          </div>
        </UCard>
        <UCard :ui="{ body: 'space-y-3 p-4' }">
          <h2 class="font-semibold">Попытки по дням (последние 30 дней с активностью)</h2>
          <p v-if="!stats.byDay.length" class="text-sm text-muted">Данных нет.</p>
          <div v-else class="flex h-32 items-end gap-1" role="img" aria-label="Число попыток по дням">
            <div v-for="d in stats.byDay" :key="d.day" class="flex flex-1 flex-col items-center justify-end gap-1" :title="`${day(d.day)}: ${d.count}`">
              <div class="w-full rounded-t bg-primary" :style="{ height: `${(d.count / maxDay) * 100}%`, minHeight: '3px' }" />
              <span class="text-[10px] text-muted">{{ day(d.day) }}</span>
            </div>
          </div>
        </UCard>
      </div>

      <UCard v-if="stats.parts.length" :ui="{ body: 'space-y-3 p-4' }">
        <h2 class="font-semibold">Средний балл по критериям</h2>
        <div v-for="p in stats.parts" :key="p.id" class="grid items-center gap-2 text-sm sm:grid-cols-[18rem_1fr_6rem]">
          <span>{{ p.label }}</span>
          <UProgress :model-value="p.max ? (p.avg / p.max) * 100 : 0" size="sm" />
          <span class="tabular-nums text-muted sm:text-right">{{ p.avg }} из {{ p.max }}</span>
        </div>
      </UCard>

      <UCard v-if="stats.facts.length" :ui="{ body: 'space-y-3 p-4' }">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">Сведения: что студенты выясняют хуже всего</h2>
          <UButton v-if="stats.facts.length > 12" size="xs" color="neutral" variant="ghost" :label="showAllFacts ? 'Свернуть' : `Показать все (${stats.facts.length})`" @click="showAllFacts = !showAllFacts" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-muted">
              <tr><th class="py-1 pr-3 font-medium">Сведение</th><th class="pr-3 font-medium">Тип</th><th class="pr-3 font-medium">В диалоге</th><th class="pr-3 font-medium">В реестре</th><th class="font-medium">В ТЗ</th></tr>
            </thead>
            <tbody>
              <tr v-for="f in visibleFacts" :key="f.factId" class="border-t border-default">
                <td class="py-1.5 pr-3">{{ f.label }} <span class="text-xs text-muted">· {{ CATEGORY_TITLES[f.category] ?? f.category }}</span></td>
                <td class="pr-3 text-muted">{{ TYPE_LABEL[f.requirementType] ?? f.requirementType }}</td>
                <td class="pr-3 tabular-nums">{{ f.disclosedPct }}%</td>
                <td class="pr-3 tabular-nums">{{ f.inRegistryPct }}%</td>
                <td class="tabular-nums">{{ f.inTzPct }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-3">
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h2 class="font-semibold">Частые штрафы</h2>
          <p v-if="!stats.penalties.length" class="text-sm text-muted">Нет данных.</p>
          <p v-for="p in stats.penalties" :key="p.id" class="flex justify-between gap-2 text-sm"><span>{{ p.label }}</span><span class="tabular-nums text-muted">{{ p.count }} раз, −{{ p.points }}</span></p>
        </UCard>
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h2 class="font-semibold">Не обсуждали темы</h2>
          <p v-if="!stats.missedCategories.length" class="text-sm text-muted">Нет данных.</p>
          <p v-for="c in stats.missedCategories" :key="c.category" class="flex justify-between gap-2 text-sm"><span>{{ CATEGORY_TITLES[c.category] ?? c.category }}</span><span class="tabular-nums text-muted">{{ c.count }}</span></p>
        </UCard>
        <UCard :ui="{ body: 'space-y-2 p-4' }">
          <h2 class="font-semibold">Слишком общие вопросы</h2>
          <p v-if="!stats.topGeneralQuestions.length" class="text-sm text-muted">Нет данных.</p>
          <p v-for="q in stats.topGeneralQuestions" :key="q.text" class="flex justify-between gap-2 text-sm"><span>{{ q.text }}</span><span class="tabular-nums text-muted">{{ q.count }}</span></p>
        </UCard>
      </div>
    </template>
  </div>
</template>
