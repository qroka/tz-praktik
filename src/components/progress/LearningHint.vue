<script setup lang="ts">
import { useSession } from '../../composables/useSession';

const { hint } = useSession();
</script>

<template>
  <aside v-if="hint" class="shrink-0 rounded-2xl bg-[var(--surface-active)] p-4" aria-live="polite" data-testid="hint">
    <p class="flex items-center gap-2 text-sm font-semibold text-primary">
      <UIcon name="i-lucide-sparkles" class="size-4" aria-hidden="true" />Подсказка: {{ hint.title }}
    </p>
    <p class="mt-1.5 text-sm text-toned">{{ hint.text }}</p>
  </aside>
</template>
