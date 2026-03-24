import { defineConfig, loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [sveltekit()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: env.VITE_STRICT_PORT === 'true',
      watch: {
        usePolling: env.CHOKIDAR_USEPOLLING === 'true'
      },
      proxy: {
        '/api': {
          target: backendProxyTarget
        }
      }
    }
  };
});
