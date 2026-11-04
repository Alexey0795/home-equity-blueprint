import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительные пути: сайт работает и на GitHub Pages (/home-equity-blueprint/), и локально.
  base: './',
  // Приложение локальное, размер бандла (в основном Recharts) не критичен.
  // Две страницы: калькулятор и справка (ставки и курсы НБРБ) — её удобно держать в соседней вкладке.
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: { main: 'index.html', reference: 'reference.html' } },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
