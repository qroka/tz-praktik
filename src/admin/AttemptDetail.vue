<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { adminApi } from '../api/client';
import { dateTime, downloadFromServer, gradeColor, minutesBetween, TYPE_LABEL } from './format';

type Message = { id: string; role: 'student' | 'customer'; text: string; at: string; quality?: string; feedback?: { rating: 'like' | 'dislike'; reason: string } };
type Result = {
  total: number; grade: string; dialogueCompleteness: number; tzCompleteness: number; mandatoryTotal: number; mandatoryDisclosed: number;
  parts: { id: string; label: string; score: number; max: number; note: string }[];
  penalties: { id: string; label: string; points: number; detail: string }[];
  recommendations: string[];
  contradictions: { text: string; detail: string }[];
  etalon: { factId: string; section: number; label: string; value: string; requirementType: string; disclosed: boolean; inRegistry: boolean; inTz: boolean }[];
};
type Attempt = {
  studentName: string; startedAt: string; finishedAt: string | null; difficulty: string;
  messages: Message[];
  requirements: { id: string; text: string; category: string; needsClarification: boolean; conflict: boolean }[];
  tz: Record<string, string>;
  result: Result | null;
};
type Detail = { id: number; scenarioId: string; scenarioTitle: string | null; group?: string; attempt: Attempt };

const props = defineProps<{ id: number | null }>();
const emit = defineEmits<{ close: []; deleted: [] }>();

const detail = ref<Detail | null>(null);
const error = ref('');
const tab = ref<'result' | 'chat' | 'registry' | 'tz'>('result');
const confirmDelete = ref(false);
const open = computed({ get: () => props.id !== null, set: (value) => !value && emit('close') });

