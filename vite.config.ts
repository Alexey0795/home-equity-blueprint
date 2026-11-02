import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительные пути: сайт работает и на GitHub Pages (/home-equity-blueprint/), и локально.
  base: './',
  // Приложение локальное, размер бандла (в основном Recharts) не критичен.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
