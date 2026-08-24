import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

const workersOptions = {
  main: path.resolve(__dirname, 'worker/index.ts'),
  wrangler: {
    configPath: path.resolve(__dirname, 'wrangler.test.toml'),
    environment: 'test',
  },
  miniflare: { verbose: false },
};

export default defineConfig({
  plugins: [cloudflareTest(workersOptions)],
  test: {
    globals: true,
    environment: 'node',
    // Test files share the configured in-memory bindings. Serializing files
    // prevents one suite's cleanup from racing another suite's D1/KV writes.
    fileParallelism: false,
    // cloudflareTest configures Vitest 4's Worker pool and virtual modules.
    // Include test files
    include: ['tests/**/*.test.ts'],
    // Exclude node_modules and build artifacts
    exclude: ['node_modules', 'dist', 'dist-worker'],
  },
});
