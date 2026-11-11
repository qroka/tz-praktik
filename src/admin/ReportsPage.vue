<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminApi } from '../api/client';
import { downloadFromServer, type ScenarioSummary } from './format';

const scenarios = ref<ScenarioSummary[]>([]);
const scenario = ref('all');
const busy = ref('');
const toast = useToast();

const items = computed(() => [{ label: 'Все сценарии', value: 'all' }, ...scenarios.value.map((s) => ({ label: s.settings.title ?? s.title, value: s.id }))]);
const reportScenario = computed(() => (scenario.value === 'all' ? scenarios.value.find((s) => s.isCurrent)?.id ?? scenarios.value[0]?.id : scenario.value));

onMounted(async () => {
  try {
    scenarios.value = (await adminApi.get<{ items: ScenarioSummary[] }>('/admin/scenarios')).items;
  } catch {
    // Без списка доступны только отчёты по всем попыткам.
  }
});

async function download(kind: string, path: string, filename: string) {
  busy.value = kind;
  try {
    await downloadFromServer(path, filename);
  } catch (e) {
    toast.add({ title: 'Не удалось скачать', description: e instanceof Error ? e.message : '', color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="space-y-4" data-testid="reports">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">Отчёты</h1>
      <USelect v-model="scenario" :items="items" class="w-72" aria-label="Сценарий" />
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <UCard :ui="{ body: 'space-y-3 p-5' }">
        <div class="flex items-center gap-2"><UIcon name="i-lucide-file-spreadsheet" class="size-5 text-primary" /><h2 class="font-semibold">Таблица попыток (CSV)</h2></div>
        <p class="text-sm text-muted">Все попытки выбранного сценария: студент, время, балл, оценка, число вопросов. Открывается в Excel.</p>
        <UButton :loading="busy === 'csv'" icon="i-lucide-download" label="Скачать CSV" data-testid="report-csv" @click="download('csv', `/admin/reports/attempts.csv${scenario === 'all' ? '' : `?scenario=${scenario}`}`, 'attempts.csv')" />
      </UCard>
      <UCard :ui="{ body: 'space-y-3 p-5' }">
        <div class="flex items-center gap-2"><UIcon name="i-lucide-file-text" class="size-5 text-primary" /><h2 class="font-semibold">Отчёт по сценарию (Markdown)</h2></div>
        <p class="text-sm text-muted">Итоги, распределение оценок, средние баллы по критериям, что выясняют хуже всего и список студентов. {{ scenario === 'all' ? 'Для всех сценариев выберите конкретный; сейчас будет взят текущий.' : '' }}</p>
        <UButton :loading="busy === 'md'" :disabled="!reportScenario" icon="i-lucide-download" label="Скачать отчёт" data-testid="report-md" @click="download('md', `/admin/reports/scenario/${reportScenario}`, `report-${reportScenario}.md`)" />
      </UCard>
    </div>
    <p class="text-sm text-muted">Отчёт по одному студенту скачивается в карточке его попытки на вкладке «Ответы студентов».</p>
  </div>
</template>
