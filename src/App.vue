<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ru } from '@nuxt/ui/locale';
import { useMediaQuery } from '@vueuse/core';
import { useSession } from './composables/useSession';
import { useStudent } from './composables/useStudent';
import { useTheme } from './composables/useTheme';
import { desiredPath, effectiveScreen, screenOfPath } from './state/screens';
import WelcomeScreen from './components/onboarding/WelcomeScreen.vue';
import CabinetScreen from './components/student/CabinetScreen.vue';
import StudentAuthScreen from './components/student/StudentAuthScreen.vue';
import WorkspaceShell from './components/layout/WorkspaceShell.vue';

const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'));
const route = useRoute();
const router = useRouter();
const isAdmin = computed(() => route.path.startsWith('/admin'));
const { attempt, notice, serverEnabled, go } = useSession();
const { student, newCode } = useStudent();
const toast = useToast();
useTheme().install();

// Планшет и десктоп: уведомления сверху. Телефон: снизу, над полем ввода, чтобы их было видно при открытом чате.
const isPhone = useMediaQuery('(max-width: 767px)');
const toaster = computed(() =>
  isPhone.value
    ? { position: 'bottom-center' as const, ui: { viewport: 'bottom-32' } }
    : { position: 'top-center' as const },
);

// Адрес и раздел связаны: /dialog, /registry, /tz, /progress, /result, личный кабинет — /cabinet, вход — /.
// Смена раздела меняет адрес (кнопка «Назад» работает), переход по ссылке или «Назад» открывает раздел попытки.
// Адрес, который не подходит текущему состоянию (нет попытки, не вошли), заменяется подходящим.
const routerReady = ref(false);
void router.isReady().then(() => (routerReady.value = true));
const wanted = computed(() => desiredPath({ attempt: attempt.value, serverEnabled: serverEnabled.value, signedIn: student.value !== null }));
const managed = computed(() => routerReady.value && !isAdmin.value);

/** Адрес → приложение: ссылка на раздел открывает его; адрес, не подходящий состоянию, заменяется подходящим. */
function followRoute() {
  if (!managed.value) return;
  const section = screenOfPath(route.path);
  if (attempt.value && section && section !== effectiveScreen(attempt.value)) go(section);
  if (route.path !== wanted.value) void router.replace(wanted.value);
}
/** Приложение → адрес: смена раздела или состояния записывается в историю, «Назад» вернёт на прежний. */
function followState() {
  if (managed.value && route.path !== wanted.value) void router.push(wanted.value);
}
watch(managed, (on) => on && followRoute(), { immediate: true });
watch(wanted, followState, { flush: 'post' });
// «Назад», «Вперёд» и ввод адреса.
watch(() => route.path, followRoute, { flush: 'post' });

// Уведомления о реальных событиях: открыто направление, ошибка сохранения, загрузка файла.
watch(notice, (value) => {
  if (!value) return;
  toast.add({
    title: value.title,
    description: value.description,
    color: value.kind === 'error' ? 'error' : value.kind === 'success' ? 'success' : 'info',
    icon: value.kind === 'error' ? 'i-lucide-circle-alert' : value.kind === 'success' ? 'i-lucide-circle-check' : 'i-lucide-info',
    duration: value.kind === 'error' ? 8000 : 4000,
  });
}, { immediate: true });
</script>

<template>
  <UApp :locale="ru" :toaster="toaster">
    <AdminApp v-if="isAdmin" />
    <!-- С сервером: вход по коду или регистрация, личный кабинет, затем попытка. Без сервера: имя и локальное хранение. -->
    <template v-else-if="serverEnabled">
      <StudentAuthScreen v-if="!student || newCode" />
      <WorkspaceShell v-else-if="attempt" />
      <CabinetScreen v-else />
    </template>
    <WorkspaceShell v-else-if="attempt" />
    <WelcomeScreen v-else />
  </UApp>
</template>
