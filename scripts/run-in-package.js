const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

function printUsageAndExit() {
  console.error('Usage: bun run do -- <package-dir> <script-name|npm|pnpm|bun|yarn> [args...]');
  console.error('\nExamples:');
  console.error('  # Run the "test" script inside packages/usfm-parser');
  console.error('  bun run do -- usfm-parser test');
  console.error('\n  # Run an explicit command inside packages/usj-core');
  console.error('  bun run do -- usj-core bun run build');
  process.exit(1);
}

const [, , pkgDir, cmdOrScript, ...args] = process.argv;

if (!pkgDir || !cmdOrScript) {
  printUsageAndExit();
}

const pkgPath = path.join(__dirname, '..', 'packages', pkgDir);

if (!existsSync(pkgPath)) {
  console.error(`Error: The directory "packages/${pkgDir}" does not exist.`);
  process.exit(1);
}

const knownRunners = new Set(['npm', 'pnpm', 'yarn', 'bun']);

let command;
let commandArgs;

if (knownRunners.has(cmdOrScript)) {
  command = cmdOrScript;
  commandArgs = args;
} else {
  command = 'bun';
  commandArgs = ['run', cmdOrScript, ...args];
}

const child = spawn(command, commandArgs, {
  cwd: pkgPath,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
