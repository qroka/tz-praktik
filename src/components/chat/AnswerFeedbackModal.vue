<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AnswerFeedback } from '../../types';

// Оценка ответа заказчика: соответствует ли он заданному вопросу. Причина необязательна, но попадает в файл прогресса.
const props = defineProps<{ rating: AnswerFeedback['rating']; question: string; answer: string; initialReason: string; hasExisting: boolean }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ save: [reason: string]; clear: [] }>();

const MAX_REASON = 300;
const reason = ref('');
const liked = computed(() => props.rating === 'like');
const presets = computed(() =>
  liked.value
    ? ['Ответ по сути вопроса', 'Достаточно подробно', 'Назвал конкретное значение']
    : ['Ответ не по теме', 'Не ответил на вопрос', 'Слишком общо', 'Не понял ясный вопрос', 'Ответил не на ту часть вопроса'],
);

watch(open, (isOpen) => {
  if (isOpen) reason.value = props.initialReason;
});

function addPreset(text: string) {
  const current = reason.value.trim();
  if (current.includes(text)) return;
  reason.value = (current ? `${current}. ${text}` : text).slice(0, MAX_REASON);
}

function save() {
  emit('save', reason.value.trim().slice(0, MAX_REASON));
}
</script>

<template>
  <UModal v-model:open="open" :title="liked ? 'Ответ подходит к вопросу' : 'Ответ не подходит к вопросу'" description="Оценка ответа заказчика" :ui="{ description: 'sr-only', content: 'max-w-lg' }">
    <template #body>
      <div class="space-y-4" data-testid="feedback-modal">
        <div class="space-y-2 rounded-lg bg-elevated p-3 text-sm">
          <p class="text-muted">Ваш вопрос</p>
          <p class="line-clamp-3 text-toned">{{ question }}</p>
          <p class="pt-1 text-muted">Ответ заказчика</p>
          <p class="line-clamp-4 text-toned">{{ answer }}</p>
        </div>
        <UFormField label="Почему такая оценка" help="Необязательно. Коротко: что соответствует вопросу или чего не хватило." :hint="`${reason.length}/${MAX_REASON}`">
          <UTextarea v-model="reason" :rows="3" autoresize :maxrows="8" :maxlength="MAX_REASON" class="w-full" autofocus placeholder="Например: спросил про давление после насоса, ответили про давление до насоса" data-testid="feedback-reason" />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton v-for="preset in presets" :key="preset" size="sm" color="neutral" variant="outline" :label="preset" @click="addPreset(preset)" />
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
          <UButton v-if="hasExisting" color="neutral" variant="ghost" label="Снять оценку" class="me-auto" @click="emit('clear')" />
          <UButton color="neutral" variant="outline" label="Отмена" @click="open = false" />
          <UButton :color="liked ? 'success' : 'error'" :icon="liked ? 'i-lucide-thumbs-up' : 'i-lucide-thumbs-down'" label="Сохранить оценку" data-testid="feedback-save" @click="save" />
        </div>
      </div>
    </template>
  </UModal>
</template>
