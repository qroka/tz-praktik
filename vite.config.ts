/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';

// base: путь GitHub Pages https://qroka.github.io/tz-praktik/. Маршрутизация — hash-история,
// поэтому статическому хостингу не нужен серверный fallback.
export default defineConfig({
  base: '/tz-praktik/',
  plugins: [
    vue(),
    ui({
      colorMode: false,
      ui: { colors: { primary: 'emerald', neutral: 'slate' } },
    }),
  ],
  // В разработке запросы к API уходят на локальный сервер (npm run server).
  server: { host: '127.0.0.1', port: 5173, strictPort: false, proxy: { '/api': 'http://127.0.0.1:3000' } },
  preview: { host: '127.0.0.1' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    globals: false,
  },
});
