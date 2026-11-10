<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { factById } from '../../engine/factTracker';
import { prefersReducedMotion, type Layout } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';
import { addRequirement, setAnswerFeedback } from '../../state/attempt';
import RequirementForm, { type RequirementDraft } from '../requirements/RequirementForm.vue';
import RequirementRegistry from '../requirements/RequirementRegistry.vue';
import AnswerFeedbackModal from './AnswerFeedbackModal.vue';
import ChatComposer from './ChatComposer.vue';
import ChatMessage from './ChatMessage.vue';

const props = defineProps<{ layout: Layout }>();

const { attempt, scenario, readOnly, hiddenId, highlightId, visibleMessages, summary, update, send, notify } = useSession();

const text = ref('');
const replyToId = ref<string | null>(null);
const captureId = ref<string | null>(null);
const rateId = ref<string | null>(null);
const rateRating = ref<'like' | 'dislike'>('like');
const registryOpen = ref(false);
const caseOpen = ref(false);
const thread = useTemplateRef<HTMLElement>('thread');
const composer = useTemplateRef<{ focus: () => void }>('composer');
const typing = computed(() => hiddenId.value !== null);

const replyTarget = computed(() => (replyToId.value ? attempt.value?.messages.find((message) => message.id === replyToId.value) : undefined));
const captureMessage = computed(() => (captureId.value ? attempt.value?.messages.find((message) => message.id === captureId.value) : undefined));
const captureOpen = computed({ get: () => captureId.value !== null, set: (open) => !open && (captureId.value = null) });

// Категория подсказывается по раскрытому факту; студент может выбрать другую.
const captureInitial = computed<RequirementDraft>(() => {
  const message = captureMessage.value;
  const fact = message?.factIds?.[0] ? factById(scenario, message.factIds[0]) : undefined;
  return { text: message?.text ?? '', category: fact?.category ?? '', needsClarification: false };
});

const rateMessage = computed(() => (rateId.value ? attempt.value?.messages.find((message) => message.id === rateId.value) : undefined));
const rateOpen = computed({ get: () => rateId.value !== null, set: (open) => !open && (rateId.value = null) });
/** Вопрос студента, на который дан оцениваемый ответ: сообщение прямо перед ответом. */
const questionBefore = (messageId: string) => {
  const list = attempt.value?.messages ?? [];
  const index = list.findIndex((message) => message.id === messageId);
  const previous = index > 0 ? list[index - 1] : undefined;
  return previous?.role === 'student' ? previous : undefined;
};
const rateQuestion = computed(() => (rateId.value ? questionBefore(rateId.value)?.text ?? '' : ''));

function startRate(id: string, rating: 'like' | 'dislike') {
  rateId.value = id;
  rateRating.value = rating;
}
function saveRate(reason: string) {
  const id = rateId.value;
  if (!id) return;
  update((current) => setAnswerFeedback(current, id, { rating: rateRating.value, reason }));
  rateId.value = null;
  notify('success', 'Оценка сохранена');
}
function clearRate() {
  const id = rateId.value;
  if (!id) return;
  update((current) => setAnswerFeedback(current, id, null));
  rateId.value = null;
}

const savedCount =(messageId: string) => attempt.value?.requirements.filter((item) => item.sourceMessageId === messageId).length ?? 0;
const quotedOf = (replyId?: string) => (replyId ? attempt.value?.messages.find((message) => message.id === replyId) : null);

