<script setup lang="ts">
// Код для входа: по умолчанию скрыт (его могут увидеть через плечо), по глазу показывается, через полминуты скрывается снова.
// Копировать можно и скрытым.
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ code: string; testid?: string; align?: 'start' | 'end' }>();
const emit = defineEmits<{ copy: [] }>();

const AUTO_HIDE_MS = 30_000;
const visible = ref(false);
let timer = 0;

function toggle() {
  visible.value = !visible.value;
  window.clearTimeout(timer);
  if (visible.value) timer = window.setTimeout(() => (visible.value = false), AUTO_HIDE_MS);
}

onBeforeUnmount(() => window.clearTimeout(timer));

// Длина маски не зависит от кода: скрытое не выдаёт ничего о значении.
const MASK = '••••••••••••••••';
</script>

<template>
  <span class="inline-flex items-center gap-1" :class="align === 'end' ? 'justify-end' : ''">
    <span class="font-semibold break-words" :class="{ 'tracking-widest text-muted select-none': !visible }" :data-testid="testid" :data-visible="visible">{{ visible ? props.code : MASK }}</span>
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
      :aria-label="visible ? 'Скрыть код' : 'Показать код'"
      :aria-pressed="visible"
      :title="visible ? 'Скрыть код' : 'Показать код'"
      :data-testid="testid ? `${testid}-eye` : undefined"
      @click="toggle"
    />
    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-copy" aria-label="Скопировать код" title="Скопировать код" :data-testid="testid ? `${testid}-copy` : undefined" @click="emit('copy')" />
  </span>
</template>
