<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AccordionItem } from '@nuxt/ui';
import { formatTime } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';
import { difficultyLabel, downloadFile, progressFileName, toMarkdown, toPlainText, toProgressJson, toResultJson } from '../../state/exporters';

const { attempt, scenario } = useSession();
const result = computed(() => attempt.value!.result!);

const ALL_ITEMS = ['parts', 'contradictions', 'useful', 'general', 'tz', 'transcript', 'etalon'];
const open = ref<string[]>(['tz']);
let beforePrint: string[] = [];

// В печатной версии раскрыты все блоки.
const onBeforePrint = () => {
  beforePrint = open.value;
  open.value = ALL_ITEMS;
};
const onAfterPrint = () => (open.value = beforePrint);
onMounted(() => {
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', onBeforePrint);
  window.removeEventListener('afterprint', onAfterPrint);
});

const metrics = computed(() => [
  { label: 'Полнота диалога', value: `${result.value.dialogueCompleteness}%`, percent: result.value.dialogueCompleteness },
  { label: 'Полнота ТЗ', value: `${result.value.tzCompleteness}%`, percent: result.value.tzCompleteness },
  {
    label: 'Найдено требований',
    value: String(result.value.foundRequirements),
    percent: result.value.mandatoryTotal ? (result.value.mandatoryDisclosed / result.value.mandatoryTotal) * 100 : 0,
  },
]);

// Сильные стороны берутся только из баллов движка: критерии, набравшие не меньше 70% максимума.
const strengths = computed(() => result.value.parts.filter((part) => part.max > 0 && part.score / part.max >= 0.7));

const filledSections = computed(() => scenario.tzSections.length - result.value.emptySections.length);
const items = computed<AccordionItem[]>(() => [
  { label: 'Как сложилась оценка', icon: 'i-lucide-calculator', value: 'parts', slot: 'parts' },
  { label: `Противоречия: ${result.value.contradictions.length}`, icon: 'i-lucide-triangle-alert', value: 'contradictions', slot: 'contradictions' },
  { label: `Полезные вопросы: ${result.value.usefulQuestions.length}`, icon: 'i-lucide-thumbs-up', value: 'useful', slot: 'useful' },
  { label: `Слишком общие вопросы: ${result.value.generalQuestions.length}`, icon: 'i-lucide-circle-help', value: 'general', slot: 'general' },
  { label: `Итоговое ТЗ · заполнено ${filledSections.value} из ${scenario.tzSections.length}`, icon: 'i-lucide-file-text', value: 'tz', slot: 'tz' },
  { label: `История переписки · сообщений: ${attempt.value!.messages.length}`, icon: 'i-lucide-messages-square', value: 'transcript', slot: 'transcript' },
  { label: `Эталон сведений об объекте · ${result.value.etalon.length}`, icon: 'i-lucide-book-check', value: 'etalon', slot: 'etalon' },
]);

const sortedEtalon = computed(() => [...result.value.etalon].sort((a, b) => a.section - b.section));
const print = () => window.print();
const typeLabel = (type: string) => (type === 'mandatory' ? 'Требование' : type === 'preference' ? 'Пожелание' : 'Предложение');
</script>

