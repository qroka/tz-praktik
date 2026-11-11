<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';
import { useStudent } from '../../composables/useStudent';
import { useTheme } from '../../composables/useTheme';
import { themeAccent, type TzThemePreset } from '../../theme/themes';
import type { Screen } from '../../types';
import TzLogo from './TzLogo.vue';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ reset: []; import: [file: File] }>();

const { attempt, summary, go, exportProgress, leaveAttempt, serverEnabled } = useSession();
const { logout } = useStudent();
const { presets, preset, preference, selectPreset, setMode } = useTheme();
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
  if (serverEnabled.value) list.unshift({ label: 'Личный кабинет', icon: 'i-lucide-user-round', onSelect: () => { open.value = false; void leaveAttempt(); } });
  if (finished) list.push(entry('result', 'Результат', 'i-lucide-award'));
  return [list];
});

/** На телефоне меню выезжает поверх страницы: диалог подтверждения открывается только после его закрытия, иначе он оказывается под ним. */
function afterSidebarClosed(action: () => void) {
  if (!open.value) return action();
  open.value = false;
  window.setTimeout(action, 300);
}

const keep = (e: Event) => e.preventDefault();
const presetOf = (item: unknown) => presets.find((p) => p.id === (item as { presetId?: string }).presetId) ?? presets[0]!;
const chipStyle = (p: TzThemePreset) => ({ color: themeAccent(p), background: `color-mix(in oklab, ${themeAccent(p)} 20%, transparent)` });

const modes = [
  { value: 'light', icon: 'i-lucide-sun', label: 'Светлая' },
  { value: 'dark', icon: 'i-lucide-moon', label: 'Тёмная' },
  { value: 'auto', icon: 'i-lucide-monitor', label: 'Системная' },
] as const;
const currentMode = computed(() => modes.find((m) => m.value === preference.value) ?? modes[1]);

// Меню как на ui.nuxt.com: имя, выбор готовой темы, режим, файлы, сброс.
const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: attempt.value?.studentName, description: attempt.value?.studentGroup ? `Группа ${attempt.value.studentGroup}` : 'Учебный режим', type: 'label' }],
  [
    {
      label: preset.value.name,
      slot: 'preset',
      presetId: preset.value.id,
      class: 'font-semibold',
      content: { class: 'w-44' },
      children: presets.map((p) => ({
        label: p.name,
        slot: 'preset',
        presetId: p.id,
        type: 'checkbox' as const,
        class: 'font-semibold',
        checked: preset.value.id === p.id,
        onUpdateChecked(checked: boolean) {
          if (checked) selectPreset(p.id);
        },
        onSelect: keep,
      })),
    },
  ],
  [{ slot: 'color-mode', type: 'label', class: 'p-1.5 text-sm font-normal' }],
  // С аккаунтом попытки хранятся на сервере: возврат в кабинет и выход из аккаунта. Файлы прогресса и сброс нужны только без сервера.
  ...(serverEnabled.value
    ? [
        [
          { label: 'Личный кабинет', icon: 'i-lucide-layout-dashboard', onSelect: () => void leaveAttempt() },
          { label: 'Выйти из аккаунта', icon: 'i-lucide-log-out', onSelect: () => void logout() },
        ],
      ]
    : [
        [
          { label: 'Сохранить файл прогресса', icon: 'i-lucide-download', onSelect: exportProgress },
          { label: 'Загрузить файл прогресса', icon: 'i-lucide-upload', onSelect: () => fileInput.value?.click() },
        ],
        [{ label: 'Начать заново', icon: 'i-lucide-rotate-ccw', color: 'error' as const, onSelect: () => afterSidebarClosed(() => emit('reset')) }],
      ]),
]);

function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) afterSidebarClosed(() => emit('import', file));
}
</script>

<template>
  <UDashboardSidebar v-model:open="open" collapsible resizable :min-size="12" :default-size="15" :max-size="22" :ui="{ footer: 'border-t border-default' }" class="no-print">
    <template #header="{ collapsed }">
      <div class="flex min-w-0 items-center gap-2">
        <TzLogo class="size-7 shrink-0 text-primary" />
        <h1 v-if="!collapsed" class="truncate text-sm font-semibold">ТЗ Практикум</h1>
      </div>
    </template>

    <template #default="{ collapsed }">
      <p v-if="!collapsed" class="px-2 text-xs font-semibold tracking-wide text-dimmed uppercase">Рабочее пространство</p>
      <UNavigationMenu v-for="(group, index) in items" :key="index" :collapsed="collapsed" :items="group" orientation="vertical" tooltip aria-label="Рабочее пространство" />
      <div v-if="!collapsed" class="mt-auto space-y-3">
      <div v-if="summary && !attempt?.finishedAt" class="space-y-2 rounded-lg border border-default bg-elevated/50 p-3">
        <p class="text-sm font-semibold">До следующего этапа</p>
        <p class="text-xs text-muted">
          {{ summary.remaining > 0 ? `Не начато ${summary.remaining} ${summary.remaining === 1 ? 'направление' : summary.remaining < 5 ? 'направления' : 'направлений'}` : 'Все направления затронуты' }} · обязательные сведения: {{ summary.coveragePercent }}%
        </p>
        <UProgress :model-value="summary.coveragePercent" size="sm" aria-label="Доля выясненных обязательных сведений" />
      </div>
      </div>
    </template>

    <template #footer="{ collapsed }">
      <UDropdownMenu :items="menu" :content="{ align: 'start', side: 'top' }" :ui="{ content: 'w-60' }">
        <UButton color="neutral" variant="ghost" block :square="collapsed" class="justify-start data-[state=open]:bg-elevated" aria-label="Меню попытки" title="Тема оформления, режим и файлы прогресса">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full" :style="chipStyle(preset)">
            <UIcon :name="preset.icon" class="size-3.5" />
          </span>
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left" data-testid="student-name">{{ attempt?.studentName }}</span>
          <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 text-dimmed" />
        </UButton>

        <template #preset-leading="{ item }">
          <span class="flex size-5 shrink-0 items-center justify-center rounded-full" :style="chipStyle(presetOf(item))">
            <UIcon :name="presetOf(item).icon" class="size-2.5" />
          </span>
        </template>
        <template #preset-trailing="{ item }">
          <UIcon v-if="(item as any).children" name="i-lucide-chevron-right" class="ms-auto size-4 text-dimmed" />
        </template>
        <template #color-mode>
          <div class="flex w-full items-center gap-1.5 text-sm font-normal text-default">
            <UIcon :name="currentMode.icon" class="size-5 shrink-0 text-dimmed" />
            {{ currentMode.label }}
            <div role="tablist" aria-label="Режим оформления" class="relative -my-1.5 ms-auto flex rounded-lg bg-elevated/50 p-0.5">
              <UTooltip v-for="m in modes" :key="m.value" :text="m.label">
                <button
                  type="button"
                  role="tab"
                  :aria-selected="preference === m.value"
                  :aria-label="m.label"
                  :class="['flex rounded-md p-1.5 transition-colors', preference === m.value ? 'bg-default text-highlighted shadow-xs' : 'text-muted hover:text-default']"
                  @click.stop="setMode(m.value)"
                >
                  <UIcon :name="m.icon" class="size-4" />
                </button>
              </UTooltip>
            </div>
          </div>
        </template>
      </UDropdownMenu>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" aria-label="Файл прогресса" data-testid="menu-import" @change="onFile" />
    </template>
  </UDashboardSidebar>
</template>
