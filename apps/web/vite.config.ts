import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  return {
    plugins: [react(), tailwindcss()],
    envDir: '../..',
    build: { rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
      { name: 'validation-vendor', test: /[\\/]node_modules[\\/]zod[\\/]/ }
    ] } } } },
    server: { port: 5173, strictPort: true, proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false } } },
    preview: { port: 5173, strictPort: true, proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false } } }
  };
});
