<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminApi, ApiError } from '../api/client';
import AccountPage from './AccountPage.vue';
import AttemptsPage from './AttemptsPage.vue';
import DashboardPage from './DashboardPage.vue';
import LoginPage from './LoginPage.vue';
import ReportsPage from './ReportsPage.vue';
import ScenariosPage from './ScenariosPage.vue';

type User = { id: number; username: string };

const route = useRoute();
const router = useRouter();
const user = ref<User | null>(null);
const state = ref<'loading' | 'ready' | 'offline'>('loading');

const sections = [
  { id: 'dashboard', label: 'Обзор', icon: 'i-lucide-chart-column', page: DashboardPage },
  { id: 'scenarios', label: 'Сценарии', icon: 'i-lucide-library', page: ScenariosPage },
  { id: 'attempts', label: 'Ответы студентов', icon: 'i-lucide-users', page: AttemptsPage },
  { id: 'reports', label: 'Отчёты', icon: 'i-lucide-file-spreadsheet', page: ReportsPage },
  { id: 'account', label: 'Аккаунт', icon: 'i-lucide-user-cog', page: AccountPage },
];

const current = computed(() => sections.find((item) => item.id === route.params.section) ?? sections[0]);
const go = (id: string) => router.push(`/admin/${id}`);

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
  <div class="min-h-dvh bg-default text-default">
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

    <template v-else>
      <header class="sticky top-0 border-b border-default bg-default/95 backdrop-blur">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span class="font-semibold">ТЗ Практикум · преподаватель</span>
          <nav class="flex flex-1 flex-wrap gap-1" aria-label="Разделы панели">
            <UButton
              v-for="item in sections"
              :key="item.id"
              :icon="item.icon"
              :label="item.label"
              :color="current.id === item.id ? 'primary' : 'neutral'"
              :variant="current.id === item.id ? 'soft' : 'ghost'"
              size="sm"
              :data-testid="`nav-${item.id}`"
              @click="go(item.id)"
            />
          </nav>
          <span class="text-sm text-muted">{{ user.username }}</span>
          <UButton label="К тренажёру" color="neutral" variant="ghost" size="sm" icon="i-lucide-arrow-left" to="#/" />
          <UButton label="Выйти" color="neutral" variant="outline" size="sm" icon="i-lucide-log-out" data-testid="admin-logout" @click="logout" />
        </div>
      </header>
      <main class="mx-auto max-w-7xl p-4 sm:p-6">
        <component :is="current.page" :key="current.id" :me="user" />
      </main>
    </template>
  </div>
</template>
