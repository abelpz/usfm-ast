import { spawnSync } from 'node:child_process';

const [task, ...extraArgs] = process.argv.slice(2);

if (!task) {
  console.error('Usage: node scripts/turbo-run.mjs <task> [turbo args...]');
  process.exit(1);
}

const hasConcurrencyArg = extraArgs.some((arg) => arg === '--concurrency' || arg.startsWith('--concurrency='));
const args = ['run', task, ...extraArgs];

// Windows file locking can make parallel builds/tests race over generated dist files.
// Keep Linux/macOS CI fast, but serialize local Windows runs for stability.
if (process.platform === 'win32' && !hasConcurrencyArg) {
  args.push('--concurrency=1');
}

const result = spawnSync('turbo', args, {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
