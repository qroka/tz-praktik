<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { minSectionWords } from '../../data/evaluation';
import { useLayout } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';
import { countWords } from '../../state/learningProgress';
import { effectiveScreen } from '../../state/screens';
import type { Attempt, Screen } from '../../types';
import ChatWorkspace from '../chat/ChatWorkspace.vue';
import TzEditor from '../editor/TzEditor.vue';
import LearningProgress from '../progress/LearningProgress.vue';
import ProgressScreen from '../progress/ProgressScreen.vue';
import RequirementRegistry from '../requirements/RequirementRegistry.vue';
import ResultScreen from '../results/ResultScreen.vue';
import AppSidebar from './AppSidebar.vue';
import ConfirmDialog from './ConfirmDialog.vue';

const { attempt, scenario, summary, reset, finish, applyImport, readProgressFile, notify, exportProgress, conflict, useServerVersion, keepMine } = useSession();
const { layout } = useLayout();

// Завершённая попытка: редактора нет, итоговый текст ТЗ — в отчёте.
const screen = computed<Screen>(() => effectiveScreen(attempt.value!));

const withProgress = computed(() => ['dialog', 'registry', 'tz'].includes(screen.value));
const showSide = computed(() => layout.value === 'wide' && withProgress.value);
/** В редакторе ТЗ справа вместо прогресса показывается реестр требований. */
const sideIsRegistry = computed(() => screen.value === 'tz');
const showToggle = computed(() => layout.value !== 'wide' && withProgress.value);

// Боковое меню выезжает поверх страницы на экранах уже 1024 px (lg у Nuxt UI): там без верхней панели его не открыть.
const sidebarOffCanvas = useMediaQuery('(max-width: 1023px)');
/** Верхней панели нет на широком экране; ниже она нужна для кнопки меню и кнопки прогресса. */
const showBar = computed(() => layout.value === 'compact' || sidebarOffCanvas.value || showToggle.value);
const sidebarOpen = ref(false);
const progressOpen = ref(false);
const confirm = ref<'reset' | 'finish' | null>(null);
const pendingImport = ref<Attempt | null>(null);
const resetOpen = computed({ get: () => confirm.value === 'reset', set: (open) => !open && (confirm.value = null) });
// Диалог конфликта нельзя закрыть мимо кнопок: Esc и клик по фону не должны молча выбрать версию.
const conflictOpen = computed({ get: () => conflict.value !== null, set: () => undefined });
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
      <template v-if="showBar" #header>
        <UDashboardNavbar class="no-print">
          <template #right>
            <div id="navbar-actions" class="flex items-center gap-2" />
            <UTooltip v-if="showToggle" :text="sideIsRegistry ? 'Реестр требований: можно сверяться при написании ТЗ' : 'Прогресс по направлениям и подсказка'">
              <UButton
                color="neutral"
                variant="outline"
                :icon="sideIsRegistry ? 'i-lucide-clipboard-list' : 'i-lucide-chart-no-axes-column'"
                :label="sideIsRegistry ? String(summary?.requirements ?? 0) : summary ? `${summary.coveragePercent}%` : undefined"
                :aria-label="sideIsRegistry ? 'Открыть реестр требований' : 'Открыть панель прогресса'"
                :data-testid="sideIsRegistry ? 'open-side-registry' : 'open-progress'"
                @click="progressOpen = true"
              />
            </UTooltip>
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
      <template #body>
        <div v-if="sideIsRegistry" class="p-4"><RequirementRegistry embedded :tz-section="attempt?.activeSection" /></div>
        <LearningProgress v-else />
      </template>
    </UDashboardPanel>

    <USlideover v-if="layout !== 'compact'" v-model:open="progressOpen" side="right" :title="sideIsRegistry ? 'Реестр требований' : 'Ваш прогресс'" :description="sideIsRegistry ? 'Сохранённые требования' : 'Охват направлений и подсказка'" :ui="{ content: 'max-w-md' }">
      <template #body>
        <RequirementRegistry v-if="sideIsRegistry" embedded :tz-section="attempt?.activeSection" @source="progressOpen = false" />
        <LearningProgress v-else embedded />
      </template>
    </USlideover>
    <UDrawer v-else v-model:open="progressOpen" :title="sideIsRegistry ? 'Реестр требований' : 'Ваш прогресс'" :description="sideIsRegistry ? 'Сохранённые требования' : 'Охват направлений и подсказка'" :ui="{ content: 'max-h-[85dvh]' }">
      <template #body>
        <RequirementRegistry v-if="sideIsRegistry" embedded :tz-section="attempt?.activeSection" @source="progressOpen = false" />
        <LearningProgress v-else embedded />
      </template>
    </UDrawer>

    <ConfirmDialog v-model:open="resetOpen" title="Начать заново?" confirm-label="Удалить и начать заново" @confirm="confirmReset">
      <p>Переписка, реестр и текст ТЗ этой попытки будут удалены из браузера. Если они ещё нужны, сначала сохраните файл прогресса.</p>
      <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Сохранить файл прогресса" @click="exportProgress" />
    </ConfirmDialog>
    <ConfirmDialog v-model:open="importOpen" title="Заменить текущую попытку?" confirm-label="Загрузить файл" @confirm="confirmImport">
      <p>Текущая работа будет заменена попыткой студента «{{ pendingImport?.studentName }}». Если она ещё нужна, сначала сохраните файл прогресса.</p>
    </ConfirmDialog>
    <ConfirmDialog v-model:open="conflictOpen" locked title="Попытка изменена на другом устройстве" confirm-label="Загрузить версию с другого устройства" cancel-label="Оставить мою версию" @confirm="useServerVersion" @cancel="keepMine">
      <p>Пока вы работали здесь, эту попытку сохранили с другого устройства. Выберите, какую версию оставить: вторая будет заменена.</p>
      <p v-if="conflict && attempt" class="rounded-lg bg-elevated px-3 py-2 text-sm" data-testid="conflict-summary">
        На другом устройстве: вопросов {{ conflict.attempt.messages.filter((m) => m.role === 'student').length }}, записей в реестре {{ conflict.attempt.requirements.length }}.
        Здесь: вопросов {{ attempt.messages.filter((m) => m.role === 'student').length }}, записей в реестре {{ attempt.requirements.length }}.
      </p>
    </ConfirmDialog>
    <ConfirmDialog v-model:open="finishOpen" title="Завершить попытку?" confirm-label="Завершить и получить оценку" cancel-label="Вернуться" @confirm="confirmFinish">
      <p>После завершения откроется оценка, а изменить ответы будет нельзя.</p>
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
