import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently serving on 5174: the API proxy, the README
    // and the docs all name 5173, so a moved port looks exactly like a dead server.
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/docs': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
