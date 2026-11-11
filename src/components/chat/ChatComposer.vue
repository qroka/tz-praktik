<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';

const MAX_MESSAGE = 600;

// Поле вопроса на UChatPrompt: Enter отправляет, Shift+Enter переносит строку, IME учитывается самим компонентом.
const props = defineProps<{ busy: boolean }>();
const text = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [] }>();

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
    <UChatPrompt
      ref="prompt"
      v-model="text"
      placeholder="Задайте следующий вопрос заказчику..."
      variant="naked"
      :rows="1"
      :maxrows="6"
      :autofocus="false"
      aria-label="Ваш вопрос заказчику"
      :ui="{ root: 'flex-row items-center gap-2 rounded-none border-0 bg-default p-0 shadow-none', body: 'min-w-0 flex-1', base: 'min-h-10 py-2', footer: 'shrink-0' }"
      @submit.prevent="submit"
      @update:model-value="error = null"
    >
      <template #footer>
        <UChatPromptSubmit :disabled="busy || tooLong" color="primary" size="lg" aria-label="Отправить" @click.prevent="submit" />
      </template>
    </UChatPrompt>
    <div v-if="error || text.length > MAX_MESSAGE - 100" class="flex items-center gap-3 pt-1.5 text-xs text-muted">
      <span v-if="error" class="flex items-center gap-1.5 text-error" role="alert"><UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />{{ error }}</span>
      <span v-if="text.length > MAX_MESSAGE - 100" class="ms-auto" :class="tooLong ? 'text-error' : ''">{{ text.length }}/{{ MAX_MESSAGE }}</span>
    </div>
  </div>
</template>
