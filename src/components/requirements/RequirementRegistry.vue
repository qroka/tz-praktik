<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSession } from '../../composables/useSession';
import { addRequirement, mergeRequirements, removeRequirement, updateRequirement } from '../../state/attempt';
import ConfirmDialog from '../layout/ConfirmDialog.vue';
import RequirementCard from './RequirementCard.vue';
import RequirementForm, { type RequirementDraft } from './RequirementForm.vue';

// embedded — быстрый просмотр в боковой панели чата.
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ source: [] }>();

const { attempt, scenario, readOnly, update, showSource, notify } = useSession();

const ALL = 'all';
const category = ref(ALL);
const onlyClarify = ref(false);
const onlyConflict = ref(false);
const mergeMode = ref(false);
const picked = ref<string[]>([]);
const mergeText = ref('');
const formOpen = ref(false);
const editingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const deleteOpen = computed({ get: () => deletingId.value !== null, set: (open) => !open && (deletingId.value = null) });

const items = computed(() => attempt.value?.requirements ?? []);
const numbers = computed(() => {
  const map = new Map<string, number>();
  attempt.value?.messages.forEach((message, index) => map.set(message.id, index + 1));
  return map;
});
const filtered = computed(() =>
  items.value.filter((item) => (category.value === ALL || item.category === category.value) && (!onlyClarify.value || item.needsClarification) && (!onlyConflict.value || item.conflict)),
);
const groups = computed(() =>
  scenario.categories.map((group) => ({ group, rows: filtered.value.filter((item) => item.category === group.id) })).filter(({ rows }) => rows.length > 0),
);
const clarifyCount = computed(() => items.value.filter((item) => item.needsClarification).length);
const conflictCount = computed(() => items.value.filter((item) => item.conflict).length);
const categoryItems = computed(() => [{ label: 'Все категории', value: ALL }, ...scenario.categories.map((item) => ({ label: item.title, value: item.id }))]);

const editing = computed(() => items.value.find((item) => item.id === editingId.value));
const formInitial = computed<RequirementDraft>(() =>
  editing.value
    ? { text: editing.value.text, category: editing.value.category, needsClarification: editing.value.needsClarification }
    : { text: '', category: '', needsClarification: false },
);

function openAdd() {
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(id: string) {
  editingId.value = id;
  formOpen.value = true;
}
function submitForm(draft: RequirementDraft) {
  const id = editingId.value;
  if (id) update((current) => updateRequirement(current, id, draft));
  else update((current) => addRequirement(current, { ...draft, sourceMessageId: null }));
  formOpen.value = false;
  notify('success', id ? 'Запись обновлена' : 'Требование добавлено');
}

function togglePick(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter((value) => value !== id) : [...picked.value, id];
  mergeText.value = items.value.filter((item) => picked.value.includes(item.id)).map((item) => item.text).join(' ');
}
function closeMerge() {
  mergeMode.value = false;
  picked.value = [];
  mergeText.value = '';
}
function doMerge() {
  const ids = [...picked.value];
  const text = mergeText.value;
  update((current) => mergeRequirements(current, ids, text));
  closeMerge();
}
function confirmDelete() {
  const id = deletingId.value;
  if (id) update((current) => removeRequirement(current, id));
  deletingId.value = null;
}
function onSource(messageId: string) {
  showSource(messageId);
  emit('source');
}
</script>

<template>
  <section :class="props.embedded ? 'flex flex-col gap-4' : 'panel flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6'" aria-labelledby="registry-title">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="registry-title" class="mr-auto text-xl font-semibold">
        Реестр требований <UBadge color="neutral" variant="subtle" :label="String(items.length)" data-testid="registry-count" />
      </h2>
      <template v-if="!readOnly">
        <UButton v-if="items.length >= 2" :color="mergeMode ? 'primary' : 'neutral'" :variant="mergeMode ? 'solid' : 'outline'" icon="i-lucide-merge" label="Объединить" :aria-pressed="mergeMode" @click="mergeMode ? closeMerge() : (mergeMode = true)" />
        <UButton icon="i-lucide-plus" label="Добавить" @click="openAdd" />
      </template>
    </div>

    <div v-if="items.length > 0" class="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтры реестра">
      <USelect v-model="category" :items="categoryItems" aria-label="Фильтр по категории" class="w-full sm:w-64" />
      <UButton :color="onlyClarify ? 'primary' : 'neutral'" :variant="onlyClarify ? 'soft' : 'outline'" icon="i-lucide-circle-help" :label="`Уточнить: ${clarifyCount}`" :aria-pressed="onlyClarify" @click="onlyClarify = !onlyClarify" />
      <UButton :color="onlyConflict ? 'primary' : 'neutral'" :variant="onlyConflict ? 'soft' : 'outline'" icon="i-lucide-triangle-alert" :label="`Противоречия: ${conflictCount}`" :aria-pressed="onlyConflict" @click="onlyConflict = !onlyConflict" />
    </div>

    <div :class="props.embedded ? 'space-y-5' : 'scroll-y -mr-2 min-h-0 flex-1 space-y-5 pr-2'">
      <div v-if="items.length === 0" data-testid="registry-empty">
        <UEmpty icon="i-lucide-clipboard-list" title="Пока нет требований" description="Сохраните важные сведения из ответов заказчика, чтобы использовать их при подготовке ТЗ." />
      </div>
      <UEmpty v-else-if="filtered.length === 0" icon="i-lucide-search-x" title="Ничего не найдено" description="По этим фильтрам записей нет." />

      <section v-for="{ group, rows } in groups" :key="group.id" class="space-y-2.5">
        <h3 class="text-sm font-semibold text-toned">{{ group.title }}</h3>
        <RequirementCard
          v-for="item in rows"
          :key="item.id"
          :item="item"
          :source-number="item.sourceMessageId ? numbers.get(item.sourceMessageId) : undefined"
          :read-only="readOnly"
          :merge-mode="mergeMode"
          :selected="picked.includes(item.id)"
          @pick="togglePick(item.id)"
          @edit="openEdit(item.id)"
          @toggle-clarify="update((current) => updateRequirement(current, item.id, { needsClarification: !item.needsClarification }))"
          @toggle-conflict="update((current) => updateRequirement(current, item.id, { conflict: !item.conflict }))"
          @remove="deletingId = item.id"
          @source="onSource(item.sourceMessageId!)"
        />
      </section>
    </div>

    <div v-if="mergeMode" class="shrink-0 space-y-3 rounded-2xl bg-[var(--surface-raised)] p-4" data-testid="merge-panel">
      <UFormField label="Общая формулировка">
        <UTextarea v-model="mergeText" :rows="3" autoresize class="w-full" placeholder="Отметьте две записи или больше" />
      </UFormField>
      <UButton :disabled="picked.length < 2 || !mergeText.trim()" :label="`Объединить записи: ${picked.length}`" @click="doMerge" />
    </div>

    <RequirementForm
      v-model:open="formOpen"
      :title="editingId ? 'Редактирование записи' : 'Новое требование'"
      :initial="formInitial"
      :submit-label="editingId ? 'Сохранить' : 'Добавить'"
      @submit="submitForm"
    />
    <ConfirmDialog v-model:open="deleteOpen" title="Удалить запись?" confirm-label="Удалить" @confirm="confirmDelete">
      <p>Запись исчезнет из реестра. Уже перенесённый в ТЗ текст останется.</p>
    </ConfirmDialog>
  </section>
</template>
