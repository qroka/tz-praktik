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

const FAVICON_PATH = 'M7 3h18a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H16l-7 5.5V25H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z';

function updateFavicon() {
  const color = primaryColor();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><mask id="m"><rect width="32" height="32" fill="#fff"/>` +
    `<path d="M10.5 12.2h11M10.5 16h4.5" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round"/>` +
    `<path d="M17.2 16.4l1.9 1.9 3.6-4" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>` +
    `<path mask="url(#m)" d="${FAVICON_PATH}" fill="${color}"/></svg>`;
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
