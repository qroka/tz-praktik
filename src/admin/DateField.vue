<script setup lang="ts">
// Выбор даты на Nuxt UI: кнопка открывает календарь. Значение — строка ГГГГ-ММ-ДД или пустая строка.
import { computed, ref } from 'vue';
import { CalendarDate, DateFormatter, getLocalTimeZone } from '@internationalized/date';

const props = defineProps<{ placeholder: string; label: string }>();
const model = defineModel<string>({ required: true });
const open = ref(false);

const formatter = new DateFormatter('ru-RU', { dateStyle: 'short' });

const date = computed<CalendarDate | undefined>({
  get() {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(model.value);
    return match ? new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) : undefined;
  },
  set(value) {
    model.value = value ? `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` : '';
    open.value = false;
  },
});
const text = computed(() => (date.value ? formatter.format(date.value.toDate(getLocalTimeZone())) : props.placeholder));
</script>

<template>
  <div class="relative">
    <UPopover v-model:open="open">
      <UButton color="neutral" variant="outline" icon="i-lucide-calendar" :label="text" :aria-label="label" class="w-full justify-start" :class="date ? 'pe-9' : 'text-muted'" />
      <template #content>
        <UCalendar v-model="date" class="p-2" />
      </template>
    </UPopover>
    <UTooltip v-if="date" text="Сбросить дату"><UButton color="neutral" variant="ghost" size="xs" square icon="i-lucide-x" :aria-label="`Сбросить: ${label}`" class="absolute end-1.5 top-1/2 -translate-y-1/2" @click="model = ''" /></UTooltip>
  </div>
</template>
