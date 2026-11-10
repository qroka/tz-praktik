<script setup lang="ts">
import type { DirectionRow } from '../../state/learningProgress';

defineProps<{ rows: DirectionRow[]; withDirections?: boolean }>();

// До начала темы число её скрытых сведений не показываем: студент не должен «добирать до 18».
const META = {
  done: { icon: 'i-lucide-circle-check-big', label: 'Выяснено', cls: 'text-primary' },
  partial: { icon: 'i-lucide-circle-dot', label: 'Частично', cls: 'text-warning' },
  none: { icon: 'i-lucide-circle', label: 'Не начато', cls: 'text-muted' },
} as const;

function tip(row: DirectionRow): string {
  if (row.status === 'none') return 'Не начато';
  if (row.status === 'done') return 'Выяснено: получены все обязательные сведения темы';
  return `Частично: выяснено около ${row.percent}% обязательных сведений темы`;
}
</script>

<template>
  <ul class="space-y-2.5" data-testid="progress" aria-label="Направления исследования">
    <li v-for="row in rows" :key="row.id" class="flex items-start gap-3 text-sm" :data-status="row.status">
      <UTooltip :text="tip(row)"><UIcon :name="META[row.status].icon" class="mt-0.5 size-5 shrink-0" :class="META[row.status].cls" aria-hidden="true" /></UTooltip>
      <span class="min-w-0 flex-1">
        <span class="block font-medium text-default">{{ row.title }}</span>
        <span v-if="withDirections && row.status === 'none'" class="block text-xs text-muted">{{ row.direction }}</span>
      </span>
      <span class="shrink-0 text-xs tabular-nums" :class="META[row.status].cls" data-testid="direction-status">
        <template v-if="row.status === 'partial'">{{ row.percent }}%</template>
        <template v-else>{{ META[row.status].label }}</template>
        <span v-if="row.status === 'partial'" class="sr-only"> — {{ META[row.status].label }}</span>
      </span>
    </li>
  </ul>
</template>
