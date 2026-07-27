import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Use the Cloudflare Workers pool for all tests
    pool: 'workers',
    poolOptions: {
      workers: {
        // Point to the test wrangler config
        wranglerConfigPath: path.resolve(__dirname, 'wrangler.test.toml'),
        // Use the 'test' environment from wrangler.test.toml
        miniflareOptions: {
          // Logs from miniflare (underlying workerd)
          verbose: false,
        },
      },
    },
    // Include test files
    include: ['tests/**/*.test.ts'],
    // Exclude node_modules and build artifacts
    exclude: ['node_modules', 'dist', 'dist-worker'],
  },
});
