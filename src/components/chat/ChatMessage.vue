<script setup lang="ts">
import { computed } from 'vue';
import { formatTime } from '../../composables/useLayout';
import type { ChatMessage, MessageQuality } from '../../types';

const props = defineProps<{
  message: ChatMessage;
  quoted?: ChatMessage | null;
  savedCount: number;
  readOnly: boolean;
  highlighted: boolean;
  customerName: string;
  customerInitials: string;
}>();
const emit = defineEmits<{ capture: []; clarify: []; repeat: [] }>();

const QUALITY_NOTE: Partial<Record<MessageQuality, string>> = {
  general: 'Слишком общий вопрос',
  unrecognized: 'Заказчик не понял вопрос',
  repeat: 'Повторный вопрос',
  clarify: 'Заказчик уточняет',
  blocked: 'Сначала нужен другой ответ',
  correction: 'Значение поправлено',
};

const isCustomer = computed(() => props.message.role === 'customer');
const note = computed(() => (!isCustomer.value && props.message.quality ? QUALITY_NOTE[props.message.quality] : undefined));
const designerNote = computed(() => isCustomer.value && props.message.quality === 'unknown_found');
const author = computed(() => (isCustomer.value ? props.customerName : 'Вы'));
const ui = computed(() => ({
  container: 'pb-1.5 gap-2.5',
  content: isCustomer.value
    ? 'bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-default'
    : 'bg-[var(--surface-active)] text-primary',
}));
</script>

<template>
  <div :id="`msg-${message.id}`" :data-testid="`message-${message.role}`" class="scroll-mt-4" :class="{ 'msg-highlight': highlighted }">
    <UChatMessage
      :id="message.id"
      :role="isCustomer ? 'assistant' : 'user'"
      :parts="[{ type: 'text', text: message.text }]"
      :side="isCustomer ? 'left' : 'right'"
      variant="soft"
      compact
      :avatar="isCustomer ? { text: customerInitials, alt: customerName } : undefined"
      :ui="{ ...ui, root: 'max-w-full', container: `${ui.container} ${isCustomer ? 'max-w-[88%] lg:max-w-[80%]' : 'max-w-[88%] lg:max-w-[75%]'}` }"
    >
      <template #content>
        <p class="mb-1 text-xs" :class="isCustomer ? 'text-muted' : 'text-primary/80'">
          <span>{{ author }}</span> · <time :dateTime="message.at">{{ formatTime(message.at) }}</time>
        </p>
        <p v-if="quoted" class="mb-2 line-clamp-2 border-l-2 border-primary/60 pl-2 text-xs text-toned">Уточнение: {{ quoted.text }}</p>
        <p class="bubble text-[15px] leading-relaxed" :class="isCustomer ? '' : 'text-default'">{{ message.text }}</p>
      </template>
    </UChatMessage>

    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 pb-3 text-xs" :class="isCustomer ? 'ps-10' : 'justify-end'">
      <UBadge v-if="note" color="neutral" variant="subtle" size="sm" :label="note" />
      <UBadge v-if="designerNote" color="primary" variant="subtle" size="sm" label="Решение предлагает проектировщик" />
      <UBadge v-if="savedCount > 0" color="primary" variant="subtle" size="sm" icon="i-lucide-check" :label="`В реестре${savedCount > 1 ? `: ${savedCount}` : ''}`" />
      <template v-if="!readOnly && isCustomer">
        <UButton size="sm" variant="soft" icon="i-lucide-bookmark-plus" label="Сохранить как требование" class="min-h-9" @click="emit('capture')" />
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-corner-down-right" label="Уточнить" aria-label="Уточнить" class="min-h-9" @click="emit('clarify')" />
      </template>
      <UButton v-if="!readOnly && !isCustomer" size="sm" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" label="Повторить" aria-label="Задать снова" class="min-h-9" @click="emit('repeat')" />
    </div>
  </div>
</template>
