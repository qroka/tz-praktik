<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';

const MAX_MESSAGE = 600;

// Поле вопроса на UChatPrompt: Enter отправляет, Shift+Enter переносит строку, IME учитывается самим компонентом.
const props = defineProps<{ busy: boolean; replyText: string | null; compactLayout: boolean }>();
const text = defineModel<string>({ required: true });
const emit = defineEmits<{ send: []; cancelReply: [] }>();

const error = ref<string | null>(null);
const prompt = useTemplateRef<{ textareaRef?: { focus: () => void } }>('prompt');
const tooLong = computed(() => text.value.length > MAX_MESSAGE);

function submit() {
  if (!text.value.trim()) {
    error.value = 'Сначала напишите вопрос заказчику.';
    return;
  }
  if (tooLong.value) {
    error.value = `Сообщение длиннее ${MAX_MESSAGE} символов. Разделите его на отдельные вопросы.`;
    return;
  }
  if (props.busy) return;
  error.value = null;
  emit('send');
}

function focus() {
  prompt.value?.textareaRef?.focus();
}
defineExpose({ focus });
</script>

<template>
  <div class="composer-safe shrink-0 border-t border-default px-3 pt-3 sm:px-5">
    <div v-if="replyText" class="mb-2 flex items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-sm" data-testid="reply-target">
      <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span class="line-clamp-1 flex-1 text-toned">Уточнение: {{ replyText }}</span>
      <UTooltip text="Отменить уточнение"><UButton color="neutral" variant="ghost" size="sm" square icon="i-lucide-x" aria-label="Отменить уточнение" @click="emit('cancelReply')" /></UTooltip>
    </div>
    <div class="flex items-stretch gap-2">
      <UChatPrompt
        ref="prompt"
        v-model="text"
        class="min-w-0 flex-1"
        placeholder="Задайте следующий вопрос заказчику..."
        variant="outline"
        :rows="1"
        :maxrows="6"
        :autofocus="false"
        aria-label="Ваш вопрос заказчику"
        :ui="{ root: 'px-3 py-1' }"
        @submit.prevent="submit"
        @update:model-value="error = null"
      />
      <UChatPromptSubmit :disabled="busy || tooLong" color="primary" size="xl" class="h-auto w-12 shrink-0 justify-center" aria-label="Отправить" @click.prevent="submit" />
    </div>
    <div class="flex min-h-6 items-center gap-3 pt-1.5 text-xs text-muted">
      <span v-if="error" class="flex items-center gap-1.5 text-error" role="alert"><UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />{{ error }}</span>
      <span v-else-if="!compactLayout">Enter отправляет, Shift + Enter переносит строку</span>
      <span v-if="text.length > MAX_MESSAGE - 100" class="ms-auto" :class="tooLong ? 'text-error' : ''">{{ text.length }}/{{ MAX_MESSAGE }}</span>
    </div>
  </div>
</template>
