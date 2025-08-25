import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
    // Force Rollup to use JS fallback instead of native binaries
    'process.env.ROLLUP_DISABLE_NATIVE': JSON.stringify('1'),
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
  // Force esbuild for all operations
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'js') {
        return { js: `/${filename}` }
      } else {
        return { css: `/${filename}` }
      }
    }
  }
}));
