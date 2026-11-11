<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { adminApi } from '../api/client';
import AttemptDetail from './AttemptDetail.vue';
import { dateTime, type ScenarioSummary } from './format';

type Item = {
  id: number; attemptId: number; scenarioId: string; scenarioTitle: string | null; studentName: string; rating: 'like' | 'dislike';
  reason: string; at: string; question: string; answer: string; intentId: string | null; topic: string | null;
};
type Problem = { scenarioId: string; intentId: string | null; topic: string | null; dislikes: number; likes: number; total: number; sampleQuestion: string | null; sampleAnswer: string | null };
type Summary = { total: number; likes: number; dislikes: number; attempts: number; students: number; dislikesWithReason: number; problems: Problem[] };

const scenarios = ref<ScenarioSummary[]>([]);
const items = ref<Item[]>([]);
const total = ref(0);
const summary = ref<Summary | null>(null);
const page = ref(1);
const pageSize = 20;
const error = ref('');
const loading = ref(false);
const filters = ref({ scenario: 'all', rating: 'all', q: '' });
const openAttempt = ref<number | null>(null);

const scenarioItems = computed(() => [{ label: 'Все сценарии', value: 'all' }, ...scenarios.value.map((s) => ({ label: s.settings.title ?? s.title, value: s.id }))]);
const ratingItems = [{ label: 'Все оценки', value: 'all' }, { label: 'Только дизлайки', value: 'dislike' }, { label: 'Только лайки', value: 'like' }];
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const dislikeShare = computed(() => (summary.value?.total ? Math.round((summary.value.dislikes / summary.value.total) * 100) : 0));

async function load() {
  loading.value = true;
  error.value = '';
  const f = filters.value;
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
  if (f.scenario !== 'all') params.set('scenario', f.scenario);
  if (f.rating !== 'all') params.set('rating', f.rating);
  if (f.q.trim()) params.set('q', f.q.trim());
  try {
    const data = await adminApi.get<{ items: Item[]; total: number; summary: Summary }>(`/admin/feedback?${params}`);
    items.value = data.items;
    total.value = data.total;
    summary.value = data.summary;
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

const cards = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: 'Оценок', value: s.total, note: `от ${s.students} студентов, в ${s.attempts} попытках` },
    { label: 'Лайков', value: s.likes, note: 'ответ подошёл', icon: 'i-lucide-thumbs-up', tone: 'text-success' },
    { label: 'Дизлайков', value: s.dislikes, note: s.total ? `${dislikeShare.value}% от всех оценок` : '—', icon: 'i-lucide-thumbs-down', tone: 'text-error' },
    { label: 'Дизлайков с пояснением', value: s.dislikesWithReason, note: s.dislikes ? `${Math.round((s.dislikesWithReason / s.dislikes) * 100)}% дизлайков` : '—' },
  ];
});
</script>

<template>
  <div class="space-y-6" data-testid="feedback">
    <Teleport to="#admin-navbar-actions" defer>
      <USelect v-model="filters.scenario" :items="scenarioItems" class="w-36 sm:w-56" aria-label="Сценарий" />
    </Teleport>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

    <template v-if="summary">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UCard v-for="card in cards" :key="card.label" :ui="{ body: 'p-4' }">
          <p class="flex items-center gap-1.5 text-sm text-muted"><UIcon v-if="card.icon" :name="card.icon" class="size-4" :class="card.tone" />{{ card.label }}</p>
          <p class="text-3xl font-semibold tabular-nums" data-testid="feedback-stat">{{ card.value }}</p>
          <p class="text-xs text-muted">{{ card.note }}</p>
        </UCard>
      </div>

      <UAlert v-if="!summary.total && !filters.q && filters.rating === 'all'" color="info" variant="subtle" icon="i-lucide-info" title="Оценок пока нет" description="Студенты ставят лайк или дизлайк под ответом заказчика в диалоге. Когда они это сделают, оценки появятся здесь." />

      <UCard v-if="summary.problems.length" :ui="{ body: 'space-y-3 p-4' }">
        <div>
          <h2 class="font-semibold">Какие ответы чаще получают дизлайк</h2>
          <p class="text-xs text-muted">Сгруппировано по теме ответа. С них стоит начинать правку сценария.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-muted"><tr><th class="py-1 pr-3 font-medium">Тема ответа</th><th class="pr-3 font-medium">Дизлайков</th><th class="pr-3 font-medium">Лайков</th><th class="font-medium">Последний пример</th></tr></thead>
            <tbody>
              <tr v-for="p in summary.problems" :key="`${p.scenarioId}:${p.intentId}`" class="border-t border-default align-top">
                <td class="py-1.5 pr-3"><span class="font-medium">{{ p.intentId ?? 'не распознан' }}</span><span v-if="p.topic" class="block text-xs text-muted">{{ p.topic }}</span></td>
                <td class="pr-3 tabular-nums text-error">{{ p.dislikes }}</td>
                <td class="pr-3 tabular-nums text-success">{{ p.likes }}</td>
                <td class="text-muted"><span v-if="p.sampleQuestion">«{{ p.sampleQuestion }}» → {{ p.sampleAnswer }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <div class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Поиск по вопросу, ответу, пояснению и имени" aria-label="Поиск" data-testid="feedback-search" />
          <USelect v-model="filters.rating" :items="ratingItems" aria-label="Оценка" />
        </div>
        <p class="text-sm text-muted" data-testid="feedback-total">Найдено: {{ total }}</p>

        <p v-if="!items.length && !loading" class="py-6 text-center text-muted">Оценок не найдено.</p>
        <UCard v-for="item in items" :key="item.id" :ui="{ body: 'space-y-3 p-4' }" :class="{ 'opacity-60': loading }" :data-testid="`feedback-${item.id}`">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <UBadge :label="item.rating === 'like' ? 'Лайк' : 'Дизлайк'" :icon="item.rating === 'like' ? 'i-lucide-thumbs-up' : 'i-lucide-thumbs-down'" :color="item.rating === 'like' ? 'success' : 'error'" variant="subtle" />
            <span class="font-medium">{{ item.studentName }}</span>
            <span class="text-xs text-muted">{{ dateTime(item.at) }} · {{ item.scenarioTitle ?? item.scenarioId }}</span>
            <UButton class="ml-auto" size="xs" color="neutral" variant="ghost" icon="i-lucide-messages-square" label="Вся переписка" @click="openAttempt = item.attemptId" />
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg bg-primary/10 p-3 text-sm"><p class="mb-0.5 text-xs text-muted">Вопрос студента</p><p class="whitespace-pre-wrap">{{ item.question || '—' }}</p></div>
            <div class="rounded-lg bg-elevated p-3 text-sm"><p class="mb-0.5 text-xs text-muted">Ответ заказчика<template v-if="item.intentId"> · тема: {{ item.intentId }}</template></p><p class="whitespace-pre-wrap">{{ item.answer }}</p></div>
          </div>
          <p v-if="item.reason" class="text-sm"><span class="text-muted">Пояснение студента: </span>{{ item.reason }}</p>
        </UCard>

        <div v-if="pages > 1" class="flex items-center justify-center gap-2">
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-chevron-left" :disabled="page <= 1" aria-label="Назад" @click="page--" />
          <span class="text-sm">Страница {{ page }} из {{ pages }}</span>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-chevron-right" :disabled="page >= pages" aria-label="Вперёд" @click="page++" />
        </div>
      </div>
    </template>

    <AttemptDetail :id="openAttempt" @close="openAttempt = null" @deleted="openAttempt = null" />
  </div>
</template>
