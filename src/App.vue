<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ru } from '@nuxt/ui/locale';
import { useMediaQuery } from '@vueuse/core';
import { useSession } from './composables/useSession';
import { useStudent } from './composables/useStudent';
import { useTheme } from './composables/useTheme';
import WelcomeScreen from './components/onboarding/WelcomeScreen.vue';
import CabinetScreen from './components/student/CabinetScreen.vue';
import StudentAuthScreen from './components/student/StudentAuthScreen.vue';
import WorkspaceShell from './components/layout/WorkspaceShell.vue';

const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'));
const route = useRoute();
const isAdmin = computed(() => route.path.startsWith('/admin'));
const { attempt, notice, serverEnabled } = useSession();
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
