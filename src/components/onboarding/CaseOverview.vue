<script setup lang="ts">
import type { Scenario } from '../../types';

defineProps<{ scenario: Scenario }>();

const steps = [
  { icon: 'i-lucide-messages-square', title: 'Спросить', text: 'Выясняйте процесс, оборудование, режимы и аварии.' },
  { icon: 'i-lucide-clipboard-list', title: 'Зафиксировать', text: 'Сохраняйте проверяемые сведения в реестре.' },
  { icon: 'i-lucide-file-text', title: 'Составить ТЗ', text: 'Заполните 13 разделов своими словами.' },
];
</script>

<template>
  <div class="space-y-5">
    <UCard :ui="{ body: 'space-y-3 p-5' }" aria-label="Учебный кейс">
      <h2 class="text-xl font-semibold">{{ scenario.title }}</h2>
      <p class="text-toned">{{ scenario.subtitle }}</p>
      <p class="text-sm text-muted">{{ scenario.publicBrief }}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <UBadge color="neutral" variant="subtle" icon="i-lucide-hard-hat" label="Вы: инженер по автоматизации" />
        <UBadge color="neutral" variant="subtle" icon="i-lucide-user-round" :label="`Заказчик: ${scenario.customer.role}`" />
        <UBadge color="neutral" variant="subtle" icon="i-lucide-clock" :label="`≈${scenario.estimatedMinutes} минут`" />
        <UBadge color="neutral" variant="subtle" icon="i-lucide-compass" :label="`${scenario.categories.length} тем для исследования`" />
      </div>
    </UCard>
    <ol class="grid gap-3 sm:grid-cols-3" aria-label="Порядок работы">
      <li v-for="(step, index) in steps" :key="step.title" class="rounded-lg border border-default bg-default flex gap-3 p-4">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <UIcon :name="step.icon" class="size-5" />
        </span>
        <span>
          <span class="block font-semibold">{{ index + 1 }}. {{ step.title }}</span>
          <span class="block text-sm text-muted">{{ step.text }}</span>
        </span>
      </li>
    </ol>
  </div>
</template>
