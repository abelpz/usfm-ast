import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runPoolTests = process.env.RUN_RELAY_POOL_TESTS === '1';
// The Door43 sign-in tests need the relay deployed with other variables, so they run under a config of their own.
const configs = runPoolTests ? ['vitest.config.ts', 'vitest.auth.config.ts'] : ['vitest.protocol.config.ts'];

for (const config of configs) {
  const result = spawnSync('bunx', ['vitest', 'run', '--config', config], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
