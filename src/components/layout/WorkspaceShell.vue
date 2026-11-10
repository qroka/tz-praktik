<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { minSectionWords } from '../../data/evaluation';
import { formatTime, useLayout } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';
import { useTheme } from '../../composables/useTheme';
import { countWords } from '../../state/learningProgress';
import type { Attempt, Screen } from '../../types';
import ChatWorkspace from '../chat/ChatWorkspace.vue';
import TzEditor from '../editor/TzEditor.vue';
import LearningProgress from '../progress/LearningProgress.vue';
import ProgressScreen from '../progress/ProgressScreen.vue';
import RequirementRegistry from '../requirements/RequirementRegistry.vue';
import ResultScreen from '../results/ResultScreen.vue';
import AppSidebar from './AppSidebar.vue';
import ConfirmDialog from './ConfirmDialog.vue';

const { attempt, scenario, save, summary, reset, finish, applyImport, readProgressFile, notify, exportProgress } = useSession();
const { layout } = useLayout();
const { isDark, toggleMode } = useTheme();

const TITLES: Record<Screen, string> = { dialog: 'Диалог', registry: 'Реестр требований', tz: 'Редактор ТЗ', progress: 'Мой прогресс', result: 'Результат' };

const screen = computed<Screen>(() => {
  const current = attempt.value!;
  // Завершённая попытка: редактора нет, итоговый текст ТЗ — в отчёте.
  if (current.result && current.screen === 'tz') return 'result';
  if (!current.result && current.screen === 'result') return 'dialog';
  return current.screen;
});

const withProgress = computed(() => ['dialog', 'registry', 'tz'].includes(screen.value));
const showSide = computed(() => layout.value === 'wide' && withProgress.value);
const showToggle = computed(() => layout.value !== 'wide' && withProgress.value);

const sidebarOpen = ref(false);
const progressOpen = ref(false);
const confirm = ref<'reset' | 'finish' | null>(null);
const pendingImport = ref<Attempt | null>(null);
const resetOpen = computed({ get: () => confirm.value === 'reset', set: (open) => !open && (confirm.value = null) });
const finishOpen = computed({ get: () => confirm.value === 'finish', set: (open) => !open && (confirm.value = null) });
const importOpen = computed({ get: () => pendingImport.value !== null, set: (open) => !open && (pendingImport.value = null) });

watch(layout, (value) => value === 'wide' && (progressOpen.value = false));

const emptySections = computed(() =>
  attempt.value ? scenario.tzSections.filter((section) => countWords(attempt.value!.tz[section.id] ?? '') < minSectionWords) : [],
);

function onImport(file: File) {
  readProgressFile(file, (parsed) => (pendingImport.value = parsed), (text) => notify('error', 'Файл не загружен', text));
}
function confirmReset() {
  confirm.value = null;
  reset();
}
function confirmFinish() {
  confirm.value = null;
  finish();
}
function confirmImport() {
  if (pendingImport.value) applyImport(pendingImport.value);
  pendingImport.value = null;
}
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" storage-key="tz-praktikum-layout" class="print-flow">
    <AppSidebar v-model:open="sidebarOpen" @reset="confirm = 'reset'" @import="onImport" />

    <UDashboardPanel id="main" :ui="{ body: 'p-0 sm:p-0 gap-0 overflow-hidden' }" class="print-flow">
      <template #header>
        <UDashboardNavbar :title="TITLES[screen]" class="no-print">
          <template #leading><UDashboardSidebarToggle aria-label="Меню" /></template>
          <template #right>
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
            <UBadge color="primary" variant="subtle" icon="i-lucide-graduation-cap" label="Учебный режим" class="hidden sm:inline-flex" data-testid="mode-label" />
            <UButton
              v-if="showToggle"
              color="neutral"
              variant="outline"
              icon="i-lucide-chart-no-axes-column"
              :label="summary ? `${summary.coveragePercent}%` : undefined"
              aria-label="Открыть панель прогресса"
              data-testid="open-progress"
              @click="progressOpen = true"
            />
            <UButton color="neutral" variant="ghost" :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleMode" />
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <Transition name="fade" mode="out-in">
          <ChatWorkspace v-if="screen === 'dialog'" key="dialog" :layout="layout" />
          <RequirementRegistry v-else-if="screen === 'registry'" key="registry" />
          <TzEditor v-else-if="screen === 'tz'" key="tz" :layout="layout" @finish="confirm = 'finish'" />
          <ProgressScreen v-else-if="screen === 'progress'" key="progress" />
          <ResultScreen v-else key="result" />
        </Transition>
      </template>
    </UDashboardPanel>

    <UDashboardPanel v-if="showSide" id="progress" resizable :default-size="22" :min-size="18" :max-size="30" class="no-print" :ui="{ body: 'p-0 sm:p-0' }">
      <template #body><LearningProgress /></template>
    </UDashboardPanel>

    <USlideover v-if="layout !== 'compact'" v-model:open="progressOpen" side="right" title="Ваш прогресс" description="Охват направлений и подсказка" :ui="{ content: 'max-w-sm' }">
      <template #body><LearningProgress embedded /></template>
    </USlideover>
    <UDrawer v-else v-model:open="progressOpen" title="Ваш прогресс" description="Охват направлений и подсказка" :ui="{ content: 'max-h-[85dvh]' }">
      <template #body><LearningProgress embedded /></template>
    </UDrawer>

    <ConfirmDialog v-model:open="resetOpen" title="Начать заново?" confirm-label="Удалить и начать заново" @confirm="confirmReset">
      <p>Переписка, реестр и текст ТЗ этой попытки будут удалены из браузера. Если они ещё нужны, сначала сохраните файл прогресса.</p>
      <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Сохранить файл прогресса" @click="exportProgress" />
    </ConfirmDialog>
    <ConfirmDialog v-model:open="importOpen" title="Заменить текущую попытку?" confirm-label="Загрузить файл" @confirm="confirmImport">
      <p>Текущая работа будет заменена попыткой студента «{{ pendingImport?.studentName }}». Если она ещё нужна, сначала сохраните файл прогресса.</p>
    </ConfirmDialog>
    <ConfirmDialog v-model:open="finishOpen" title="Завершить попытку?" confirm-label="Завершить и получить оценку" cancel-label="Вернуться" @confirm="confirmFinish">
      <p>После завершения откроется эталон, а изменить ответы будет нельзя.</p>
      <UAlert
        v-if="emptySections.length > 0"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        data-testid="finish-warning"
        :description="`Не заполнено разделов: ${emptySections.length} (${emptySections.map((section) => section.id).join(', ')}).`"
      />
      <UAlert v-if="attempt && attempt.requirements.length === 0" color="warning" variant="subtle" icon="i-lucide-clipboard-x" description="В реестре нет ни одного требования." />
    </ConfirmDialog>
  </UDashboardGroup>
</template>
