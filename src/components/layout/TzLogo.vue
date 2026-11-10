<script setup lang="ts">
// Знак «ТЗ Практикум»: диалог (пузырь) с текстом задания и галочкой. Основной цвет берётся из темы.
defineProps<{ label?: string }>();
</script>

<template>
  <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'">
    <rect width="32" height="32" rx="7" fill="var(--ui-primary)" />
    <path d="M9 7h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H15l-5.5 4.2V22H9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z" fill="#fff" />
    <path d="M10.5 12.2h11M10.5 16h4.5" fill="none" stroke="var(--ui-primary)" stroke-width="1.9" stroke-linecap="round" />
    <path d="M17.2 16.4l1.9 1.9 3.6-4" fill="none" stroke="var(--ui-primary)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
