import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { validateUsjStructure } from '@usj-tools/core';

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

  program
    .command('validate')
    .description('Parse JSON and validate USJ structure (root USJ + typed nodes)')
    .argument('[file]', 'JSON file, or "-" for stdin')
    .option('-s, --stdin', 'read JSON from stdin')
    .option('-q, --quiet', 'no message on success')
    .action((file: string | undefined, opts: { stdin?: boolean; quiet?: boolean }) => {
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
      const result = validateUsjStructure(parsed);
      if (!result.ok) {
        for (const err of result.errors) {
          process.stderr.write(`${err}\n`);
        }
        process.exitCode = 1;
        return;
      }
      if (!opts.quiet) {
        process.stderr.write('OK: USJ structure looks valid.\n');
      }
    });

  program.parse(argv);
}

runCli(process.argv);
