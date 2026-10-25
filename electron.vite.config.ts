import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * Production CSP: everything self-hosted (fonts are bundled locally, no
 * remote origins at all). Dev adds 'unsafe-inline' to script-src because
 * @vitejs/plugin-react injects an inline fast-refresh preamble into
 * index.html; the production build keeps the strict policy verbatim.
 */
const CSP_PROD =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:";
const CSP_DEV = CSP_PROD.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");

function cspPlugin(): Plugin {
  return {
    name: 'screego-launcher:csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        return html.replaceAll('%CSP%', ctx.server ? CSP_DEV : CSP_PROD);
      },
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'dist/main' },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        output: {
          // sandboxed preload scripts cannot be ESM -> force CJS + .cjs name
          // (this package is "type": "module", so a .js file would be parsed as ESM)
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), cspPlugin()],
    build: { outDir: 'dist/renderer' },
  },
});
