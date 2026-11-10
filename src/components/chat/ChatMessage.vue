<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage, MessageQuality } from '../../types';

const props = defineProps<{
  message: ChatMessage;
  quoted?: ChatMessage | null;
  savedCount: number;
  readOnly: boolean;
  highlighted: boolean;
  customerName: string;
  customerInitials: string;
  /** Ответ можно оценить: ему предшествует вопрос студента. */
  canRate: boolean;
}>();
const emit = defineEmits<{ capture: [clarify: boolean]; clarify: []; repeat: []; rate: [rating: 'like' | 'dislike'] }>();

const feedback = computed(() => props.message.feedback);
// Режим преподавателя (?teacher в адресе): под ответом видно, как понят вопрос. Студенту это не показывается.
const teacher = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('teacher');
const TIME = { current: 'сейчас', future: 'после автоматизации', unspecified: 'не указано' } as const;
const diagnosticLine = computed(() => {
  const d = props.message.diagnostic;
  if (!teacher || !d || props.message.role !== 'customer') return '';
  const frame = d.frame;
  const parts = [props.message.intentId ?? '—', d.reason];
  if (frame) parts.push(`время: ${TIME[frame.time]}`, `действие: ${frame.action}`, `предмет: ${frame.subjects.join(', ') || '—'}`);
  if (frame?.attributes.length) parts.push(`признаки: ${frame.attributes.join(', ')}`);
  if (frame?.prefix) parts.push(`вежливость: «${frame.prefix}»`);
  if (d.score !== null) parts.push(`оценка: ${d.score.toFixed(2)}`);
  parts.push(`факты: ${props.message.factIds?.join(', ') || '—'}`);
  if (props.message.uncertainty) parts.push(`неизвестно: ${props.message.uncertainty.kind}/${props.message.uncertainty.id}`);
  return parts.join(' · ');
});

const QUALITY_NOTE: Partial<Record<MessageQuality, string>> = {
  general: 'Слишком общий вопрос',
  unrecognized: 'Заказчик не понял вопрос',
  repeat: 'Повторный вопрос',
  clarify: 'Заказчик уточняет',
  blocked: 'Сначала нужен другой ответ',
  correction: 'Значение поправлено',
};

