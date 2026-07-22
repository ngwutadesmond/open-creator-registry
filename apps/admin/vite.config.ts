import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  publicDir: '../../.generated/scalar-assets',
  plugins: [
    react(),
    cloudflare({
      persistState: {
        path: mode === 'concurrent' ? '../../.wrangler/state/admin-shell' : '../../.wrangler/state',
      },
    }),
  ],
}));