// Прокрутка вниз только если студент не ушёл читать историю.
function stickToBottom(force = false) {
  const element = thread.value;
  if (!element) return;
  const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
  if (force || nearBottom) element.scrollTo({ top: element.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}
watch(
  () => [visibleMessages.value.length, typing.value],
  async () => {
    await nextTick();
    stickToBottom(visibleMessages.value[visibleMessages.value.length - 1]?.role === 'student');
  },
  { flush: 'post' },
);
watch(highlightId, async (id) => {
  if (!id) return;
  await nextTick();
  document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
});
// После открытия экрана история прокручивается к последнему сообщению.
watch(thread, async (element) => {
  if (!element) return;
  await nextTick();
  element.scrollTop = element.scrollHeight;
});

function submit() {
  send(text.value.trim(), replyToId.value);
  text.value = '';
  replyToId.value = null;
  composer.value?.focus();
}

function startClarify(id: string) {
  replyToId.value = id;
  composer.value?.focus();
}

function repeat(question: string) {
  text.value = question;
  composer.value?.focus();
}

function saveRequirement(draft: RequirementDraft) {
  const sourceMessageId = captureId.value;
  update((current) => addRequirement(current, { ...draft, sourceMessageId }));
  captureId.value = null;
  notify('success', 'Требование сохранено');
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden" aria-label="Переписка с заказчиком">
    <!-- На телефоне элементы шапки чата переносятся в единственную верхнюю панель приложения -->
    <Teleport to="#navbar-actions" :disabled="props.layout !== 'compact'" defer>
    <header :class="props.layout === 'compact' ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-default px-4 py-3 sm:px-5 sm:py-4'">
      <div v-if="props.layout !== 'compact'" class="min-w-0 flex-1">
        <h2 class="truncate text-lg font-semibold">Диалог с заказчиком</h2>
        <p class="truncate text-sm text-muted">{{ scenario.title }} · {{ scenario.customer.role }}</p>
      </div>
      <UTooltip text="Состояние тренировки"><UBadge
        :color="readOnly ? 'neutral' : 'primary'"
        variant="subtle"
        size="lg"
        :label="readOnly ? 'Завершено' : 'В процессе'"
                data-testid="chat-status"
      >
        <template #leading><span class="size-2 rounded-full bg-current" aria-hidden="true" /></template>
      </UBadge></UTooltip>
      <div class="flex gap-2">
        <UTooltip text="Описание учебного кейса"><UButton color="neutral" variant="outline" icon="i-lucide-book-open" :label="props.layout === 'compact' ? undefined : 'О кейсе'" :square="props.layout === 'compact'" aria-label="О кейсе" class="min-h-10" :class="{ 'size-10 shrink-0 justify-center': props.layout === 'compact' }" @click="caseOpen = true" /></UTooltip>
        <UTooltip text="Быстрый просмотр и добавление требований"><UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-clipboard-list"
          :label="props.layout === 'compact' ? undefined : `Реестр ${summary?.requirements ?? 0}`"
          :square="props.layout === 'compact'"
          :aria-label="`Реестр: ${summary?.requirements ?? 0}`"
          class="min-h-10"
          :class="{ 'size-10 shrink-0 justify-center': props.layout === 'compact' }"
          data-testid="open-registry"
          @click="registryOpen = true"
        /></UTooltip>
      </div>
    </header>
    </Teleport>

    <div ref="thread" class="overflow-y-auto min-h-0 flex-1 px-3 py-4 sm:px-5" role="log" aria-live="polite" aria-relevant="additions" aria-label="Сообщения" tabindex="0">
      <TransitionGroup name="msg" tag="div" class="mx-auto max-w-4xl">
        <ChatMessage
          v-for="message in visibleMessages"
          :key="message.id"
          :message="message"
          :quoted="quotedOf(message.replyToId)"
          :saved-count="savedCount(message.id)"
          :read-only="readOnly"
          :highlighted="highlightId === message.id"
          :customer-name="scenario.customer.name"
          :customer-initials="scenario.customer.initials"
          :can-rate="Boolean(questionBefore(message.id))"
          @rate="(rating) => startRate(message.id, rating)"
          @capture="captureId = message.id"
          @clarify="startClarify(message.id)"
          @repeat="repeat(message.text)"
        />
      </TransitionGroup>
      <div v-if="typing" class="mx-auto flex max-w-4xl items-center gap-2 ps-11 pb-3 text-sm text-muted" data-testid="typing">
        <span class="typing-dots" aria-hidden="true"><i /><i /><i /></span>
        {{ scenario.customer.name }} печатает…
      </div>
    </div>

    <div v-if="readOnly" class="shrink-0 border-t border-default px-5 py-4 text-sm text-muted">Попытка завершена. Переписка доступна для чтения.</div>
    <ChatComposer v-else ref="composer" v-model="text" :busy="typing" :reply-text="replyTarget?.text ?? null" :compact-layout="props.layout === 'compact'" @send="submit" @cancel-reply="replyToId = null" />

    <RequirementForm
      v-model:open="captureOpen"
      title="Сохранить как требование"
      :initial="captureInitial"
      submit-label="Сохранить в реестр"
      hint="Перепишите слова заказчика как требование: параметр, значение, единица, условие."
      @submit="saveRequirement"
    />

    <AnswerFeedbackModal
      v-model:open="rateOpen"
      :rating="rateRating"
      :question="rateQuestion"
      :answer="rateMessage?.text ?? ''"
      :initial-reason="rateMessage?.feedback?.reason ?? ''"
      :has-existing="Boolean(rateMessage?.feedback)"
      @save="saveRate"
      @clear="clearRate"
    />

    <USlideover v-model:open="registryOpen" side="right" title="Реестр требований" description="Быстрый просмотр и добавление записей" :ui="{ content: 'max-w-md' }">
      <template #body><RequirementRegistry embedded @source="registryOpen = false" /></template>
    </USlideover>
    <UModal v-model:open="caseOpen" title="Описание кейса" :description="scenario.title" :ui="{ description: 'sr-only' }">
      <template #body>
        <div class="space-y-3">
          <p class="font-semibold">{{ scenario.title }}</p>
          <p class="text-toned">{{ scenario.publicBrief }}</p>
          <p class="text-sm text-muted">Ваша роль: инженер по автоматизации. Собеседник: {{ scenario.customer.role }}.</p>
        </div>
      </template>
    </UModal>
  </section>
</template>
