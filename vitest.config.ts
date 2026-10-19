import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// composables 테스트에서 '~/...' import 를 풀기 위한 별칭 (Nuxt 와 같은 규칙: ~ = 레포 루트)
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./', import.meta.url)) },
  },
})
