<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';
import { useTheme } from '../../composables/useTheme';
import { themeAccent } from '../../theme/themes';
import type { Screen } from '../../types';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ reset: []; import: [file: File] }>();

const { attempt, summary, go, exportProgress } = useSession();
const { presets, preset, isDark, selectPreset, setMode } = useTheme();
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const screen = computed<Screen>(() => attempt.value?.screen ?? 'dialog');

const items = computed<NavigationMenuItem[][]>(() => {
  const finished = Boolean(attempt.value?.result);
  const entry = (id: Screen, label: string, icon: string, count?: number): NavigationMenuItem => ({
    label,
    icon,
    active: screen.value === id || (id === 'result' && screen.value === 'tz' && finished),
    badge: count ? String(count).padStart(2, '0') : undefined,
    onSelect: () => {
      go(id);
      open.value = false;
    },
  });
  const list = [
    entry('dialog', 'Диалог', 'i-lucide-message-circle', summary.value?.questions),
    entry('registry', 'Реестр требований', 'i-lucide-clipboard-list', summary.value?.requirements),
  ];
  if (!finished) list.push(entry('tz', 'Редактор ТЗ', 'i-lucide-file-pen-line'));
  list.push(entry('progress', 'Мой прогресс', 'i-lucide-chart-no-axes-column'));
  if (finished) list.push(entry('result', 'Результат', 'i-lucide-award'));
  return [list];
});

const initials = computed(() => {
  const parts = (attempt.value?.studentName ?? '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 1)).toUpperCase();
});

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'Тема оформления',
      icon: 'i-lucide-palette',
      children: [
        presets.map((item) => ({
          label: item.name,
          icon: item.icon,
          trailingIcon: item.id === preset.value.id ? 'i-lucide-check' : undefined,
          chip: { inset: true, style: { backgroundColor: themeAccent(item) } },
          onSelect: () => selectPreset(item.id),
        })),
      ],
    },
    {
      label: 'Режим',
      icon: isDark.value ? 'i-lucide-moon' : 'i-lucide-sun',
      children: [
        [
          { label: 'Светлый', icon: 'i-lucide-sun', trailingIcon: isDark.value ? undefined : 'i-lucide-check', onSelect: () => setMode('light') },
          { label: 'Тёмный', icon: 'i-lucide-moon', trailingIcon: isDark.value ? 'i-lucide-check' : undefined, onSelect: () => setMode('dark') },
        ],
      ],
    },
  ],
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
  <UDashboardSidebar v-model:open="open" collapsible resizable :min-size="12" :default-size="15" :max-size="22" :ui="{ footer: 'border-t border-default' }" class="no-print">
    <template #header="{ collapsed }">
      <div class="flex min-w-0 items-center gap-2">
        <span class="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-inverted" aria-hidden="true">ТЗ</span>
        <h1 v-if="!collapsed" class="truncate text-sm font-semibold">ТЗ Практикум</h1>
      </div>
    </template>

    <template #default="{ collapsed }">
      <p v-if="!collapsed" class="px-2 text-xs font-semibold tracking-wide text-dimmed uppercase">Рабочее пространство</p>
      <UNavigationMenu v-for="(group, index) in items" :key="index" :collapsed="collapsed" :items="group" orientation="vertical" tooltip aria-label="Рабочее пространство" />
      <div v-if="summary && !attempt?.finishedAt && !collapsed" class="mt-auto space-y-2 rounded-lg border border-default bg-elevated/50 p-3">
        <p class="text-sm font-semibold">До следующего этапа</p>
        <p class="text-xs text-muted">
          {{ summary.remaining > 0 ? `Осталось изучить ${summary.remaining} ${summary.remaining === 1 ? 'тему' : summary.remaining < 5 ? 'темы' : 'тем'}` : 'Все темы затронуты, переходите к ТЗ' }}
        </p>
        <UProgress :model-value="summary.coveragePercent" size="sm" aria-label="Охват направлений" />
      </div>
    </template>

    <template #footer="{ collapsed }">
      <UDropdownMenu :items="menu" :content="{ align: 'start', side: 'top' }" :ui="{ content: 'w-64' }">
        <UButton color="neutral" variant="ghost" block :square="collapsed" class="justify-start" aria-label="Меню попытки">
          <UAvatar :text="initials" size="sm" />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left" data-testid="student-name">{{ attempt?.studentName }}</span>
          <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 text-dimmed" />
        </UButton>
      </UDropdownMenu>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" aria-label="Файл прогресса" data-testid="menu-import" @change="onFile" />
    </template>
  </UDashboardSidebar>
</template>
