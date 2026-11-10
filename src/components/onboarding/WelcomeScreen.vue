<script setup lang="ts">
import { reactive, ref, useTemplateRef } from 'vue';
import type { FormError } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';
import TzLogo from '../layout/TzLogo.vue';
import CaseOverview from './CaseOverview.vue';

const { scenario, start, readProgressFile, applyImport } = useSession();

const state = reactive({ name: '' });
const importError = ref<string | null>(null);
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const validate = (value: { name: string }): FormError[] =>
  value.name.trim() ? [] : [{ name: 'name', message: 'Укажите имя: оно попадёт в итоговый документ.' }];

function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  importError.value = null;
  readProgressFile(file, applyImport, (text) => (importError.value = text));
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:gap-10">
    <section class="flex-1 space-y-6">
      <div class="flex items-center gap-3">
        <TzLogo class="size-11 text-highlighted" />
        <h1 class="text-3xl font-bold tracking-tight">ТЗ Практикум</h1>
      </div>
      <p class="max-w-xl text-base text-toned">
        Вы инженер по автоматизации. Заказчик знает об объекте всё, но отвечает только на заданный вопрос. Расспросите его, отделите
        требования от пожеланий и составьте техническое задание.
      </p>
      <CaseOverview :scenario="scenario" />
    </section>

    <UCard class="w-full lg:max-w-md" :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">Новая тренировка</h2>
        <UBadge color="primary" variant="subtle" icon="i-lucide-graduation-cap" label="Учебный режим" />
      </div>
      <UForm :state="state" :validate="validate" :validate-on="['input']" class="space-y-5" @submit="start(state.name)">
        <UFormField label="Имя студента" name="name" required>
          <UInput v-model="state.name" size="xl" class="w-full" autocomplete="name" :maxlength="80" placeholder="Например, Ирина Петрова" />
        </UFormField>
        <UButton type="submit" size="xl" block trailing-icon="i-lucide-arrow-right" label="Начать тренировку" />
      </UForm>
      <USeparator />
      <div class="space-y-3">
        <p class="text-sm text-muted">Есть файл прогресса? Можно продолжить работу с места, где вы остановились.</p>
        <UButton color="neutral" variant="outline" icon="i-lucide-upload" label="Загрузить файл прогресса" @click="fileInput?.click()" />
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" aria-label="Файл прогресса" data-testid="start-import" @change="onFile" />
        <UAlert v-if="importError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="importError" />
      </div>
    </UCard>
  </main>
</template>
