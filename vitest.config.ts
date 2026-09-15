import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Real, permanent test infrastructure (2026-09-14, Piece 0/1/2 of the
// Journal-export architecture work) -- this repo had zero test framework
// before tonight. Mirrors FenAfrica's own proven vitest setup exactly
// (same version, same reasoning: native TS/ESM support, near-zero config,
// this app is already 100% ESM) rather than inventing a different
// convention for a sibling codebase.
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's own "@/*" -> "./*" mapping -- Next.js
    // resolves this automatically for the real app; vitest doesn't read
    // tsconfig paths on its own, and every real route here imports via
    // '@/lib/...'.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    // Real network calls against the real staging/disposable database
    // (Piece 1/2's smoke tests) need real time, not mock-speed defaults.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