<template>
  <div class="overflow-y-auto print-flow h-full min-h-0 p-4 sm:p-6">
    <div class="mx-auto max-w-5xl space-y-4 pb-6" data-testid="result">
      <UCard :ui="{ body: 'grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr]' }" aria-label="Итоговая оценка">
        <div class="flex items-center gap-4">
          <p class="text-6xl font-bold tracking-tight text-primary" data-testid="score">{{ result.total }}<small class="ml-1 text-lg font-medium text-muted">из 100</small></p>
        </div>
        <div class="space-y-1">
          <p class="text-xl font-semibold">{{ result.grade }}</p>
          <p class="text-sm text-muted">{{ attempt!.studentName }}. Режим: {{ difficultyLabel(attempt!.difficulty).toLowerCase() }}.</p>
          <p class="text-sm text-muted">{{ scenario.title }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-3 md:col-span-2">
          <div v-for="metric in metrics" :key="metric.label" class="rounded-lg bg-elevated p-4">
            <p class="text-2xl font-bold">{{ metric.value }}</p>
            <p class="mb-2 text-sm text-muted">{{ metric.label }}</p>
            <UProgress :model-value="metric.percent" size="sm" :aria-label="metric.label" />
          </div>
        </div>
      </UCard>

      <div class="no-print flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-file-text" label="result.md" data-testid="export-md" @click="downloadFile('result.md', toMarkdown(attempt!, scenario), 'text/markdown')" />
        <UButton color="neutral" variant="outline" icon="i-lucide-download" label="result.txt" data-testid="export-txt" @click="downloadFile('result.txt', toPlainText(attempt!, scenario), 'text/plain')" />
        <UButton color="neutral" variant="outline" icon="i-lucide-file-json" label="result.json" data-testid="export-json" @click="downloadFile('result.json', toResultJson(attempt!, scenario), 'application/json')" />
        <UButton color="neutral" variant="outline" icon="i-lucide-save" label="Файл прогресса" data-testid="export-progress" @click="downloadFile(progressFileName(attempt!), toProgressJson(attempt!), 'application/json')" />
        <UButton color="neutral" variant="outline" icon="i-lucide-printer" label="Печать" data-testid="print" @click="print" />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UCard :ui="{ body: 'space-y-2 p-5' }">
          <h2 class="flex items-center gap-2 text-lg font-semibold"><UIcon name="i-lucide-circle-check-big" class="size-5 text-primary" />Что получилось</h2>
          <ul v-if="strengths.length" class="list-disc space-y-1 pl-5 text-sm text-toned">
            <li v-for="part in strengths" :key="part.id">{{ part.label }}: {{ String(part.score).replace('.', ',') }} из {{ part.max }}</li>
          </ul>
          <p v-else class="text-sm text-muted">Ни один критерий пока не набрал 70% баллов. Ниже подробно, что улучшить.</p>
        </UCard>
        <UCard :ui="{ body: 'space-y-2 p-5' }" data-testid="recommendations">
          <h2 class="flex items-center gap-2 text-lg font-semibold"><UIcon name="i-lucide-trending-up" class="size-5 text-warning" />Что улучшить</h2>
          <ul class="list-disc space-y-1 pl-5 text-sm text-toned">
            <li v-for="item in result.recommendations" :key="item">{{ item }}</li>
          </ul>
        </UCard>
      </div>

      <UCard v-if="result.missedCategories.length > 0" :ui="{ body: 'space-y-2 p-5' }" data-testid="missed">
        <h2 class="text-lg font-semibold">Пропущенные категории: {{ result.missedCategories.length }}</h2>
        <ul class="list-disc space-y-1 pl-5 text-sm text-toned">
          <li v-for="item in result.missedCategories" :key="item">{{ item }}</li>
        </ul>
      </UCard>

      <UAccordion v-model="open" :items="items" type="multiple" :ui="{ root: 'rounded-lg border border-default px-4', item: 'border-default', trigger: 'min-h-12 text-[0.9375rem]' }">
        <template #parts-body>
          <table class="w-full text-sm">
            <thead><tr class="text-left text-muted"><th class="py-1 font-medium">Критерий</th><th class="py-1 text-right font-medium">Баллы</th></tr></thead>
            <tbody>
              <tr v-for="part in result.parts" :key="part.id" class="border-t border-default align-top">
                <td class="py-2">{{ part.label }}<small class="block text-muted">{{ part.note }}</small></td>
                <td class="py-2 text-right whitespace-nowrap">{{ String(part.score).replace('.', ',') }} / {{ part.max }}</td>
              </tr>
              <tr v-for="item in result.penalties" :key="item.id" class="border-t border-default align-top">
                <td class="py-2">{{ item.label }}<small class="block text-muted">{{ item.detail }}</small></td>
                <td class="py-2 text-right text-error">−{{ item.points }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <template #contradictions-body>
          <div data-testid="contradictions">
            <p v-if="result.contradictions.length === 0" class="text-sm text-muted">Значения не расходятся со словами заказчика, отметок о противоречиях нет.</p>
            <ul v-else class="list-disc space-y-2 pl-5 text-sm">
              <li v-for="(item, index) in result.contradictions" :key="`${item.source}-${index}`">{{ item.text }}<small class="block text-muted">{{ item.source }}. {{ item.detail }}</small></li>
            </ul>
          </div>
        </template>

        <template #useful-body>
          <div data-testid="useful-questions">
            <p v-if="result.usefulQuestions.length === 0" class="text-sm text-muted">Таких вопросов не было.</p>
            <ul v-else class="list-disc space-y-2 pl-5 text-sm">
              <li v-for="item in result.usefulQuestions" :key="item.messageId">{{ item.text }}<small v-if="item.note" class="block text-muted">{{ item.note }}</small></li>
            </ul>
          </div>
        </template>

        <template #general-body>
          <div data-testid="general-questions">
            <p v-if="result.generalQuestions.length === 0" class="text-sm text-muted">Вы спрашивали конкретно.</p>
            <ul v-else class="list-disc space-y-2 pl-5 text-sm">
              <li v-for="item in result.generalQuestions" :key="item.messageId">{{ item.text }}<small v-if="item.note" class="block text-muted">{{ item.note }}</small></li>
            </ul>
          </div>
        </template>

        <template #tz-body>
          <div class="space-y-4" data-testid="final-tz">
            <div v-for="section in scenario.tzSections" :key="section.id">
              <h3 class="font-semibold">{{ section.id }}. {{ section.title }}</h3>
              <p v-if="(attempt!.tz[section.id] ?? '').trim()" class="whitespace-pre-wrap text-toned">{{ (attempt!.tz[section.id] ?? '').trim() }}</p>
              <p v-else class="text-muted italic">Раздел не заполнен.</p>
            </div>
          </div>
        </template>

        <template #transcript-body>
          <dl class="space-y-3" data-testid="transcript">
            <div v-for="message in attempt!.messages" :key="message.id">
              <dt class="text-xs text-muted">{{ message.role === 'student' ? attempt!.studentName : scenario.customer.name }}, {{ formatTime(message.at) }}</dt>
              <dd class="whitespace-pre-wrap">{{ message.text }}</dd>
            </div>
          </dl>
        </template>

        <template #etalon-body>
          <div data-testid="etalon" class="space-y-3">
            <p class="text-sm text-muted">Открывается только после завершения попытки. Сверьте значения со своим ТЗ.</p>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[640px] text-sm">
                <thead>
                  <tr class="text-left text-muted"><th class="py-1 pr-2 font-medium">Раздел</th><th class="py-1 pr-2 font-medium">Сведение и значение</th><th class="py-1 pr-2 font-medium">Тип</th><th class="py-1 pr-2 font-medium">В диалоге</th><th class="py-1 pr-2 font-medium">В реестре</th><th class="py-1 font-medium">В ТЗ</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in sortedEtalon" :key="row.factId" class="border-t border-default align-top">
                    <td class="py-2 pr-2">{{ row.section }}</td>
                    <td class="py-2 pr-2"><strong>{{ row.label }}.</strong> {{ row.value }}</td>
                    <td class="py-2 pr-2">{{ typeLabel(row.requirementType) }}</td>
                    <td v-for="(flag, index) in [row.disclosed, row.inRegistry, row.inTz]" :key="index" class="py-2 pr-2">
                      <UBadge :color="flag ? 'primary' : 'neutral'" variant="subtle" size="sm" :icon="flag ? 'i-lucide-check' : 'i-lucide-minus'" :label="flag ? 'да' : 'нет'" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </UAccordion>
    </div>
  </div>
</template>
