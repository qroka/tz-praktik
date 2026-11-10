<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSession } from '../../composables/useSession';

// Перенос записей реестра в раздел ТЗ. Записи, уже перенесённые в этот раздел, повторно не выбираются.
const props = defineProps<{ sectionId: number }>();
const emit = defineEmits<{ move: [ids: string[]] }>();

const { attempt, scenario } = useSession();
const showAll = ref(false);
const picked = ref<string[]>([]);

const section = computed(() => scenario.tzSections.find((item) => item.id === props.sectionId)!);
const categoryTitle = (id: string) => scenario.categories.find((item) => item.id === id)?.title ?? '';

const list = computed(() => (attempt.value?.requirements ?? []).filter((item) => showAll.value || section.value.categories.includes(item.category)));
const items = computed(() =>
  list.value.map((item) => {
    const already = (attempt.value?.tz[props.sectionId] ?? '').includes(item.text);
    const other = item.movedToSections?.length && !already ? ` · перенесено в раздел ${item.movedToSections.join(', ')}` : '';
    return {
      label: item.text,
      value: item.id,
      disabled: already,
      description: `${categoryTitle(item.category)}${already ? ' · уже перенесено в этот раздел' : other}`,
    };
  }),
);

watch(() => props.sectionId, () => (picked.value = []));

function move() {
  emit('move', [...picked.value]);
  picked.value = [];
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4" aria-label="Требования для переноса">
    <UCheckbox v-model="showAll" label="Показать все категории" />
    <div v-if="items.length === 0" data-testid="picker-empty">
      <UEmpty
        icon="i-lucide-clipboard-list"
        :title="attempt?.requirements.length ? 'Для этого раздела записей нет' : 'Реестр пуст'"
        :description="attempt?.requirements.length ? 'Включите показ всех категорий или пишите текст сами.' : 'Вернитесь к диалогу и сохраните ответы заказчика как требования.'"
      />
    </div>
    <UCheckboxGroup v-else v-model="picked" :items="items" variant="card" class="overflow-y-auto min-h-0 flex-1" />
    <UButton block icon="i-lucide-list-plus" :disabled="picked.length === 0" :label="`Перенести в раздел ${sectionId}${picked.length ? `: ${picked.length}` : ''}`" @click="move" />
  </div>
</template>