/** Заказчик не понял вопрос или просит уточнить: только тогда уместны «Уточнить» и «Повторить». */
const needsFollowUp = computed(() => props.message.quality === 'unrecognized' || props.message.quality === 'clarify');
const isCustomer = computed(() => props.message.role === 'customer');
const note = computed(() => (!isCustomer.value && props.message.quality ? QUALITY_NOTE[props.message.quality] : undefined));
// Ответ со сведениями можно сохранить как требование; честное «не знаю» — отметить как требующее уточнения.
const hasFacts = computed(() => (props.message.factIds?.length ?? 0) > 0);
const uncertain = computed(() => isCustomer.value && (Boolean(props.message.uncertainty) || props.message.quality === 'unknown_found'));
const UNCERTAIN_NOTE = {
  survey: { label: 'Требует обследования объекта', tip: 'Заказчик не знает, что стоит на объекте: это нужно проверить на месте' },
  undefined: { label: 'Не определено — согласовать', tip: 'Заказчик это не определял: предложите решение и согласуйте' },
  designer: { label: 'Решение предлагает проектировщик', tip: 'Это предложение инженера, а не требование заказчика' },
} as const;
const designerNote = computed(() => (uncertain.value ? UNCERTAIN_NOTE[props.message.uncertainty?.kind ?? 'designer'] : null));
const author = computed(() => (isCustomer.value ? props.customerName : 'Вы'));
const ui = computed(() => ({
  container: 'pb-2 gap-3',
  content: isCustomer.value
    ? 'bg-elevated border border-default text-default'
    : 'bg-primary/10 text-primary',
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
      :avatar="isCustomer ? { text: customerInitials, alt: customerName } : undefined"
      :ui="{ ...ui, root: 'max-w-full', container: `${ui.container} ${isCustomer ? 'max-w-[88%] lg:max-w-[80%]' : 'max-w-[88%] lg:max-w-[75%]'}` }"
    >
      <template #content>
        <span class="sr-only">{{ author }}:</span>
        <p v-if="quoted" class="mb-2 line-clamp-2 border-l-2 border-primary/60 pl-2 text-xs text-toned">Уточнение: {{ quoted.text }}</p>
        <p class="bubble text-[0.9375rem] leading-relaxed" :class="isCustomer ? '' : 'text-default'">{{ message.text }}</p>
      </template>
    </UChatMessage>

    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 pb-3 text-xs" :class="isCustomer ? 'ps-11' : 'justify-end'">
      <UTooltip v-if="designerNote" :text="designerNote.tip"><UBadge color="primary" variant="subtle" size="sm" :label="designerNote.label" data-testid="uncertainty-badge" /></UTooltip>
      <UTooltip v-if="savedCount > 0" text="Ответ уже сохранён в реестре требований"><UBadge color="primary" variant="subtle" size="sm" icon="i-lucide-check" :label="`В реестре${savedCount > 1 ? `: ${savedCount}` : ''}`" /></UTooltip>
      <template v-if="!readOnly && isCustomer">
        <UTooltip v-if="hasFacts" text="Записать сведения из этого ответа в реестр требований"><UButton size="sm" variant="soft" icon="i-lucide-bookmark-plus" label="Сохранить как требование" class="min-h-9" @click="emit('capture', false)" /></UTooltip>
        <UTooltip v-else-if="uncertain" text="Записать в реестр вопрос, который нужно уточнить: это не подтверждённое сведение"><UButton size="sm" variant="soft" color="warning" icon="i-lucide-circle-help" label="Отметить: требует уточнения" class="min-h-9" data-testid="mark-clarify" @click="emit('capture', true)" /></UTooltip>
        <UTooltip v-if="needsFollowUp" text="Задать вопрос именно по этому ответу"><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-corner-down-right" label="Уточнить" aria-label="Уточнить" class="min-h-9" @click="emit('clarify')" /></UTooltip>
      </template>
      <template v-if="isCustomer && canRate">
        <template v-if="!readOnly">
          <UTooltip text="Ответ соответствует вопросу"><UButton size="sm" square :color="feedback?.rating === 'like' ? 'success' : 'neutral'" :variant="feedback?.rating === 'like' ? 'soft' : 'ghost'" icon="i-lucide-thumbs-up" aria-label="Ответ подходит" :aria-pressed="feedback?.rating === 'like'" class="size-9 justify-center" data-testid="rate-like" @click="emit('rate', 'like')" /></UTooltip>
          <UTooltip text="Ответ не соответствует вопросу"><UButton size="sm" square :color="feedback?.rating === 'dislike' ? 'error' : 'neutral'" :variant="feedback?.rating === 'dislike' ? 'soft' : 'ghost'" icon="i-lucide-thumbs-down" aria-label="Ответ не подходит" :aria-pressed="feedback?.rating === 'dislike'" class="size-9 justify-center" data-testid="rate-dislike" @click="emit('rate', 'dislike')" /></UTooltip>
        </template>
        <UTooltip v-else-if="feedback" :text="feedback.reason || 'Причина не указана'"><UBadge :color="feedback.rating === 'like' ? 'success' : 'error'" variant="subtle" size="sm" :icon="feedback.rating === 'like' ? 'i-lucide-thumbs-up' : 'i-lucide-thumbs-down'" :label="feedback.rating === 'like' ? 'Подходит' : 'Не подходит'" /></UTooltip>
      </template>
      <UTooltip v-if="!readOnly && !isCustomer && needsFollowUp" text="Вставить этот вопрос в поле ввода ещё раз"><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" label="Повторить" aria-label="Задать снова" class="min-h-9" @click="emit('repeat')" /></UTooltip>
    </div>

    <p v-if="isCustomer && feedback?.reason && !readOnly" class="-mt-1 pb-3 ps-11 text-xs text-muted" data-testid="feedback-reason-text">Ваша оценка: {{ feedback.reason }}</p>
    <p v-if="diagnosticLine" class="-mt-1 pb-3 ps-11 font-mono text-[11px] text-dimmed" data-testid="teacher-diagnostic">{{ diagnosticLine }}</p>

    <!-- Оценка вопроса: отдельной строкой по центру, не под сообщением -->
    <div v-if="note" class="flex justify-center pb-3" data-testid="message-note">
      <UTooltip text="Как заказчик отнёсся к вашему вопросу"><UBadge color="neutral" variant="subtle" size="md" :label="note" /></UTooltip>
    </div>
  </div>
</template>
