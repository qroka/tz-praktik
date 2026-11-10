import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';

export type Layout = 'wide' | 'medium' | 'compact';

/** wide — три колонки; medium — навигация и центр; compact — одна колонка. */
export function useLayout() {
  const wide = useMediaQuery('(min-width: 1280px)');
  const medium = useMediaQuery('(min-width: 860px)');
  const layout = computed<Layout>(() => (wide.value ? 'wide' : medium.value ? 'medium' : 'compact'));
  return { layout };
}

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
