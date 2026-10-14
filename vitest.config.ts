import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    // Run the whole suite in an Australian timezone (UTC+10/+11) to prove the date handling
    // never shifts a day.
    globalSetup: ['./vitest.global-setup.ts'],
  },
})
