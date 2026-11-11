<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../api/client';
import { dateTime } from './format';

const props = defineProps<{ me: { id: number; username: string } }>();
type AdminUser = { id: number; username: string; createdAt: string; lastLoginAt: string | null };

const toast = useToast();
const users = ref<AdminUser[]>([]);
const passwords = ref({ current: '', next: '', repeat: '' });
const newUser = ref({ username: '', password: '' });
const error = ref('');

const fail = (e: unknown) => (error.value = e instanceof Error ? e.message : String(e));
const ok = (title: string) => toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });

async function load() {
  try {
    users.value = (await adminApi.get<{ items: AdminUser[] }>('/admin/users')).items;
  } catch (e) {
    fail(e);
  }
}
onMounted(load);

async function changePassword() {
  error.value = '';
  if (passwords.value.next !== passwords.value.repeat) return (error.value = 'Новые пароли не совпадают.');
  try {
    await adminApi.post('/auth/password', { current: passwords.value.current, next: passwords.value.next });
    passwords.value = { current: '', next: '', repeat: '' };
    ok('Пароль изменён, остальные сессии закрыты');
  } catch (e) {
    fail(e);
  }
}

async function addUser() {
  error.value = '';
  try {
    await adminApi.post('/admin/users', newUser.value);
    newUser.value = { username: '', password: '' };
    ok('Администратор добавлен');
    await load();
  } catch (e) {
    fail(e);
  }
}

async function removeUser(user: AdminUser) {
  error.value = '';
  try {
    await adminApi.del(`/admin/users/${user.id}`);
    ok('Администратор удалён');
    await load();
  } catch (e) {
    fail(e);
  }
}
</script>

<template>
  <div class="space-y-6" data-testid="account">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />
    <div class="grid gap-4 lg:grid-cols-2">
      <UCard :ui="{ body: 'space-y-4 p-5' }">
        <h2 class="font-semibold">Сменить пароль ({{ props.me.username }})</h2>
        <form class="space-y-3" @submit.prevent="changePassword">
          <UFormField label="Текущий пароль"><UInput v-model="passwords.current" type="password" class="w-full" autocomplete="current-password" /></UFormField>
          <UFormField label="Новый пароль" hint="не короче 8 символов"><UInput v-model="passwords.next" type="password" class="w-full" autocomplete="new-password" /></UFormField>
          <UFormField label="Повторите новый пароль"><UInput v-model="passwords.repeat" type="password" class="w-full" autocomplete="new-password" /></UFormField>
          <UButton type="submit" label="Сменить пароль" :disabled="!passwords.current || !passwords.next" />
        </form>
      </UCard>
      <UCard :ui="{ body: 'space-y-4 p-5' }">
        <h2 class="font-semibold">Администраторы</h2>
        <table class="w-full text-left text-sm">
          <thead class="text-muted"><tr><th class="py-1 font-medium">Логин</th><th class="font-medium">Последний вход</th><th /></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-t border-default">
              <td class="py-1.5">{{ u.username }}<span v-if="u.id === props.me.id" class="text-muted"> (вы)</span></td>
              <td class="text-muted">{{ dateTime(u.lastLoginAt) }}</td>
              <td class="text-right"><UButton v-if="u.id !== props.me.id" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="`Удалить ${u.username}`" @click="removeUser(u)" /></td>
            </tr>
          </tbody>
        </table>
        <form class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="addUser">
          <UInput v-model="newUser.username" placeholder="Логин" aria-label="Логин нового администратора" autocomplete="off" />
          <UInput v-model="newUser.password" type="password" placeholder="Пароль (от 8 символов)" aria-label="Пароль нового администратора" autocomplete="new-password" />
          <UButton type="submit" icon="i-lucide-user-plus" label="Добавить" :disabled="!newUser.username || !newUser.password" />
        </form>
      </UCard>
    </div>
  </div>
</template>
