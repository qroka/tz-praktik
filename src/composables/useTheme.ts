// Внешний вид: готовая тема (палитры, радиус, токены) и режим светлый / тёмный.
// Хранится в localStorage; все цвета берутся из токенов Nuxt UI, своих стилей нет.
import { computed, nextTick, watch, watchEffect } from 'vue';
import { useColorMode, useStorage, useStyleTag } from '@vueuse/core';
import { BASE_COLORS, THEME_PRESETS, themeCss } from '../theme/themes';

const themeId = useStorage<string>('tz-praktikum:theme', THEME_PRESETS[0]!.id);
const mode = useColorMode({ storageKey: 'tz-praktikum:color-mode', initialValue: 'dark', modes: { light: '', dark: 'dark' } });

/** Текущий основной цвет в виде, который понимает SVG (читается из вычисленных стилей). */
function primaryColor(): string {
  const probe = document.createElement('span');
  probe.style.color = 'var(--ui-primary)';
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

// Та же иконка, что в TzLogo (Lucide bot-message-square), в основном цвете темы.
const FAVICON_PATHS =
  '<path d="M12 6V2H8"/><path d="M15 11v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M9 11v2"/>';

function updateFavicon() {
  const color = primaryColor();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FAVICON_PATHS}</svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
    // Фавикон красится основным цветом темы и меняется вместе с ней и с режимом.
    watch([preset, isDark], async () => {
      await nextTick();
      window.setTimeout(updateFavicon, 60);
    }, { immediate: true });
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
