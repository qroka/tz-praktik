// Внешний вид: готовая тема (палитры, радиус, токены) и режим светлый / тёмный.
// Хранится в localStorage; все цвета берутся из токенов Nuxt UI, своих стилей нет.
import { computed, watchEffect } from 'vue';
import { useColorMode, useStorage, useStyleTag } from '@vueuse/core';
import { BASE_COLORS, THEME_PRESETS, themeCss } from '../theme/themes';

const themeId = useStorage<string>('tz-praktikum:theme', THEME_PRESETS[0]!.id);
const mode = useColorMode({ storageKey: 'tz-praktikum:color-mode', initialValue: 'dark', modes: { light: '', dark: 'dark' } });

export function useTheme() {
  const preset = computed(() => THEME_PRESETS.find((item) => item.id === themeId.value) ?? THEME_PRESETS[0]!);
  const css = computed(() => themeCss(preset.value));
  const isDark = computed(() => mode.state.value === 'dark');
  /** Выбор пользователя: светлая, тёмная или как в системе. */
  const preference = computed(() => mode.store.value);

  /** Вызывается один раз в корне приложения. */
  function install() {
    const appConfig = useAppConfig();
    useStyleTag(css, { id: 'tz-theme' });
    watchEffect(() => {
      Object.assign(appConfig.ui.colors, BASE_COLORS, preset.value.colors);
    });
  }

  return {
    presets: THEME_PRESETS,
    preset,
    isDark,
    preference,
    install,
    selectPreset: (id: string) => (themeId.value = id),
    setMode: (value: 'light' | 'dark' | 'auto') => (mode.value = value),
    toggleMode: () => (mode.value = isDark.value ? 'light' : 'dark'),
  };
}
