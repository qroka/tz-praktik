<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import { formatTime } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';

defineProps<{ showProgressToggle: boolean }>();
const emit = defineEmits<{ reset: []; import: [file: File]; progress: [] }>();

const { attempt, save, summary, exportProgress } = useSession();
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const initials = computed(() => {
  const parts = (attempt.value?.studentName ?? '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 1)).toUpperCase();
});

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Сохранить файл прогресса', icon: 'i-lucide-download', onSelect: exportProgress },
    { label: 'Загрузить файл прогресса', icon: 'i-lucide-upload', onSelect: () => fileInput.value?.click() },
  ],
  [{ label: 'Начать заново', icon: 'i-lucide-rotate-ccw', color: 'error', onSelect: () => emit('reset') }],
]);

function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) emit('import', file);
}
</script>

<template>
  <header class="panel no-print flex shrink-0 items-center gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
    <span class="grid size-10 place-items-center rounded-xl bg-primary text-base font-bold text-inverted" aria-hidden="true">ТЗ</span>
    <h1 class="text-lg font-bold tracking-tight">ТЗ Практикум</h1>
    <span class="flex-1" />

    <span v-if="save.state === 'error'" class="flex items-center gap-1.5 text-sm text-error" role="status" data-testid="save-state">
      <UIcon name="i-lucide-cloud-off" class="size-4" /><span class="hidden sm:inline">Не удалось сохранить</span>
    </span>
    <span v-else-if="save.state === 'saving'" class="flex items-center gap-1.5 text-sm text-muted" data-testid="save-state">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /><span class="hidden sm:inline">Сохранение…</span>
    </span>
    <span v-else-if="save.state === 'saved' && save.at" class="flex items-center gap-1.5 text-sm text-muted" data-testid="save-state">
      <UIcon name="i-lucide-check" class="size-4 text-primary" /><span class="hidden sm:inline">Сохранено {{ formatTime(save.at) }}</span>
      <span class="sr-only sm:hidden">Сохранено</span>
    </span>

    <UTooltip v-if="showProgressToggle" text="Ваш прогресс">
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-chart-no-axes-column"
        :label="summary ? `${summary.coveragePercent}%` : undefined"
        aria-label="Открыть панель прогресса"
        data-testid="open-progress"
        @click="emit('progress')"
      />
    </UTooltip>

    <span class="hidden text-sm text-toned md:inline" data-testid="mode-label">Учебный режим</span>
    <span class="hidden max-w-40 truncate text-sm text-muted lg:inline" data-testid="student-name">{{ attempt?.studentName }}</span>
    <UDropdownMenu :items="items" :content="{ align: 'end' }">
      <UButton color="neutral" variant="ghost" square class="rounded-full" aria-label="Меню попытки">
        <UAvatar :text="initials" size="md" :ui="{ root: 'bg-[var(--surface-active)] text-primary' }" />
      </UButton>
    </UDropdownMenu>
    <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" aria-label="Файл прогресса" data-testid="menu-import" @change="onFile" />
  </header>
</template>
