<script setup lang="ts">
import { ref } from 'vue';
import { adminApi } from '../api/client';

const emit = defineEmits<{ login: [user: { id: number; username: string }] }>();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    const { user } = await adminApi.post<{ user: { id: number; username: string } }>('/auth/login', { username: username.value, password: password.value });
    password.value = '';
    emit('login', user);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось войти.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-sm" :ui="{ body: 'space-y-4 p-6' }">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">Панель преподавателя</h1>
        <p class="text-sm text-muted">Вход для администратора тренажёра.</p>
      </div>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Логин">
          <UInput v-model="username" class="w-full" autocomplete="username" autofocus data-testid="admin-login" />
        </UFormField>
        <UFormField label="Пароль">
          <UInput v-model="password" type="password" class="w-full" autocomplete="current-password" data-testid="admin-password" />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />
        <UButton type="submit" block :loading="busy" :disabled="!username || !password" label="Войти" data-testid="admin-submit" />
      </form>
      <a href="#/" class="block text-center text-sm text-muted hover:underline">К тренажёру</a>
    </UCard>
  </div>
</template>
