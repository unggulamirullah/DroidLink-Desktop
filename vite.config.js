
import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,

  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,

    // Vite hanya perlu memantau frontend.
    // Folder Rust dikelola oleh Tauri CLI.
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'safari13',
  },
});
