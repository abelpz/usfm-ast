import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { USFMParser } from '@usfm-tools/parser';

function readUsfmInput(file: string | undefined, useStdin: boolean): string {
  if (useStdin || !file || file === '-') {
    return readFileSync(0, 'utf-8');
  }
  return readFileSync(file, 'utf-8');
}

export function runCli(argv: string[]): void {
  const program = new Command();
  program.name('usfm-validate').description('Validate USFM using the canonical parser');

  program
    .command('validate')
    .description('Parse USFM and report parser warnings/errors')
    .argument('[file]', 'USFM file, or "-" for stdin')
    .option('-s, --stdin', 'read USFM from stdin')
    .option('-q, --quiet', 'only print logs, not success line')
    .action((file: string | undefined, opts: { stdin?: boolean; quiet?: boolean }) => {
      const text = readUsfmInput(file, Boolean(opts.stdin));
      const parser = new USFMParser();
      parser.parse(text);
      const logs = parser.getLogs();
      for (const log of logs) {
        process.stderr.write(`[${log.type}] ${log.message}\n`);
      }
      if (!opts.quiet && logs.length === 0) {
        process.stderr.write('OK: no parser warnings or errors.\n');
      }
      if (logs.some((l) => l.type === 'error')) {
        process.exitCode = 1;
      }
    });

  program.parse(argv);
}

runCli(process.argv);
