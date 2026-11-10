<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { minSectionWords } from '../../data/evaluation';
import { useLayout } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';
import { countWords } from '../../state/learningProgress';
import type { Attempt, Screen } from '../../types';
import ChatWorkspace from '../chat/ChatWorkspace.vue';
import TzEditor from '../editor/TzEditor.vue';
import LearningProgress from '../progress/LearningProgress.vue';
import ProgressScreen from '../progress/ProgressScreen.vue';
import RequirementRegistry from '../requirements/RequirementRegistry.vue';
import ResultScreen from '../results/ResultScreen.vue';
import AppHeader from './AppHeader.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import WorkspaceNavigation from './WorkspaceNavigation.vue';

const { attempt, scenario, reset, finish, applyImport, readProgressFile, notify, exportProgress } = useSession();
const { layout } = useLayout();

const screen = computed<Screen>(() => {
  const current = attempt.value!;
  // Завершённая попытка: редактора нет, итоговый текст ТЗ — в отчёте.
  if (current.result && current.screen === 'tz') return 'result';
  if (!current.result && current.screen === 'result') return 'dialog';
  return current.screen;
});

const showSide = computed(() => layout.value === 'wide' && ['dialog', 'registry', 'tz'].includes(screen.value));
const showToggle = computed(() => layout.value !== 'wide' && ['dialog', 'registry', 'tz'].includes(screen.value));
const gridClass = computed(() => {
  if (layout.value === 'compact') return 'grid-cols-1';
  if (layout.value === 'medium') return 'grid-cols-[220px_minmax(0,1fr)]';
  return showSide.value ? 'grid-cols-[240px_minmax(0,1fr)_320px]' : 'grid-cols-[240px_minmax(0,1fr)]';
});

const progressOpen = ref(false);
const confirm = ref<'reset' | 'finish' | null>(null);
const pendingImport = ref<Attempt | null>(null);
const resetOpen = computed({ get: () => confirm.value === 'reset', set: (open) => !open && (confirm.value = null) });
const finishOpen = computed({ get: () => confirm.value === 'finish', set: (open) => !open && (confirm.value = null) });
const importOpen = computed({ get: () => pendingImport.value !== null, set: (open) => !open && (pendingImport.value = null) });

// Панель прогресса не должна оставаться открытой при переходе на широкий экран.
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
  <div class="print-flow mx-auto flex h-dvh w-full max-w-[1800px] flex-col gap-3 p-2 sm:p-4">
    <AppHeader :show-progress-toggle="showToggle" @reset="confirm = 'reset'" @import="onImport" @progress="progressOpen = true" />
    <WorkspaceNavigation v-if="layout === 'compact'" compact />

    <div class="print-flow grid min-h-0 flex-1 gap-3" :class="gridClass">
      <WorkspaceNavigation v-if="layout !== 'compact'" :compact="false" />

      <main class="print-flow min-h-0 min-w-0" aria-label="Рабочая область">
        <Transition name="fade" mode="out-in">
          <ChatWorkspace v-if="screen === 'dialog'" key="dialog" :layout="layout" />
          <RequirementRegistry v-else-if="screen === 'registry'" key="registry" />
          <TzEditor v-else-if="screen === 'tz'" key="tz" :layout="layout" @finish="confirm = 'finish'" />
          <ProgressScreen v-else-if="screen === 'progress'" key="progress" />
          <ResultScreen v-else key="result" />
        </Transition>
      </main>

      <aside v-if="showSide" class="no-print min-h-0" aria-label="Ваш прогресс">
        <LearningProgress />
      </aside>
    </div>

    <USlideover v-if="layout === 'medium'" v-model:open="progressOpen" side="right" title="Ваш прогресс" description="Охват направлений и подсказка" :ui="{ content: 'max-w-sm' }">
      <template #body><LearningProgress embedded /></template>
    </USlideover>
    <UDrawer v-else-if="layout === 'compact'" v-model:open="progressOpen" title="Ваш прогресс" description="Охват направлений и подсказка" :ui="{ content: 'max-h-[85dvh]' }">
      <template #body><LearningProgress embedded /></template>
    </UDrawer>

    <ConfirmDialog v-model:open="resetOpen" title="Начать заново?" confirm-label="Удалить и начать заново" @confirm="confirmReset">
      <p>Переписка, реестр и текст ТЗ этой попытки будут удалены из браузера. Если они ещё нужны, сначала сохраните файл прогресса.</p>
      <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Сохранить файл прогресса" @click="exportProgress" />
    </ConfirmDialog>
    <ConfirmDialog v-model:open="importOpen" title="Заменить текущую попытку?" confirm-label="Загрузить файл" @confirm="confirmImport">
      <p>
        Текущая работа будет заменена попыткой студента «{{ pendingImport?.studentName }}». Если она ещё нужна, сначала сохраните файл прогресса.
      </p>
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
  </div>
</template>
