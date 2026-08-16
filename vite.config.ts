/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // node:sqlite 是 Node 22 的实验性内置模块，Vite 5 的 builtin 列表不认识。
      // 仅在测试里给 server/db.js 提供该模块的虚拟加载实现。
      name: 'node-sqlite-test-loader',
      resolveId(id) {
        if (id === 'node:sqlite' || id === 'sqlite') return 'node:sqlite'
        return null
      },
      load(id) {
        if (id === 'node:sqlite') {
          return [
            'const sqlite = process.getBuiltinModule("node:sqlite")',
            'if (!sqlite) throw new Error("node:sqlite is not available")',
            'export const DatabaseSync = sqlite.DatabaseSync',
          ].join('\n')
        }
        return null
      },
    },
  ],
  build: {
    // WorkBuddy safe-delete shim 拦截 rmSync 导致 vite 无法清空 outDir，
    // 关闭自动清空以让 build 通过；旧哈希文件会残留（index.html 始终引用最新文件）。
    // 如需彻底干净 dist，手动用资源管理器删除 dist 目录后再 build。
    emptyOutDir: false,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    css: false,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'server/**/*.{test,spec}.{js,mjs,cjs}',
    ],
    // Windows + WorkBuddy safe-delete shim 会在 fork 子进程时 DLL 初始化失败
    // (STATUS_DLL_INIT_FAILED 0xC0000142)。用 threads 池（worker 线程共享进程，
    // 不 fork 新进程）规避；多线程每文件独立 DOM 避免累积。
    pool: 'threads',
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      'nd.ivyreverie.dpdns.org',
      '.dpdns.org',
    ],
    port: 5173,
    // DreamMusic: 代理 NeteaseCloudMusicApiEnhanced @ localhost:3000，绕过 CORS。
    // /api/search → http://localhost:3000/search
    proxy: {
      // DreamMusic 中间层（账户/会话/白名单转发）@ localhost:3001
      // /dreammusic/api/v1/search → middleware → api-enhanced(3000)/search
      '/dreammusic/api/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
