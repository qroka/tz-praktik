<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ru } from '@nuxt/ui/locale';
import { useSession } from './composables/useSession';
import { useTheme } from './composables/useTheme';
import WelcomeScreen from './components/onboarding/WelcomeScreen.vue';
import WorkspaceShell from './components/layout/WorkspaceShell.vue';

const AdminApp = defineAsyncComponent(() => import('./admin/AdminApp.vue'));
const route = useRoute();
const isAdmin = computed(() => route.path.startsWith('/admin'));
const { attempt, notice } = useSession();
const toast = useToast();
useTheme().install();

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
  <UApp :locale="ru" :toaster="{ position: 'bottom-center', ui: { viewport: 'bottom-32' } }">
    <AdminApp v-if="isAdmin" />
    <WorkspaceShell v-else-if="attempt" />
    <WelcomeScreen v-else />
  </UApp>
</template>
