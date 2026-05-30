import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runPoolTests = process.env.RUN_RELAY_POOL_TESTS === '1';
const args = runPoolTests
  ? ['vitest', 'run', '--config', 'vitest.config.ts']
  : ['vitest', 'run', '--config', 'vitest.protocol.config.ts'];

const result = spawnSync('bunx', args, {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
