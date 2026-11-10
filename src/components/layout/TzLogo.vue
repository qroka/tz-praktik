<script setup lang="ts">
import { useId } from 'vue';

// Знак «ТЗ Практикум»: пузырь диалога с вырезанными строками текста задания и галочкой, без фона.
// Цвет — currentColor: белый на тёмной теме, тёмный на светлой.
defineProps<{ label?: string }>();
const id = `tz-logo-${useId()}`;
</script>

<template>
  <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="currentColor" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'">
    <defs>
      <mask :id="id">
        <rect width="32" height="32" fill="#fff" />
        <path d="M10.5 12.2h11M10.5 16h4.5" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" />
        <path d="M17.2 16.4l1.9 1.9 3.6-4" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
      </mask>
    </defs>
    <path :mask="`url(#${id})`" d="M7 3h18a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H16l-7 5.5V25H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" />
  </svg>
</template>
