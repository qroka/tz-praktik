<script setup lang="ts">
import { useSession } from '../../composables/useSession';
import CategoryProgress from './CategoryProgress.vue';
import LearningHint from './LearningHint.vue';

// embedded — внутри USlideover / UDrawer: собственная рамка не нужна.
defineProps<{ embedded?: boolean }>();
const { summary, attempt } = useSession();
</script>

<template>
  <section v-if="summary" :class="embedded ? 'flex flex-col gap-4' : 'flex h-full min-h-0 flex-col gap-4 p-4 sm:p-5'" aria-labelledby="progress-title">
    <div class="flex items-center justify-between gap-2">
      <h2 id="progress-title" class="text-lg font-semibold">Ваш прогресс</h2>
      <span class="text-xs font-semibold text-primary">Учебный режим</span>
    </div>

    <div>
      <p class="flex items-baseline gap-2">
        <span class="text-5xl font-bold tracking-tight" data-testid="coverage-percent">{{ summary.coveragePercent }}%</span>
        <span class="text-toned">изучено</span>
      </p>
      <UProgress :model-value="summary.coveragePercent" class="mt-3" :ui="{ base: 'bg-elevated' }" aria-label="Доля исследованных направлений" />
      <p class="mt-2 flex justify-between text-xs text-muted">
        <span data-testid="explored-count">{{ summary.explored }} из {{ summary.all }} тем</span>
        <span data-testid="remaining-count">Осталось {{ summary.remaining }}</span>
      </p>
    </div>

    <dl class="grid grid-cols-2 gap-2 text-sm">
      <div class="rounded-lg bg-elevated px-3 py-2">
        <dt class="text-xs text-muted">В реестре</dt>
        <dd class="font-semibold" data-testid="requirements-count">{{ summary.requirements }}</dd>
      </div>
      <div class="rounded-lg bg-elevated px-3 py-2">
        <dt class="text-xs text-muted">Разделов ТЗ</dt>
        <dd class="font-semibold">{{ summary.filledSections }} из {{ summary.totalSections }}</dd>
      </div>
      <div v-if="summary.needsClarification || summary.conflicts" class="col-span-2 flex flex-wrap gap-2">
        <UBadge v-if="summary.needsClarification" color="warning" variant="subtle" icon="i-lucide-circle-help" :label="`Уточнить: ${summary.needsClarification}`" />
        <UBadge v-if="summary.conflicts" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :label="`Противоречий: ${summary.conflicts}`" />
      </div>
    </dl>

    <USeparator />
    <h3 class="text-sm font-semibold">Изученные направления</h3>
    <CategoryProgress :rows="summary.rows" class="overflow-y-auto -mr-2 min-h-24 flex-1 pr-2" />
    <LearningHint v-if="!attempt?.finishedAt" />
  </section>
</template>