watch(() => props.id, async (id) => {
  detail.value = null;
  error.value = '';
  tab.value = 'result';
  confirmDelete.value = false;
  if (id === null) return;
  try {
    detail.value = await adminApi.get<Detail>(`/admin/attempts/${id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки.';
  }
});

const tabs = [
  { id: 'result', label: 'Итог' }, { id: 'chat', label: 'Переписка' }, { id: 'registry', label: 'Реестр' }, { id: 'tz', label: 'Текст ТЗ' },
] as const;

const tzSections = computed(() => Object.entries(detail.value?.attempt.tz ?? {}).filter(([, text]) => text.trim()).sort(([a], [b]) => Number(a) - Number(b)));

async function remove() {
  if (!detail.value) return;
  await adminApi.del(`/admin/attempts/${detail.value.id}`);
  emit('deleted');
}
</script>

<template>
  <USlideover v-model:open="open" side="right" :title="detail ? detail.attempt.studentName : 'Попытка'" :description="detail?.scenarioTitle ?? ''" :ui="{ content: 'max-w-3xl' }">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
      <p v-else-if="!detail" class="text-muted">Загрузка…</p>
      <div v-else class="space-y-4" data-testid="attempt-detail">
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UBadge v-if="detail.group" :label="`Группа ${detail.group}`" color="neutral" variant="subtle" icon="i-lucide-users" data-testid="attempt-group" />
          <span>Начало: {{ dateTime(detail.attempt.startedAt) }}</span>
          <span>· время: {{ minutesBetween(detail.attempt.startedAt, detail.attempt.finishedAt) }}</span>
          <UBadge v-if="detail.attempt.result" :label="`${detail.attempt.result.total} · ${detail.attempt.result.grade}`" :color="gradeColor(detail.attempt.result.total)" variant="subtle" />
          <UBadge v-else label="не завершена" color="neutral" variant="outline" />
        </div>

        <div class="flex flex-wrap gap-1" role="tablist">
          <UButton v-for="t in tabs" :key="t.id" size="sm" :label="t.label" :color="tab === t.id ? 'primary' : 'neutral'" :variant="tab === t.id ? 'soft' : 'ghost'" role="tab" :aria-selected="tab === t.id" @click="tab = t.id" />
        </div>

        <div v-if="tab === 'result'" class="space-y-4">
          <p v-if="!detail.attempt.result" class="text-sm text-muted">Студент ещё не завершил попытку: результата нет. Переписку и черновик ТЗ можно посмотреть на соседних вкладках.</p>
          <template v-else>
            <div class="grid gap-3 sm:grid-cols-3">
              <UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Полнота диалога</p><p class="text-2xl font-semibold">{{ detail.attempt.result.dialogueCompleteness }}%</p></UCard>
              <UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Полнота ТЗ</p><p class="text-2xl font-semibold">{{ detail.attempt.result.tzCompleteness }}%</p></UCard>
              <UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Обязательных выяснено</p><p class="text-2xl font-semibold">{{ detail.attempt.result.mandatoryDisclosed }} из {{ detail.attempt.result.mandatoryTotal }}</p></UCard>
            </div>
            <table class="w-full text-left text-sm">
              <thead class="text-muted"><tr><th class="py-1 font-medium">Критерий</th><th class="font-medium">Балл</th><th class="font-medium">Комментарий</th></tr></thead>
              <tbody>
                <tr v-for="p in detail.attempt.result.parts" :key="p.id" class="border-t border-default"><td class="py-1.5 pr-2">{{ p.label }}</td><td class="pr-2 tabular-nums">{{ p.score }} / {{ p.max }}</td><td class="text-muted">{{ p.note }}</td></tr>
              </tbody>
            </table>
            <div v-if="detail.attempt.result.penalties.length" class="space-y-1">
              <h3 class="font-semibold">Штрафы</h3>
              <p v-for="p in detail.attempt.result.penalties" :key="p.id" class="text-sm">−{{ p.points }} · {{ p.label }}<span class="text-muted">. {{ p.detail }}</span></p>
            </div>
            <div v-if="detail.attempt.result.contradictions.length" class="space-y-1">
              <h3 class="font-semibold">Противоречия</h3>
              <p v-for="c in detail.attempt.result.contradictions" :key="c.text" class="text-sm">{{ c.text }}<span class="text-muted"> — {{ c.detail }}</span></p>
            </div>
            <div v-if="detail.attempt.result.recommendations.length" class="space-y-1">
              <h3 class="font-semibold">Рекомендации студенту</h3>
              <ul class="list-disc pl-5 text-sm"><li v-for="r in detail.attempt.result.recommendations" :key="r">{{ r }}</li></ul>
            </div>
            <div class="space-y-1">
              <h3 class="font-semibold">Сведения: что нашёл студент</h3>
              <div class="max-h-72 overflow-y-auto">
                <table class="w-full text-left text-sm">
                  <thead class="text-muted"><tr><th class="py-1 font-medium">Сведение</th><th class="font-medium">Тип</th><th class="font-medium">Диалог</th><th class="font-medium">Реестр</th><th class="font-medium">ТЗ</th></tr></thead>
                  <tbody>
                    <tr v-for="e in detail.attempt.result.etalon" :key="e.factId" class="border-t border-default">
                      <td class="py-1.5 pr-2">{{ e.label }}</td><td class="pr-2 text-muted">{{ TYPE_LABEL[e.requirementType] ?? e.requirementType }}</td>
                      <td>{{ e.disclosed ? '✓' : '—' }}</td><td>{{ e.inRegistry ? '✓' : '—' }}</td><td>{{ e.inTz ? '✓' : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>

        <div v-else-if="tab === 'chat'" class="space-y-2" data-testid="attempt-chat">
          <p v-if="!detail.attempt.messages.length" class="text-sm text-muted">Сообщений нет.</p>
          <div v-for="m in detail.attempt.messages" :key="m.id" class="flex" :class="m.role === 'student' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%] rounded-lg px-3 py-2 text-sm" :class="m.role === 'student' ? 'bg-primary/15' : 'bg-elevated'">
              <p class="mb-0.5 text-xs text-muted">{{ m.role === 'student' ? detail.attempt.studentName : 'Заказчик' }} · {{ dateTime(m.at) }}</p>
              <p class="whitespace-pre-wrap">{{ m.text }}</p>
              <p v-if="m.feedback" class="mt-1 text-xs" :class="m.feedback.rating === 'dislike' ? 'text-error' : 'text-success'">
                {{ m.feedback.rating === 'dislike' ? 'Студент: ответ не подошёл' : 'Студент: ответ подошёл' }}{{ m.feedback.reason ? ` — ${m.feedback.reason}` : '' }}
              </p>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'registry'" class="space-y-2">
          <p v-if="!detail.attempt.requirements.length" class="text-sm text-muted">В реестре пусто.</p>
          <div v-for="r in detail.attempt.requirements" :key="r.id" class="rounded-lg border border-default p-2 text-sm">
            <p>{{ r.text }}</p>
            <p class="mt-1 flex gap-1 text-xs">
              <UBadge :label="r.category" color="neutral" variant="outline" size="sm" />
              <UBadge v-if="r.needsClarification" label="требует уточнения" color="warning" variant="subtle" size="sm" />
              <UBadge v-if="r.conflict" label="противоречие" color="error" variant="subtle" size="sm" />
            </p>
          </div>
        </div>

        <div v-else class="space-y-3">
          <p v-if="!tzSections.length" class="text-sm text-muted">Текст ТЗ не заполнен.</p>
          <div v-for="[number, text] in tzSections" :key="number"><h3 class="font-semibold">Раздел {{ number }}</h3><p class="whitespace-pre-wrap text-sm">{{ text }}</p></div>
        </div>
      </div>
    </template>
    <template #footer>
      <div v-if="detail" class="flex w-full flex-wrap justify-between gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Скачать отчёт (.md)" @click="downloadFromServer(`/admin/attempts/${detail.id}/report.md`, `attempt-${detail.id}.md`)" />
        <div class="flex gap-2">
          <template v-if="confirmDelete">
            <UButton color="neutral" variant="outline" label="Отмена" @click="confirmDelete = false" />
            <UButton color="error" label="Удалить навсегда" data-testid="attempt-delete-confirm" @click="remove" />
          </template>
          <UButton v-else color="error" variant="ghost" icon="i-lucide-trash-2" label="Удалить попытку" @click="confirmDelete = true" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
