<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSession } from '../../composables/useSession';
import { useStudent } from '../../composables/useStudent';
import type { HistoryItem } from '../../api/student';
import TzLogo from '../layout/TzLogo.vue';
import SecretCode from './SecretCode.vue';

const { copyText } = useSession();
const { student, history, historyState, historyError, variants, variantsState, refreshVariants, refreshHistory, logout, startNew, open } = useStudent();

const busy = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(refreshHistory);

const date = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Незавершённая попытка, к которой стоит вернуться: самая свежая. */
const unfinished = computed(() => history.value.find((item) => !item.finishedAt) ?? null);

async function run(id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
  if (busy.value) return;
  busy.value = id;
  error.value = null;
  try {
    const result = await action();
    if (!result.ok) error.value = result.error;
  } finally {
    busy.value = null;
  }
}

const begin = (id: string) => run(`variant-${id}`, () => startNew(id));
const openItem = (item: HistoryItem) => run(item.key, () => open(item));

async function exit() {
  busy.value = 'logout';
  try {
    await logout();
  } finally {
    busy.value = null;
  }
}

const statusOf = (item: HistoryItem) => (item.finishedAt ? { label: 'Завершена', color: 'success' as const } : { label: 'В процессе', color: 'warning' as const });
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-4 py-8 sm:px-6" data-testid="cabinet">
    <header class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <TzLogo class="size-9 text-primary" />
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Личный кабинет</h1>
          <p class="text-sm text-muted">ТЗ Практикум</p>
        </div>
      </div>
      <UButton color="neutral" variant="outline" icon="i-lucide-log-out" label="Выйти" :loading="busy === 'logout'" data-testid="cabinet-logout" @click="exit" />
    </header>

    <UCard v-if="student" :ui="{ body: 'grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6' }">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold" data-testid="cabinet-name">{{ student.fullName }}</h2>
        <p class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UBadge v-if="student.group" :label="`Группа ${student.group}`" color="neutral" variant="subtle" icon="i-lucide-users" data-testid="cabinet-group" />
          <span v-else>Группа не указана: сообщите преподавателю</span>
        </p>
      </div>
      <div class="space-y-1 sm:text-right">
        <p class="text-xs font-semibold tracking-wide text-dimmed uppercase">Код для входа</p>
        <SecretCode :code="student.code" testid="cabinet-code" align="end" @copy="copyText(student.code, 'Код скопирован')" />
      </div>
    </UCard>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" data-testid="cabinet-error" />

    <div v-if="unfinished">
      <UCard v-if="unfinished" :ui="{ body: 'space-y-3 p-5' }" class="border-primary/40" data-testid="continue-card">
        <div class="flex items-center gap-2"><UIcon name="i-lucide-play-circle" class="size-5 text-primary" /><h2 class="font-semibold">Продолжить попытку</h2></div>
        <p class="text-sm text-muted">{{ unfinished.scenarioTitle ?? 'Учебный сценарий' }}. Начата {{ date(unfinished.startedAt) }}, вопросов: {{ unfinished.questions }}.</p>
        <UButton icon="i-lucide-arrow-right" trailing label="Продолжить" :loading="busy === unfinished.key" data-testid="continue-button" @click="openItem(unfinished)" />
      </UCard>

    </div>

    <section class="space-y-3" aria-labelledby="variants-title" data-testid="variants">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="variants-title" class="text-lg font-semibold">{{ history.length ? 'Начать ещё раз' : 'Выберите вариант' }}</h2>
          <p class="text-sm text-muted">Перед началом выберите вариант: у каждого свой заказчик и объект. Попытка сохраняется автоматически, к ней можно вернуться позже.</p>
        </div>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" label="Обновить список" :loading="variantsState === 'loading'" @click="refreshVariants" />
      </div>
      <UAlert v-if="variantsState === 'error'" color="error" variant="subtle" icon="i-lucide-circle-alert" description="Не удалось загрузить список вариантов. Проверьте соединение и обновите." />
      <UEmpty v-else-if="!variants.length && variantsState !== 'loading'" icon="i-lucide-hourglass" title="Вариантов пока нет" description="Преподаватель ещё не выложил ни одного варианта. Загляните позже." data-testid="variants-empty" />
      <div v-else class="grid gap-3 md:grid-cols-2">
        <UCard v-for="item in variants" :key="item.id" :ui="{ body: 'flex h-full flex-col gap-3 p-5' }" :data-testid="`variant-${item.id}`">
          <div class="flex items-center gap-2">
            <UBadge color="primary" variant="subtle" :label="`Вариант ${item.variant}`" />
            <UBadge v-if="item.minutes" color="neutral" variant="subtle" icon="i-lucide-clock" :label="`≈${item.minutes} мин`" />
          </div>
          <h3 class="font-semibold">{{ item.title }}</h3>
          <p v-if="item.brief" class="line-clamp-4 text-sm text-muted">{{ item.brief }}</p>
          <UButton class="mt-auto justify-center" :color="unfinished ? 'neutral' : 'primary'" :variant="unfinished ? 'outline' : 'solid'" icon="i-lucide-play" :label="`Начать вариант ${item.variant}`" :loading="busy === `variant-${item.id}`" :data-testid="`variant-start-${item.id}`" @click="begin(item.id)" />
        </UCard>
      </div>
    </section>

    <UCard :ui="{ body: 'space-y-3 p-5' }">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">История попыток</h2>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" label="Обновить" :loading="historyState === 'loading'" @click="refreshHistory" />
      </div>
      <UAlert v-if="historyState === 'error'" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="historyError" />
      <p v-else-if="!history.length && historyState !== 'loading'" class="py-4 text-center text-sm text-muted" data-testid="history-empty">Попыток пока нет. Начните первую: она появится здесь.</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-sm" data-testid="history">
          <thead class="text-muted">
            <tr><th class="py-1 pr-3 font-medium">Начало</th><th class="pr-3 font-medium">Сценарий</th><th class="pr-3 font-medium">Вопросов</th><th class="pr-3 font-medium">Результат</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="item in history" :key="item.key" class="border-t border-default" :data-testid="`history-${item.key}`">
              <td class="py-2 pr-3 whitespace-nowrap">{{ date(item.startedAt) }}</td>
              <td class="pr-3">{{ item.scenarioTitle ?? '—' }}</td>
              <td class="pr-3 tabular-nums">{{ item.questions }}</td>
              <td class="pr-3">
                <UBadge :label="item.finishedAt && item.score !== null ? `${item.score} из 100 · ${item.grade}` : statusOf(item).label" :color="statusOf(item).color" variant="subtle" />
              </td>
              <td class="py-1 text-right">
                <UButton size="xs" color="neutral" variant="outline" :label="item.finishedAt ? 'Открыть результат' : 'Продолжить'" :loading="busy === item.key" @click="openItem(item)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </main>
</template>
