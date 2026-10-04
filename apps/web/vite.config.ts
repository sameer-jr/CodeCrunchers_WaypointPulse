import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function offlineShell(): Plugin {
  return { name: 'waypoint-offline-shell', apply: 'build' as const,
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle).map(item => `/${item.fileName}`).filter(name => /\.(js|css)$/.test(name)).sort();
      const id = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 16);
      const source = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8')
        .replace("const BUILD_ID = 'development';", `const BUILD_ID = '${id}';`)
        .replace("const PRECACHE = ['/index.html', '/manifest.webmanifest', '/assets/logo-mark.png'];", `const PRECACHE = ${JSON.stringify(['/index.html', '/manifest.webmanifest', '/assets/logo-mark.png', ...assets])};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  return {
    plugins: [react(), tailwindcss(), offlineShell()],
    envDir: '../..',
    build: { rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
      { name: 'validation-vendor', test: /[\\/]node_modules[\\/]zod[\\/]/ }
    ] } } } },
    server: { port: 5173, strictPort: true, proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false } } },
    preview: { port: 5173, strictPort: true, proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false } } }
  };
});
