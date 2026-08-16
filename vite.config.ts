import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import electron from 'vite-plugin-electron/simple';
import { builtinModules } from 'node:module';

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

// The Electron plugin is only active for `ELECTRON=1 vite` (dev:desktop / build:desktop) so that
// the plain web build and vitest are unaffected.
const electronPlugins = process.env.ELECTRON
  ? [
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              minify: false,
              sourcemap: false,
              // hono / @hono/node-server / jose get bundled into main.js; electron-updater stays external (in dependencies)
              rollupOptions: { external: ['electron', 'electron-updater', ...nodeBuiltins] },
            },
          },
        },
        preload: {
          input: 'electron/preload.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              minify: false,
              rollupOptions: { external: ['electron', ...nodeBuiltins], output: { format: 'cjs', entryFileNames: '[name].cjs', inlineDynamicImports: true } },
            },
          },
        },
      }),
    ]
  : [];

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), ...electronPlugins],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query';
          if (/[\\/]node_modules[\\/]music-metadata/.test(id)) return undefined; // lazy chunk
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test-setup.ts'],
  },
});
