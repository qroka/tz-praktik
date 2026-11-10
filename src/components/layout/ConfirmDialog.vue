<script setup lang="ts">
// Подтверждение необратимого действия на UModal: Esc закрывает, фокус возвращается автоматически.
defineProps<{ title: string; confirmLabel: string; cancelLabel?: string; description?: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description ?? title" :ui="{ description: 'sr-only', content: 'max-w-lg' }">
    <template #body>
      <div class="space-y-3 text-toned"><slot /></div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="cancelLabel ?? 'Отмена'" @click="open = false" />
        <UButton :label="confirmLabel" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
