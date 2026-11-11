<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { FormError } from '@nuxt/ui';
import { studentApi } from '../../api/student';
import { useSession } from '../../composables/useSession';
import { useStudent } from '../../composables/useStudent';
import CaseOverview from '../onboarding/CaseOverview.vue';
import TzLogo from '../layout/TzLogo.vue';

const { scenario, copyText } = useSession();
const { register, login, newCode, dismissNewCode, expiredNotice } = useStudent();

const mode = ref<'login' | 'register'>('login');
const busy = ref(false);
const error = ref<string | null>(null);
const groups = ref<string[]>([]);

const loginState = reactive({ code: '' });
const registerState = reactive({ fullName: '', group: '' });

onMounted(async () => {
  try {
    groups.value = (await studentApi.groups()).groups;
  } catch {
    // Подсказки по группам необязательны.
  }
});

const validateRegister = (value: { fullName: string; group: string }): FormError[] => {
  const errors: FormError[] = [];
  if (value.fullName.trim().split(/\s+/).filter(Boolean).length < 2) errors.push({ name: 'fullName', message: 'Укажите фамилию и имя полностью.' });
  if (!value.group.trim()) errors.push({ name: 'group', message: 'Укажите группу.' });
  return errors;
};

async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
  if (busy.value) return;
  error.value = null;
  busy.value = true;
  try {
    const result = await action();
    if (!result.ok) error.value = result.error;
  } finally {
    busy.value = false;
  }
}

const submitLogin = () => run(() => login(loginState.code));
const submitRegister = () => run(() => register(registerState.fullName, registerState.group));

function switchMode(next: 'login' | 'register') {
  mode.value = next;
  error.value = null;
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:gap-10">
    <section class="flex-1 space-y-6">
      <div class="flex items-center gap-3">
        <TzLogo class="size-11 text-primary" />
        <h1 class="text-3xl font-bold tracking-tight">ТЗ Практикум</h1>
      </div>
      <p class="max-w-xl text-base text-toned">
        Вы инженер по автоматизации. Заказчик знает об объекте всё, но отвечает только на заданный вопрос. Расспросите его, отделите
        требования от пожеланий и составьте техническое задание.
      </p>
      <CaseOverview :scenario="scenario" />
    </section>

    <UCard class="w-full lg:max-w-md" :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
      <!-- Только что зарегистрировались: код показывается один раз крупно -->
      <div v-if="newCode" class="space-y-4" data-testid="new-code">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold">Вы зарегистрированы</h2>
          <p class="text-sm text-muted">Это ваш личный код для входа. Запишите его: по нему вы войдёте с любого компьютера и найдёте свои попытки.</p>
        </div>
        <p class="rounded-lg bg-elevated px-4 py-3 text-center text-xl font-semibold break-words" data-testid="new-code-value">{{ newCode }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-copy" label="Скопировать код" @click="copyText(newCode, 'Код скопирован')" />
          <UButton class="grow" trailing-icon="i-lucide-arrow-right" label="Я записал код, продолжить" data-testid="new-code-continue" @click="dismissNewCode" />
        </div>
        <p class="text-xs text-muted">Код всегда виден в личном кабинете. Если потеряете, преподаватель выдаст новый.</p>
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-elevated/60 p-1" role="tablist" aria-label="Вход или регистрация">
          <UButton :color="mode === 'login' ? 'primary' : 'neutral'" :variant="mode === 'login' ? 'soft' : 'ghost'" label="У меня есть код" role="tab" :aria-selected="mode === 'login'" data-testid="tab-login" @click="switchMode('login')" />
          <UButton :color="mode === 'register' ? 'primary' : 'neutral'" :variant="mode === 'register' ? 'soft' : 'ghost'" label="Регистрация" role="tab" :aria-selected="mode === 'register'" data-testid="tab-register" @click="switchMode('register')" />
        </div>

        <UAlert v-if="expiredNotice" color="warning" variant="subtle" icon="i-lucide-key-round" title="Нужно войти снова" description="Сессия закончилась или преподаватель выдал вам новый код. Введите актуальный код." />

        <UForm v-if="mode === 'login'" :state="loginState" class="space-y-5" @submit="submitLogin">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold">Вход в личный кабинет</h2>
            <p class="text-sm text-muted">Введите личный код из четырёх слов, например «лиса мост река замок».</p>
          </div>
          <UFormField label="Личный код" name="code">
            <UInput v-model="loginState.code" size="xl" class="w-full" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="лиса мост река замок" data-testid="login-code" />
          </UFormField>
          <UButton type="submit" size="xl" block :loading="busy" :disabled="!loginState.code.trim()" trailing-icon="i-lucide-log-in" label="Войти" data-testid="login-submit" />
        </UForm>

        <UForm v-else :state="registerState" :validate="validateRegister" :validate-on="['blur', 'change']" class="space-y-5" @submit="submitRegister">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold">Регистрация</h2>
            <p class="text-sm text-muted">Один раз укажите ФИО и группу: вы получите личный код для входа и историю своих попыток.</p>
          </div>
          <UFormField label="ФИО" name="fullName" required>
            <UInput v-model="registerState.fullName" size="xl" class="w-full" autocomplete="name" :maxlength="120" placeholder="Например, Петрова Ирина Сергеевна" data-testid="register-name" />
          </UFormField>
          <UFormField label="Группа" name="group" required>
            <UInput v-model="registerState.group" size="xl" class="w-full" list="student-groups" autocomplete="off" :maxlength="40" placeholder="Например, ИС-21" data-testid="register-group" />
            <datalist id="student-groups"><option v-for="g in groups" :key="g" :value="g" /></datalist>
          </UFormField>
          <UButton type="submit" size="xl" block :loading="busy" trailing-icon="i-lucide-arrow-right" label="Зарегистрироваться" data-testid="register-submit" />
        </UForm>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" data-testid="auth-error" />
      </template>
    </UCard>
  </main>
</template>
