<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ru } from '@nuxt/ui/locale';
import { useMediaQuery } from '@vueuse/core';
import { useSession } from './composables/useSession';
import { useTheme } from './composables/useTheme';
import { normalizeCode } from './shared/resumeCode';
import WelcomeScreen from './components/onboarding/WelcomeScreen.vue';
import WorkspaceShell from './components/layout/WorkspaceShell.vue';

const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'));
const route = useRoute();
const router = useRouter();
const isAdmin = computed(() => route.path.startsWith('/admin'));
const { attempt, notice, resume } = useSession();
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
// Ссылка для продолжения (#/continue/<код>): открывает попытку на этом устройстве.
// На общем компьютере чужая незавершённая попытка заменяется: её копия лежит на сервере и открывается по её коду.
watch(
  () => (route.path.startsWith('/continue') ? route.params.code : undefined),
  async (code) => {
    if (typeof code !== 'string' || !code) return;
    const known = normalizeCode(code);
    if (!known || known !== attempt.value?.resumeCode) {
      const result = await resume(code);
      if (!result.ok) toast.add({ title: 'Попытка не открыта', description: result.error, color: 'error', icon: 'i-lucide-circle-alert', duration: 8000 });
    }
    void router.replace('/');
  },
  { immediate: true },
);
</script>

<template>
  <UApp :locale="ru" :toaster="toaster">
    <AdminApp v-if="isAdmin" />
    <WorkspaceShell v-else-if="attempt" />
    <WelcomeScreen v-else />
  </UApp>
</template>
