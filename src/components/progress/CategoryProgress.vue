<script setup lang="ts">
import type { DirectionRow } from '../../state/learningProgress';

defineProps<{ rows: DirectionRow[]; withDirections?: boolean }>();

const META = {
  done: { icon: 'i-lucide-circle-check-big', label: 'Готово', cls: 'text-primary' },
  partial: { icon: 'i-lucide-circle-dot', label: 'Частично', cls: 'text-warning' },
  none: { icon: 'i-lucide-circle', label: 'Не начато', cls: 'text-muted' },
} as const;
</script>

<template>
  <ul class="space-y-2.5" data-testid="progress" aria-label="Направления исследования">
    <li v-for="row in rows" :key="row.id" class="flex items-start gap-3 text-sm" :data-status="row.status">
      <UIcon :name="META[row.status].icon" class="mt-0.5 size-5 shrink-0" :class="META[row.status].cls" aria-hidden="true" />
      <span class="min-w-0 flex-1">
        <span class="block font-medium text-default">{{ row.title }}</span>
        <span v-if="withDirections && row.status === 'none'" class="block text-xs text-muted">{{ row.direction }}</span>
      </span>
      <span class="shrink-0 text-xs" :class="META[row.status].cls">{{ META[row.status].label }}</span>
    </li>
  </ul>
</template>
