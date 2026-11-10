<script setup lang="ts">
import { computed, reactive, useId, useTemplateRef, watch } from 'vue';
import type { FormError } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';

export type RequirementDraft = { text: string; category: string; needsClarification: boolean };

// Форма требования в модальном окне: фиксация из чата, ручное добавление и редактирование.
const props = defineProps<{ title: string; initial: RequirementDraft; submitLabel: string; hint?: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ submit: [draft: RequirementDraft] }>();

const { scenario } = useSession();
const formId = useId();
const form = useTemplateRef<{ submit: () => Promise<void> }>('form');
const state = reactive({ text: '', category: undefined as string | undefined, clarify: false });
const categories = computed(() => scenario.categories.map((item) => ({ label: item.title, value: item.id })));

// Поля заполняются при каждом открытии формы.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    state.text = props.initial.text;
    state.category = props.initial.category || undefined;
    state.clarify = props.initial.needsClarification;
  },
  { immediate: true },
);

const validate = (value: typeof state): FormError[] => {
  const errors: FormError[] = [];
  if (!value.text.trim()) errors.push({ name: 'text', message: 'Требование не может быть пустым.' });
  if (!value.category) errors.push({ name: 'category', message: 'Выберите категорию.' });
  return errors;
};

function submit() {
  emit('submit', { text: state.text.trim(), category: state.category!, needsClarification: state.clarify });
}
</script>

<template>
  <UModal v-model:open="open" :title="title" description="Форма требования" :ui="{ description: 'sr-only', content: 'max-w-xl' }">
    <template #body>
      <UForm :id="formId" ref="form" :state="state" :validate="validate" class="space-y-4" data-testid="requirement-form" @submit="submit">
        <UFormField label="Формулировка требования" name="text" :help="hint" required>
          <UTextarea
            v-model="state.text"
            :rows="4"
            autoresize
            :maxrows="10"
            class="w-full"
            autofocus
            @keydown.ctrl.enter.prevent="form?.submit()"
            @keydown.meta.enter.prevent="form?.submit()"
          />
        </UFormField>
        <UFormField label="Категория" name="category" required>
          <USelect v-model="state.category" :items="categories" placeholder="Выберите категорию" class="w-full" />
        </UFormField>
        <UCheckbox v-model="state.clarify" label="Требует уточнения" />
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="open = false" />
          <UButton type="submit" :label="submitLabel" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
