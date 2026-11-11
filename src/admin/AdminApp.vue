<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui';
import { useRoute, useRouter } from 'vue-router';
import { adminApi, ApiError } from '../api/client';
import TzLogo from '../components/layout/TzLogo.vue';
import { useTheme } from '../composables/useTheme';
import { themeAccent, type TzThemePreset } from '../theme/themes';
import AccountPage from './AccountPage.vue';
import AttemptsPage from './AttemptsPage.vue';
import DashboardPage from './DashboardPage.vue';
import FeedbackPage from './FeedbackPage.vue';
import LoginPage from './LoginPage.vue';
import ReportsPage from './ReportsPage.vue';
import ScenarioDetailPage from './ScenarioDetailPage.vue';
import StudentsPage from './StudentsPage.vue';
import ScenariosPage from './ScenariosPage.vue';

type User = { id: number; username: string };

const route = useRoute();
const router = useRouter();
const { presets, preset, preference, selectPreset, setMode } = useTheme();
const user = ref<User | null>(null);
const state = ref<'loading' | 'ready' | 'offline'>('loading');
const sidebarOpen = ref(false);

const sections = [
  { id: 'dashboard', label: 'Обзор', icon: 'i-lucide-layout-dashboard', page: DashboardPage },
  { id: 'scenarios', label: 'Сценарии', icon: 'i-lucide-library', page: ScenariosPage },
  { id: 'students', label: 'Студенты', icon: 'i-lucide-graduation-cap', page: StudentsPage },
  { id: 'attempts', label: 'Ответы студентов', icon: 'i-lucide-users', page: AttemptsPage },
  { id: 'feedback', label: 'Обратная связь', icon: 'i-lucide-thumbs-up', page: FeedbackPage },
  { id: 'reports', label: 'Отчёты', icon: 'i-lucide-file-spreadsheet', page: ReportsPage },
  { id: 'account', label: 'Аккаунт', icon: 'i-lucide-user-cog', page: AccountPage },
];

/** Открытый сценарий: #/admin/scenarios/<id>. */
const detailId = computed(() => (route.params.section === 'scenarios' && typeof route.params.id === 'string' ? route.params.id : null));
const current = computed(() => sections.find((item) => item.id === route.params.section) ?? sections[0]);

const navItems = computed<NavigationMenuItem[]>(() =>
  sections.map((item) => ({
    label: item.label,
    icon: item.icon,
    active: current.value.id === item.id,
    onSelect: () => {
      void router.push(`/admin/${item.id}`);
      sidebarOpen.value = false;
    },
  })),
);

const keep = (e: Event) => e.preventDefault();
const presetOf = (item: unknown) => presets.find((p) => p.id === (item as { presetId?: string }).presetId) ?? presets[0]!;
const chipStyle = (p: TzThemePreset) => ({ color: themeAccent(p), background: `color-mix(in oklab, ${themeAccent(p)} 20%, transparent)` });

const modes = [
  { value: 'light', icon: 'i-lucide-sun', label: 'Светлая' },
  { value: 'dark', icon: 'i-lucide-moon', label: 'Тёмная' },
  { value: 'auto', icon: 'i-lucide-monitor', label: 'Системная' },
] as const;
const currentMode = computed(() => modes.find((m) => m.value === preference.value) ?? modes[1]);

// То же меню, что у студентов: имя, выбор готовой темы, режим оформления; вместо файлов прогресса — переход к тренажёру и выход.
const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.username, description: 'Администратор', type: 'label' }],
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
  [{ label: 'К тренажёру', icon: 'i-lucide-arrow-left', to: '/' }],
  [{ label: 'Выйти', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: () => void logout() }],
]);

async function check() {
  try {
    user.value = (await adminApi.get<{ user: User | null }>('/auth/me')).user;
    state.value = 'ready';
  } catch (error) {
    state.value = error instanceof ApiError && error.status === 0 ? 'offline' : 'ready';
  }
}

async function logout() {
  try {
    await adminApi.post('/auth/logout');
  } finally {
    user.value = null;
  }
}

/** Сессия истекла во время работы: возвращаем на экран входа. */
function onExpired() {
  user.value = null;
}

onMounted(() => {
  window.addEventListener('tz-admin-expired', onExpired);
  void check();
});
onBeforeUnmount(() => window.removeEventListener('tz-admin-expired', onExpired));
</script>

<template>
  <div v-if="state === 'loading'" class="flex min-h-dvh items-center justify-center text-muted">Загрузка…</div>

  <div v-else-if="state === 'offline'" class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-server-off"
      title="Сервер недоступен"
      description="Панель работает только вместе с сервером. Запустите его командой npm run server и откройте сайт по адресу сервера."
    />
    <div class="flex gap-2">
      <UButton label="Повторить" icon="i-lucide-refresh-cw" @click="check" />
      <UButton label="К тренажёру" color="neutral" variant="outline" to="#/" />
    </div>
  </div>

  <LoginPage v-else-if="!user" @login="(u) => (user = u)" />

  <UDashboardGroup v-else unit="rem" storage="local" storage-key="tz-praktikum-admin-layout">
    <UDashboardSidebar v-model:open="sidebarOpen" collapsible resizable :min-size="12" :default-size="15" :max-size="22" :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <div class="flex min-w-0 items-center gap-2">
          <TzLogo class="size-7 shrink-0 text-primary" />
          <div v-if="!collapsed" class="min-w-0">
            <h1 class="truncate text-sm font-semibold">ТЗ Практикум</h1>
            <p class="truncate text-xs text-muted">Панель преподавателя</p>
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="navItems" orientation="vertical" tooltip aria-label="Разделы панели" />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="menu" :content="{ align: 'start', side: 'top' }" :ui="{ content: 'w-60' }">
          <UButton color="neutral" variant="ghost" block :square="collapsed" class="justify-start data-[state=open]:bg-elevated" aria-label="Меню администратора" data-testid="admin-menu">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full" :style="chipStyle(preset)">
              <UIcon :name="preset.icon" class="size-3.5" />
            </span>
            <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left">{{ user.username }}</span>
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
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="admin-main">
      <template #header>
        <UDashboardNavbar :title="detailId ? 'Сценарий' : current.label" :ui="{ title: 'text-lg font-semibold' }">
          <template #leading>
            <div class="hidden lg:block"><UDashboardSidebarCollapse /></div>
          </template>
          <template #right><div id="admin-navbar-actions" class="flex flex-wrap items-center justify-end gap-2" /></template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <ScenarioDetailPage v-if="detailId" :id="detailId" :key="detailId" />
        <component :is="current.page" v-else :key="current.id" :me="user" />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
