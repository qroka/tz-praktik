<script setup lang="ts">
import { formatTime } from '../../composables/useLayout';
import type { Requirement } from '../../types';

defineProps<{
  item: Requirement;
  sourceNumber?: number;
  readOnly: boolean;
  mergeMode: boolean;
  selected: boolean;
}>();
const emit = defineEmits<{
  pick: [];
  edit: [];
  toggleClarify: [];
  toggleConflict: [];
  remove: [];
  source: [];
}>();
</script>

<template>
  <UCard :ui="{ root: ['bg-elevated', selected ? 'ring-2 ring-primary' : ''], body: 'space-y-2.5 p-4' }" data-testid="requirement">
    <div class="flex items-start gap-3">
      <UCheckbox v-if="mergeMode" :model-value="selected" aria-label="Выбрать для объединения" class="mt-0.5" @update:model-value="emit('pick')" />
      <p class="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{{ item.text }}</p>
    </div>
    <div v-if="item.needsClarification || item.conflict" class="flex flex-wrap gap-2">
      <UBadge v-if="item.needsClarification" color="warning" variant="subtle" icon="i-lucide-circle-help" label="Требует уточнения" />
      <UBadge v-if="item.conflict" color="error" variant="subtle" icon="i-lucide-triangle-alert" label="Противоречие" />
    </div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>{{ formatTime(item.createdAt) }}</span>
      <UButton v-if="sourceNumber" variant="link" color="primary" size="xs" class="p-0" :label="`Сообщение №${sourceNumber}`" aria-label="Показать в переписке" @click="emit('source')" />
      <span v-else>Добавлено вручную</span>
      <span v-if="item.mergedFrom && item.mergedFrom.length > 1">Источников: {{ item.mergedFrom.length }}</span>
      <span v-if="item.movedToSections?.length">В ТЗ: раздел {{ item.movedToSections.join(', ') }}</span>
      <span v-if="!readOnly && !mergeMode" class="ml-auto flex gap-1">
        <UButton color="neutral" variant="ghost" size="md" square icon="i-lucide-pencil" aria-label="Редактировать" title="Редактировать" @click="emit('edit')" />
        <UButton
          color="neutral"
          :variant="item.needsClarification ? 'soft' : 'ghost'"
          size="md"
          square
          icon="i-lucide-circle-help"
          aria-label="Требует уточнения"
          title="Требует уточнения"
          :aria-pressed="item.needsClarification"
          @click="emit('toggleClarify')"
        />
        <UButton
          color="neutral"
          :variant="item.conflict ? 'soft' : 'ghost'"
          size="md"
          square
          icon="i-lucide-triangle-alert"
          aria-label="Противоречие"
          title="Отметить противоречие"
          :aria-pressed="item.conflict"
          @click="emit('toggleConflict')"
        />
        <UButton color="neutral" variant="ghost" size="md" square icon="i-lucide-trash-2" aria-label="Удалить" title="Удалить" @click="emit('remove')" />
      </span>
    </div>
  </UCard>
</template>
