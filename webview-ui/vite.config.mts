import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

const entries = {
  commit: 'src/commit/main.tsx',
};

export default defineConfig(({ mode }) => ({
  root,
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    rolldownOptions: {
      input: Object.fromEntries(
        Object.entries(entries).map(([name, file]) => [name, `${root}/${file}`]),
      ),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
}));
