<script setup lang="ts">
import { formatTime } from '../../composables/useLayout';
import type { Requirement } from '../../types';

defineProps<{
  item: Requirement;
  sourceNumber?: number;
  readOnly: boolean;
  mergeMode: boolean;
  selected: boolean;
  /** Номер раздела ТЗ, куда запись переносится кнопкой; без него кнопки нет. */
  tzSection?: number;
}>();
const emit = defineEmits<{
  pick: [];
  edit: [];
  toggleClarify: [];
  toggleConflict: [];
  remove: [];
  source: [];
  addToTz: [];
}>();
</script>

<template>
  <UCard :ui="{ root: ['bg-elevated', selected ? 'ring-2 ring-primary' : ''], body: 'space-y-2.5 p-4' }" data-testid="requirement">
    <div class="flex items-start gap-3">
      <UCheckbox v-if="mergeMode" :model-value="selected" aria-label="Выбрать для объединения" class="mt-0.5" @update:model-value="emit('pick')" />
      <p class="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{{ item.text }}</p>
    </div>
    <div v-if="item.needsClarification || item.conflict" class="flex flex-wrap gap-2">
      <UTooltip v-if="item.needsClarification" text="Сведение неточное или неполное: уточните его у заказчика"><UBadge color="warning" variant="subtle" icon="i-lucide-circle-help" label="Требует уточнения" /></UTooltip>
      <UTooltip v-if="item.conflict" text="Запись расходится с другими сведениями"><UBadge color="error" variant="subtle" icon="i-lucide-triangle-alert" label="Противоречие" /></UTooltip>
    </div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>{{ formatTime(item.createdAt) }}</span>
      <UTooltip v-if="sourceNumber" text="Перейти к ответу заказчика, из которого сделана запись"><UButton variant="link" color="primary" size="xs" class="p-0" :label="`Сообщение №${sourceNumber}`" aria-label="Показать в переписке" @click="emit('source')" /></UTooltip>
      <span v-else>Добавлено вручную</span>
      <span v-if="item.mergedFrom && item.mergedFrom.length > 1">Источников: {{ item.mergedFrom.length }}</span>
      <span v-if="item.movedToSections?.length">В ТЗ: раздел {{ item.movedToSections.join(', ') }}</span>
      <span v-if="!readOnly && !mergeMode && !tzSection" class="ml-auto flex gap-1">
        <UTooltip text="Редактировать запись"><UButton color="neutral" variant="ghost" size="md" square icon="i-lucide-pencil" aria-label="Редактировать" @click="emit('edit')" /></UTooltip>
        <UTooltip text="Отметить: требует уточнения"><UButton
          color="neutral"
          :variant="item.needsClarification ? 'soft' : 'ghost'"
          size="md"
          square
          icon="i-lucide-circle-help"
          aria-label="Требует уточнения"
         
          :aria-pressed="item.needsClarification"
          @click="emit('toggleClarify')"
        /></UTooltip>
        <UTooltip text="Отметить противоречие"><UButton
          color="neutral"
          :variant="item.conflict ? 'soft' : 'ghost'"
          size="md"
          square
          icon="i-lucide-triangle-alert"
          aria-label="Противоречие"
         
          :aria-pressed="item.conflict"
          @click="emit('toggleConflict')"
        /></UTooltip>
        <UTooltip text="Удалить запись"><UButton color="neutral" variant="ghost" size="md" square icon="i-lucide-trash-2" aria-label="Удалить" @click="emit('remove')" /></UTooltip>
      </span>
    </div>
    <UTooltip v-if="tzSection && !readOnly" text="Добавить текст записи в выбранный раздел ТЗ">
      <UButton
        block
        color="primary"
        variant="soft"
        icon="i-lucide-list-plus"
        :disabled="item.movedToSections?.includes(tzSection)"
        :label="item.movedToSections?.includes(tzSection) ? `Уже в разделе ${tzSection}` : `В раздел ${tzSection}`"
        data-testid="add-to-tz"
        @click="emit('addToTz')"
      />
    </UTooltip>
  </UCard>
</template>
