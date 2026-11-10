<script setup lang="ts">
import { formatTime } from '../../composables/useLayout';
import { useSession } from '../../composables/useSession';

// Реальный статус автосохранения: показывается рядом с блоком прогресса.
const { save } = useSession();
</script>

<template>
  <span v-if="save.state === 'error'" class="flex items-center gap-1.5 text-xs text-error" role="status" data-testid="save-state">
    <UIcon name="i-lucide-cloud-off" class="size-4" />Не удалось сохранить
  </span>
  <span v-else-if="save.state === 'saving'" class="flex items-center gap-1.5 text-xs text-muted" data-testid="save-state">
    <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />Сохранение…
  </span>
  <span v-else-if="save.state === 'saved' && save.at" class="flex items-center gap-1.5 text-xs text-muted" data-testid="save-state">
    <UIcon name="i-lucide-check" class="size-4 text-primary" />Сохранено {{ formatTime(save.at) }}
  </span>
</template>
