import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // jsdom interaction tests; vitest.config.ts excludes the same pattern.
    include: ['tests/frontend/**/*.interaction.test.ts'],
  },
})
