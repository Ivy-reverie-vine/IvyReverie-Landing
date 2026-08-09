/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
