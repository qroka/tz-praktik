<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';
import CategoryProgress from './CategoryProgress.vue';
import LearningHint from './LearningHint.vue';

const { scenario, summary, attempt } = useSession();

const info: AccordionItem[] = [
  { label: 'Описание кейса', icon: 'i-lucide-book-open', content: scenario.publicBrief },
  {
    label: 'Как считается прогресс',
    icon: 'i-lucide-calculator',
    content:
      'Показатель «изучено» — доля тем, по которым вы уже получили хотя бы одно сведение. Это не итоговая оценка и не качество ТЗ. Тема отмечается «Готово», когда выяснены все её сведения.',
  },
];
</script>

<template>
  <section v-if="summary" class="panel scroll-y print-flow h-full min-h-0 p-4 sm:p-6" aria-labelledby="my-progress-title">
    <h2 id="my-progress-title" class="text-xl font-semibold">Мой прогресс</h2>
    <p class="mt-1 text-sm text-muted">{{ scenario.title }} · {{ attempt?.studentName }}</p>

    <dl class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-2xl bg-[var(--surface-raised)] p-4">
        <dt class="text-xs text-muted">Темы исследованы</dt>
        <dd class="text-2xl font-bold">{{ summary.coveragePercent }}%</dd>
        <dd class="text-xs text-muted">{{ summary.explored }} из {{ summary.all }}</dd>
      </div>
      <div class="rounded-2xl bg-[var(--surface-raised)] p-4">
        <dt class="text-xs text-muted">Вопросов задано</dt>
        <dd class="text-2xl font-bold" data-testid="questions-count">{{ summary.questions }}</dd>
      </div>
      <div class="rounded-2xl bg-[var(--surface-raised)] p-4">
        <dt class="text-xs text-muted">Требований в реестре</dt>
        <dd class="text-2xl font-bold">{{ summary.requirements }}</dd>
        <dd class="text-xs text-muted">уточнить: {{ summary.needsClarification }} · противоречий: {{ summary.conflicts }}</dd>
      </div>
      <div class="rounded-2xl bg-[var(--surface-raised)] p-4">
        <dt class="text-xs text-muted">Разделов ТЗ заполнено</dt>
        <dd class="text-2xl font-bold">{{ summary.filledSections }} из {{ summary.totalSections }}</dd>
      </div>
    </dl>

    <h3 class="mt-6 mb-3 text-sm font-semibold">Направления исследования</h3>
    <CategoryProgress :rows="summary.rows" with-directions />

    <div v-if="!attempt?.finishedAt" class="mt-6"><LearningHint /></div>
    <UAccordion :items="info" type="multiple" class="mt-6" />
  </section>
</template>
