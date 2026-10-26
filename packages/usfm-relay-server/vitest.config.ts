import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersProject({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    fileParallelism: false,
    exclude: ['tests/door43-auth.test.ts', 'node_modules/**'],
    poolOptions: {
      workers: {
        // Each test opens rooms of its own; isolated storage fails on Windows (EBUSY on the SQLite files).
        isolatedStorage: false,
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { RUN_RELAY_POOL_TESTS: process.env.RUN_RELAY_POOL_TESTS ?? '' } },
      },
    },
  },
});
