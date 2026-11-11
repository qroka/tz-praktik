<script setup lang="ts">
// Выбор оформления: цветовая тема (меню со значком выбранной темы) и отдельная кнопка «светлая / тёмная».
// Используется в шапке лендинга и в личном кабинете студента.
import { computed } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useTheme } from '../../composables/useTheme';
import { themeAccent, type TzThemePreset } from '../../theme/themes';

const { isDark, toggleMode, presets, preset, selectPreset } = useTheme();

const chipStyle = (p: TzThemePreset) => ({ color: themeAccent(p), background: `color-mix(in oklab, ${themeAccent(p)} 20%, transparent)` });
const presetOf = (item: unknown) => presets.find((p) => p.id === (item as { presetId?: string }).presetId) ?? presets[0]!;
const keep = (event: Event) => event.preventDefault();

// Меню цветовой темы: только готовые темы. Светлая и тёмная переключаются отдельной кнопкой рядом.
const themeItems = computed<DropdownMenuItem[]>(() =>
  presets.map((p) => ({
    label: p.name,
    slot: 'preset',
    presetId: p.id,
    type: 'checkbox' as const,
    class: 'font-semibold',
    checked: preset.value.id === p.id,
    onUpdateChecked(checked: boolean) {
      if (checked) selectPreset(p.id);
    },
    onSelect: keep,
  })),
);
</script>

<template>
  <div class="flex items-center gap-2">
    <UDropdownMenu :items="themeItems" :content="{ align: 'end' }" :ui="{ content: 'w-48 z-50' }">
      <UTooltip :text="`Цветовая тема: ${preset.name}`" :ui="{ content: 'z-50' }">
        <UButton color="neutral" variant="ghost" square aria-label="Выбрать цветовую тему" class="data-[state=open]:bg-elevated" data-testid="landing-theme">
          <UIcon :name="preset.icon" class="size-5 shrink-0" :style="{ color: themeAccent(preset) }" />
        </UButton>
      </UTooltip>
      <template #preset-leading="{ item }">
        <span class="flex size-5 shrink-0 items-center justify-center rounded-full" :style="chipStyle(presetOf(item))">
          <UIcon :name="presetOf(item).icon" class="size-2.5" />
        </span>
      </template>
    </UDropdownMenu>
    <UTooltip :text="isDark ? 'Светлая тема' : 'Тёмная тема'" :ui="{ content: 'z-50' }">
      <UButton color="neutral" variant="ghost" square :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleMode" />
    </UTooltip>
  </div>
</template>
