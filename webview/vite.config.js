import { defineConfig } from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  plugins: [
    svelte(),
    Icons({
      compiler: 'svelte',
    })
  ],
  build: {
    outDir: '../out/svelte',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'bundle.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
