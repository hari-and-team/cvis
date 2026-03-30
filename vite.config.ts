import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devHttpsEnabled = process.env.VITE_DEV_HTTPS === 'true';
  const backendProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    process.env.VITE_API_PROXY_TARGET ||
    (devHttpsEnabled ? 'https://127.0.0.1:3001' : 'http://127.0.0.1:3001');
  const httpsOptions =
    devHttpsEnabled && process.env.VITE_DEV_HTTPS_KEY_FILE && process.env.VITE_DEV_HTTPS_CERT_FILE
      ? {
          key: readFileSync(process.env.VITE_DEV_HTTPS_KEY_FILE),
          cert: readFileSync(process.env.VITE_DEV_HTTPS_CERT_FILE)
        }
      : undefined;

  return {
    plugins: [sveltekit()],
    optimizeDeps: {
      esbuildOptions: {
        sourcemap: false
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      https: httpsOptions,
      strictPort: env.VITE_STRICT_PORT === 'true',
      watch: {
        usePolling: env.CHOKIDAR_USEPOLLING === 'true'
      },
      proxy: {
        '/api': {
          target: backendProxyTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
