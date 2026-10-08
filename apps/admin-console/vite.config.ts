import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
function normalizeViteBase(p: string | undefined): string {
  if (!p || p === '/') return '/';
  if (p.includes('Program Files')) {
    throw new Error('MSYS2 path corruption detected on BASE_PATH: ' + p + '. Use PowerShell to build.');
  }
  return p.replace(/\/$/, '') + '/';
}

const API_PROXY_TARGET = process.env.VITE_API_PROXY_URL || 'http://localhost:11080';

function buildProxyConfig(): Record<string, any> {
  const proxy: Record<string, any> = {};

  // Pass-through: all service-prefixed paths and bare /api/v1/* go to gateway directly.
  // Gateway handles longest-prefix match routing to the correct upstream service.
  // This matches production behavior exactly (nginx → gateway → upstream).
  const passThroughPrefixes = [
    '/api/v1/',
    '/identity/',
    '/tenant/',
    '/audit/',
    '/billing/api/v1/billing/',
    '/compliance/api/v1/compliance/',
    '/storage/api/v1/storage/',
    '/wallet/api/v1/wallet/',
    '/session/',
    '/mfa/api/v1/mfa/',
    '/notification/',
    '/communication/api/v1/communication/',
    '/point/',
    '/profile/api/v1/profile/',
    '/status/api/v1/status/',
    '/oauth/api/v1/oauth/',
    '/.well-known/',
    '/bff',
    '/developer',
  ];

  for (const prefix of passThroughPrefixes) {
    proxy[prefix] = {
      target: API_PROXY_TARGET,
      changeOrigin: true,
    };
  }

  return proxy;
}

export default defineConfig({
  plugins: [react()],
  base: normalizeViteBase(process.env.BASE_PATH),
  resolve: {
    extensions: ['.mjs', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: {'@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 13102,
    proxy: buildProxyConfig(),
  },
  preview: {
    port: 13102,
    proxy: buildProxyConfig(),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 分块策略必须与其余 portal 一致（ui 仓 check-consistency 的 C6 守着）。
        // 此前这里没有给 antd 分块，1.3MB 的 antd 因此混进了入口块：
        // 实测入口 2,698KB / gzip 739KB，而 platform / security 只 224–282KB——
        // 同一套代码、同一个产品，首屏差了一个量级，而且业务代码每改一次
        // 用户就要把整个 antd 重下一遍。
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-ui': ['antd', 'lucide-react'],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'shared-api': ['@autional/shared'],
        },
      },
    },
  },
});
