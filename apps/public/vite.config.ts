import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    cors: false,
  },
  plugins: [
    react(),
    cloudflare({
      persistState: {
        path:
          mode === 'concurrent' ? '../../.wrangler/state/public-shell' : '../../.wrangler/state',
      },
    }),
  ],
}));
