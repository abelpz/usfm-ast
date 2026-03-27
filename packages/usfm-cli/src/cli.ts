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
  program.name('usfm').description('USFM command-line tools');

  program
    .command('parse')
    .description('Parse USFM and print USJ JSON to stdout')
    .argument('[file]', 'USFM file, or "-" for stdin')
    .option('-s, --stdin', 'read USFM from stdin (same as file "-")')
    .action((file: string | undefined, opts: { stdin?: boolean }) => {
      const text = readUsfmInput(file, Boolean(opts.stdin));
      const parser = new USFMParser();
      parser.parse(text);
      const logs = parser.getLogs();
      process.stdout.write(`${JSON.stringify(parser.toJSON(), null, 2)}\n`);
      if (logs.some((l) => l.type === 'error')) {
        process.exitCode = 1;
      }
    });

  program.parse(argv);
}

runCli(process.argv);
