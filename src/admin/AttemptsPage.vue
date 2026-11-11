<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { adminApi } from '../api/client';
import AttemptDetail from './AttemptDetail.vue';
import { dateTime, downloadFromServer, gradeColor, minutesBetween, type ScenarioSummary } from './format';

type Row = { id: number; scenarioId: string; scenarioTitle: string | null; studentName: string; startedAt: string; updatedAt: string; finishedAt: string | null; score: number | null; grade: string | null; messages: number; disclosed: number };

const scenarios = ref<ScenarioSummary[]>([]);
const rows = ref<Row[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const error = ref('');
const loading = ref(false);
const filters = ref({ scenario: 'all', status: 'all', q: '', from: '', to: '', sort: 'date' });
const openId = ref<number | null>(null);

const scenarioItems = computed(() => [{ label: 'Все сценарии', value: 'all' }, ...scenarios.value.map((s) => ({ label: s.settings.title ?? s.title, value: s.id }))]);
const statusItems = [{ label: 'Любые', value: 'all' }, { label: 'Завершённые', value: 'finished' }, { label: 'В процессе', value: 'active' }];
const sortItems = [{ label: 'Сначала новые', value: 'date' }, { label: 'По баллу', value: 'score' }, { label: 'По имени', value: 'name' }];
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

async function load() {
  loading.value = true;
  error.value = '';
  const f = filters.value;
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize), sort: f.sort });
  if (f.scenario !== 'all') params.set('scenario', f.scenario);
  if (f.status !== 'all') params.set('status', f.status);
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  try {
    const data = await adminApi.get<{ items: Row[]; total: number }>(`/admin/attempts?${params}`);
    rows.value = data.items;
    total.value = data.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки.';
  } finally {
    loading.value = false;
  }
}

let timer = 0;
watch(filters, () => {
  page.value = 1;
  window.clearTimeout(timer);
  timer = window.setTimeout(load, 300);
}, { deep: true });
watch(page, load);

onMounted(async () => {
  try {
    scenarios.value = (await adminApi.get<{ items: ScenarioSummary[] }>('/admin/scenarios')).items;
  } catch {
    // Нужно только для фильтра.
  }
  await load();
});
onBeforeUnmount(() => window.clearTimeout(timer));

function onDeleted() {
  openId.value = null;
  void load();
}
</script>

<template>
  <div class="space-y-4" data-testid="attempts">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">Ответы студентов</h1>
      <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" label="Скачать таблицу (CSV)" @click="downloadFromServer(`/admin/reports/attempts.csv${filters.scenario === 'all' ? '' : `?scenario=${filters.scenario}`}`, 'attempts.csv')" />
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Имя студента" class="lg:col-span-2" aria-label="Поиск по имени" data-testid="attempts-search" />
      <USelect v-model="filters.scenario" :items="scenarioItems" aria-label="Сценарий" />
      <USelect v-model="filters.status" :items="statusItems" aria-label="Статус" />
      <UInput v-model="filters.from" type="date" aria-label="С даты" />
      <UInput v-model="filters.to" type="date" aria-label="По дату" />
    </div>
    <div class="flex items-center gap-2 text-sm text-muted">
      Сортировка:
      <USelect v-model="filters.sort" :items="sortItems" size="sm" class="w-44" aria-label="Сортировка" />
      <span class="ml-auto" data-testid="attempts-total">Найдено: {{ total }}</span>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-left text-sm">
        <thead class="bg-elevated/50 text-muted">
          <tr>
            <th class="p-2 font-medium">Студент</th><th class="p-2 font-medium">Сценарий</th><th class="p-2 font-medium">Начало</th><th class="p-2 font-medium">Время</th>
            <th class="p-2 font-medium">Вопросов</th><th class="p-2 font-medium">Раскрыто</th><th class="p-2 font-medium">Балл</th><th class="p-2" />
          </tr>
        </thead>
        <tbody :class="{ 'opacity-60': loading }">
          <tr v-if="!rows.length && !loading"><td colspan="8" class="p-6 text-center text-muted">Попыток не найдено.</td></tr>
          <tr v-for="row in rows" :key="row.id" class="cursor-pointer border-t border-default hover:bg-elevated/40" :data-testid="`attempt-${row.id}`" @click="openId = row.id">
            <td class="p-2 font-medium">{{ row.studentName }}</td>
            <td class="p-2 text-muted">{{ row.scenarioTitle ?? row.scenarioId }}</td>
            <td class="p-2 whitespace-nowrap">{{ dateTime(row.startedAt) }}</td>
            <td class="p-2 whitespace-nowrap">{{ minutesBetween(row.startedAt, row.finishedAt) }}</td>
            <td class="p-2 tabular-nums">{{ row.messages }}</td>
            <td class="p-2 tabular-nums">{{ row.disclosed }}</td>
            <td class="p-2">
              <UBadge v-if="row.score !== null" :label="`${row.score} · ${row.grade}`" :color="gradeColor(row.score)" variant="subtle" />
              <UBadge v-else label="в процессе" color="neutral" variant="outline" />
            </td>
            <td class="p-2 text-right"><UButton size="xs" color="neutral" variant="ghost" label="Открыть" @click.stop="openId = row.id" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pages > 1" class="flex items-center justify-center gap-2">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-chevron-left" :disabled="page <= 1" aria-label="Назад" @click="page--" />
      <span class="text-sm">Страница {{ page }} из {{ pages }}</span>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-chevron-right" :disabled="page >= pages" aria-label="Вперёд" @click="page++" />
    </div>

    <AttemptDetail :id="openId" @close="openId = null" @deleted="onDeleted" />
  </div>
</template>
