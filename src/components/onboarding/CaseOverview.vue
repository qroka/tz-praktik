<script setup lang="ts">
import { computed } from 'vue';
import type { Scenario } from '../../types';

const props = defineProps<{ scenario: Scenario }>();

const steps = computed(() => [
  { icon: 'i-lucide-messages-square', title: 'Спросить', text: 'Выясняйте процесс, оборудование, режимы и аварии.' },
  { icon: 'i-lucide-clipboard-list', title: 'Зафиксировать', text: 'Реестр требований — ваши подтверждённые сведения. Потом вы перенесёте их в ТЗ.' },
  { icon: 'i-lucide-file-text', title: 'Составить ТЗ', text: `Заполните разделов: ${props.scenario.tzSections.length}. Своими словами.` },
]);

// Три вида сведений, которые важно не путать в ТЗ.
const kinds = [
  { icon: 'i-lucide-factory', title: 'Есть сейчас', text: 'что уже стоит на объекте и как он работает' },
  { icon: 'i-lucide-target', title: 'Требует заказчик', text: 'что должно быть после автоматизации' },
  { icon: 'i-lucide-pencil-ruler', title: 'Предлагаете вы', text: 'то, что заказчик оставил на решение исполнителя' },
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
        <UBadge color="neutral" variant="subtle" icon="i-lucide-clock" :label="`Занятие ≈${scenario.estimatedMinutes} минут`" data-testid="time-badge" />
        <UBadge color="neutral" variant="subtle" icon="i-lucide-compass" :label="`${scenario.categories.length} направлений`" />
      </div>
      <p class="text-xs text-muted" data-testid="time-plan">
        Рекомендуемое распределение: около 50–60 минут — расспросить заказчика, 30–40 минут — составить ТЗ. Это ориентир, а не норматив.
      </p>
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

    <UCard :ui="{ body: 'space-y-3 p-5' }" aria-label="Как вести разговор">
      <h3 class="font-semibold">С чего начать</h3>
      <p class="text-sm text-muted" data-testid="example-question">
        Например: «Здравствуйте! Расскажите, пожалуйста, из чего состоит объект и что вы хотите автоматизировать?» Дальше спрашивайте по одной теме за раз.
      </p>
      <ul class="grid gap-2 sm:grid-cols-3" aria-label="Виды сведений">
        <li v-for="kind in kinds" :key="kind.title" class="flex gap-2 text-sm">
          <UIcon :name="kind.icon" class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span><span class="font-medium">{{ kind.title }}</span> — <span class="text-muted">{{ kind.text }}</span></span>
        </li>
      </ul>
      <p class="text-xs text-muted">Если заказчик не знает ответа, отметьте вопрос в реестре как «требует уточнения» — это тоже результат.</p>
      <details class="text-sm">
        <summary class="cursor-pointer font-medium">Направления работы</summary>
        <ul class="mt-2 grid gap-1 text-muted sm:grid-cols-2" data-testid="directions-list">
          <li v-for="category in scenario.categories" :key="category.id">{{ category.title }}</li>
        </ul>
      </details>
    </UCard>
  </div>
</template>
