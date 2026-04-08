import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersProject({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    fileParallelism: false,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
