import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';

/** The relay as a Door43 app deploys it: sign-in required, one host, one origin, small messages, small rooms. */
export default defineWorkersProject({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    fileParallelism: false,
    include: ['tests/door43-auth.test.ts'],
    poolOptions: {
      workers: {
        // Each test opens rooms of its own; isolated storage fails on Windows (EBUSY on the SQLite files).
        isolatedStorage: false,
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            RUN_RELAY_POOL_TESTS: process.env.RUN_RELAY_POOL_TESTS ?? '',
            AUTH_MODE: 'door43',
            ALLOWED_HOSTS: 'door43.test',
            ALLOWED_ORIGINS: 'https://taller.test',
            MAX_MESSAGE_BYTES: '4096',
            MAX_PEERS: '2',
          },
        },
      },
    },
  },
});
