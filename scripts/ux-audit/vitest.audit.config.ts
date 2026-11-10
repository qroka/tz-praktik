// Отдельная конфигурация, чтобы анализ аудита не попадал в обычный прогон тестов.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['scripts/ux-audit/**/*.audit.ts'], environment: 'node' },
});
