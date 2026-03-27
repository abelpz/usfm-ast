import { readFileSync } from 'node:fs';
import { Command } from 'commander';

function readJsonInput(file: string | undefined, useStdin: boolean): string {
  if (useStdin || !file || file === '-') {
    return readFileSync(0, 'utf-8');
  }
  return readFileSync(file, 'utf-8');
}

export function runCli(argv: string[]): void {
  const program = new Command();
  program.name('usj').description('USJ JSON utilities');

  program
    .command('pretty')
    .description('Parse JSON and pretty-print (validates it is JSON)')
    .argument('[file]', 'JSON file, or "-" for stdin')
    .option('-s, --stdin', 'read JSON from stdin')
    .action((file: string | undefined, opts: { stdin?: boolean }) => {
      const raw = readJsonInput(file, Boolean(opts.stdin));
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`Invalid JSON: ${msg}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
    });

  program.parse(argv);
}

runCli(process.argv);
