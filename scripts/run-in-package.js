const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

function printUsageAndExit() {
  console.error('Usage: pnpm run pkg -- <package-dir> <script-name|npm|pnpm> [args...]');
  console.error('\nExamples:');
  console.error('  # Run the "test" npm script inside packages/usfm-parser');
  console.error('  pnpm run pkg -- usfm-parser test');
  console.error('\n  # Run an explicit command (e.g., pnpm build) inside packages/usj-core');
  console.error('  pnpm run pkg -- usj-core pnpm run build');
  process.exit(1);
}

const [, , pkgDir, cmdOrScript, ...args] = process.argv;

if (!pkgDir || !cmdOrScript) {
  printUsageAndExit();
}

// Resolve absolute path to the requested package directory inside "packages"
const pkgPath = path.join(__dirname, '..', 'packages', pkgDir);

if (!existsSync(pkgPath)) {
  console.error(`Error: The directory "packages/${pkgDir}" does not exist.`);
  process.exit(1);
}

// Determine whether the caller provided an explicit binary (npm/pnpm/yarn) or just a script name.
const knownRunners = new Set(['npm', 'pnpm', 'yarn']);

let command;
let commandArgs;

if (knownRunners.has(cmdOrScript)) {
  // The user explicitly passed a runner (e.g. npm test => cmdOrScript === "npm")
  command = cmdOrScript;
  commandArgs = args;
} else {
  // Assume the argument is an npm script name. Use npm run <script>
  command = 'npm';
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
