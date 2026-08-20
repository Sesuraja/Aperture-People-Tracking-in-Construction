import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/.mongo_runtime.json',
          '**/.git/**',
          '**/dist/**',
          '**/node_modules/**',
          '**/.system_generated/**',
          '**/*.log',
          '**/.env*',
          '**/*.tmp',
          '**/scratch/**',
          '**/logs/**',
        ],
      },
    },
  };
});
