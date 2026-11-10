<script setup lang="ts">
import { computed } from 'vue';
import type { NavigationMenuItem, TabsItem } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';
import type { Screen } from '../../types';

const props = defineProps<{ compact: boolean }>();
const { attempt, summary, go } = useSession();

const screen = computed<Screen>(() => attempt.value?.screen ?? 'dialog');

type Entry = { id: Screen; label: string; short: string; icon: string; count?: number };
const entries = computed<Entry[]>(() => {
  const finished = Boolean(attempt.value?.result);
  const list: Entry[] = [
    { id: 'dialog', label: 'Диалог', short: 'Диалог', icon: 'i-lucide-message-circle', count: summary.value?.questions },
    { id: 'registry', label: 'Реестр требований', short: 'Реестр', icon: 'i-lucide-clipboard-list', count: summary.value?.requirements },
  ];
  if (!finished) list.push({ id: 'tz', label: 'Редактор ТЗ', short: 'ТЗ', icon: 'i-lucide-file-pen-line' });
  list.push({ id: 'progress', label: 'Мой прогресс', short: 'Прогресс', icon: 'i-lucide-chart-no-axes-column' });
  if (finished) list.push({ id: 'result', label: 'Результат', short: 'Итог', icon: 'i-lucide-award' });
  return list;
});

const menu = computed<NavigationMenuItem[]>(() =>
  entries.value.map((entry) => ({
    label: entry.label,
    icon: entry.icon,
    active: screen.value === entry.id,
    badge: entry.count ? String(entry.count).padStart(2, '0') : undefined,
    onSelect: () => go(entry.id),
  })),
);

const tabs = computed<TabsItem[]>(() => entries.value.map((entry) => ({ label: entry.short, icon: entry.icon, value: entry.id })));
const tabValue = computed({
  get: () => screen.value as string,
  set: (value: string) => go(value as Screen),
});
</script>

<template>
  <UTabs
    v-if="props.compact"
    v-model="tabValue"
    :items="tabs"
    :content="false"
    color="primary"
    variant="pill"
    size="md"
    class="no-print w-full"
    :ui="{ list: 'bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-1', trigger: 'min-h-11 flex-1 gap-1 px-1 text-[13px]' }"
    aria-label="Рабочее пространство"
  />
  <nav v-else class="panel no-print flex min-h-0 flex-col gap-4 p-4" aria-label="Рабочее пространство">
    <p class="section-label px-2 pt-1">Рабочее пространство</p>
    <UNavigationMenu
      :items="menu"
      orientation="vertical"
      color="primary"
      highlight-color="primary"
      :ui="{
        link: 'min-h-11 rounded-xl px-3 text-[15px] data-[active]:bg-[var(--surface-active)] data-[active]:text-primary',
        linkLeadingIcon: 'size-5',
      }"
    />
    <div v-if="summary && !attempt?.finishedAt" class="panel mt-auto space-y-2 bg-[var(--app-bg)] p-4">
      <p class="font-semibold">До следующего этапа</p>
      <p class="text-sm text-muted">
        {{ summary.remaining > 0 ? `Осталось изучить ${summary.remaining} ${summary.remaining === 1 ? 'тему' : summary.remaining < 5 ? 'темы' : 'тем'}` : 'Все темы затронуты, переходите к ТЗ' }}
      </p>
      <UProgress :model-value="summary.coveragePercent" size="sm" aria-label="Охват направлений" />
    </div>
  </nav>
</template>
