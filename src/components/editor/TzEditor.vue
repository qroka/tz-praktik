<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { minSectionWords } from '../../data/evaluation';
import type { Layout } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';
import { moveRequirementsToSection, setTzText } from '../../state/attempt';
import { countWords } from '../../state/learningProgress';
import RequirementPicker from './RequirementPicker.vue';

const props = defineProps<{ layout: Layout }>();
const emit = defineEmits<{ finish: [] }>();

const { attempt, scenario, update, notify } = useSession();
const pickerOpen = ref(false);
const area = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('area');

const total = scenario.tzSections.length;
const section = computed(() => scenario.tzSections.find((item) => item.id === attempt.value!.activeSection) ?? scenario.tzSections[0]);
const text = computed(() => attempt.value!.tz[section.value.id] ?? '');
const wordsOf = (id: number) => countWords(attempt.value!.tz[id] ?? '');
const filled = computed(() => scenario.tzSections.filter((item) => wordsOf(item.id) >= minSectionWords).length);
const state = (id: number) => (wordsOf(id) >= minSectionWords ? 'filled' : wordsOf(id) > 0 ? 'draft' : 'empty');

const sectionItems = computed(() =>
  scenario.tzSections.map((item) => ({ label: `${item.id}. ${item.title}${state(item.id) === 'filled' ? ' (заполнен)' : ''}`, value: item.id })),
);
const selected = computed({
  get: () => section.value.id,
  set: (id: number) => go(id),
});

const go = (id: number) => update((current) => ({ ...current, activeSection: id }));

function onInput(value: string | number | undefined) {
  const id = section.value.id;
  update((current) => setTzText(current, id, String(value ?? '')));
}

async function move(ids: string[]) {
  const id = section.value.id;
  update((current) => moveRequirementsToSection(current, id, ids));
  pickerOpen.value = false;
  notify('success', `Записей перенесено: ${ids.length}`, 'Перепишите черновик раздела своими словами.');
  await nextTick();
  area.value?.textareaRef?.focus();
}
</script>

<template>
  <div class="flex h-full min-h-0 gap-3 p-3 sm:p-4">
    <nav v-if="props.layout === 'wide'" class="rounded-lg border border-default bg-default overflow-y-auto w-64 shrink-0 p-3" aria-label="Разделы технического задания">
      <div class="flex items-center justify-between px-2 pb-2">
        <span class="text-xs font-semibold tracking-wide text-dimmed uppercase">Разделы ТЗ</span>
        <span class="text-xs text-muted" data-testid="tz-filled">{{ filled }} из {{ total }}</span>
      </div>
      <ol class="space-y-1">
        <li v-for="item in scenario.tzSections" :key="item.id">
          <UButton
            block
            :color="item.id === section.id ? 'primary' : 'neutral'"
            :variant="item.id === section.id ? 'soft' : 'ghost'"
            class="min-h-11 justify-start text-left whitespace-normal"
            :aria-current="item.id === section.id ? 'true' : undefined"
            @click="go(item.id)"
          >
            <span class="w-5 shrink-0 text-xs text-muted">{{ item.id }}</span>
            <span class="min-w-0 flex-1 text-sm leading-tight">{{ item.title }}</span>
            <UIcon v-if="state(item.id) === 'filled'" name="i-lucide-check" class="size-4 shrink-0 text-primary" aria-hidden="true" />
            <UIcon v-else-if="state(item.id) === 'draft'" name="i-lucide-pencil-line" class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span v-if="state(item.id) !== 'empty'" class="sr-only">{{ state(item.id) === 'filled' ? 'заполнен' : 'есть черновик' }}</span>
          </UButton>
        </li>
      </ol>
    </nav>

    <section class="rounded-lg border border-default bg-default flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6" :aria-label="`Раздел ${section.id}`">
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-semibold tracking-wide text-primary uppercase">Раздел {{ section.id }} из {{ total }}</p>
          <p v-if="props.layout !== 'wide'" class="text-xs text-muted" data-testid="tz-filled">Заполнено {{ filled }} из {{ total }}</p>
        </div>
        <h2 class="text-xl font-semibold">{{ section.title }}</h2>
        <USelect v-if="props.layout !== 'wide'" v-model="selected" :items="sectionItems" aria-label="Раздел ТЗ" class="w-full" />
        <UAlert color="primary" variant="subtle" icon="i-lucide-lightbulb" :description="section.hint" data-testid="tz-hint" />
      </div>

      <UTextarea
        :key="section.id"
        ref="area"
        :model-value="text"
        :aria-label="`Текст раздела: ${section.title}`"
        placeholder="Сформулируйте требования своими словами: что система должна делать, какие значения, при каких условиях."
        class="min-h-0 flex-1"
        :ui="{ base: 'h-full min-h-48 resize-none text-[0.9375rem] leading-relaxed' }"
        @update:model-value="onInput"
      />

      <div class="flex flex-wrap items-center gap-2">
        <span class="mr-auto text-sm text-muted">Слов: {{ countWords(text) }}</span>
        <UTooltip text="Перенести сохранённые требования в этот раздел"><UButton color="neutral" variant="outline" icon="i-lucide-clipboard-list" label="Из реестра" data-testid="open-picker" @click="pickerOpen = true" /></UTooltip>
        <UTooltip text="Предыдущий раздел"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" aria-label="Предыдущий раздел" :disabled="section.id === 1" @click="go(section.id - 1)" /></UTooltip>
        <UTooltip text="Следующий раздел"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-right" aria-label="Следующий раздел" :disabled="section.id === total" @click="go(section.id + 1)" /></UTooltip>
        <UTooltip text="Завершить попытку и получить оценку"><UButton icon="i-lucide-flag" label="Завершить и проверить" data-testid="finish" @click="emit('finish')" /></UTooltip>
      </div>
    </section>

    <USlideover v-model:open="pickerOpen" side="right" title="Перенос из реестра" :description="`Раздел ${section.id}. ${section.title}`" :ui="{ content: 'max-w-md' }">
      <template #body><RequirementPicker :section-id="section.id" @move="move" /></template>
    </USlideover>
  </div>
</template>
