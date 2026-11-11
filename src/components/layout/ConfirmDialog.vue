<script setup lang="ts">
// Подтверждение необратимого действия на UModal: Esc закрывает, фокус возвращается автоматически.
// locked — закрыть можно только кнопками (нет «×», Esc и клика по фону): для выбора, который нельзя сделать молча.
defineProps<{ title: string; confirmLabel: string; cancelLabel?: string; description?: string; locked?: boolean }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <UModal v-model:open="open" :dismissible="!locked" :close="!locked" :title="title" :description="description ?? title" :ui="{ description: 'sr-only', content: 'max-w-lg' }">
    <template #body>
      <div class="space-y-3 text-toned"><slot /></div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="cancelLabel ?? 'Отмена'" @click="emit('cancel'); open = false" />
        <UButton :label="confirmLabel" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
