import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
         define: {
         'process.env.NODE_ENV': JSON.stringify(mode),
         'global': 'globalThis',
       },
  optimizeDeps: {
    exclude: ['canvas', 'jsdom', 'pdfjs-dist', 'rollup'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      external: ['canvas', 'jsdom', 'pdfjs-dist', 'rollup'],
    },
  },
  esbuild: {
    target: 'esnext',
  },
}));
