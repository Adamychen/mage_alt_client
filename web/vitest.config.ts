import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'fixtures/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/net/Gateway.ts',
        'src/net/commands.ts',
        'src/board/gameToScene.ts',
        'src/board/zones.ts',
        'src/cards/cardImages.ts',
        'src/game/feedback.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/__fixtures__/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
      },
    },
  },
})
