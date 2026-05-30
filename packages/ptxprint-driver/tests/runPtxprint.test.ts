/**
 * Unit tests for RunPtxprintOptions → CLI args mapping.
 *
 * We don't spawn a real process here; instead we capture the args array
 * by monkey-patching `child_process.spawn` via jest.mock so we can assert
 * the exact command-line PTXprint would receive.
 */

import { join } from 'path';

// ── Mock child_process so no real process is spawned ─────────────────────────
const spawnArgs: { cmd: string; args: string[] }[] = [];

jest.mock('child_process', () => {
  const real = jest.requireActual<typeof import('child_process')>('child_process');
  return {
    ...real,
    spawn: (cmd: string, args: string[], _opts?: unknown) => {
      spawnArgs.push({ cmd, args: [...args] });
      // Return a minimal EventEmitter-like fake that immediately closes with 0.
      const { EventEmitter } = require('events');
      const proc = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: InstanceType<typeof EventEmitter>;
        stderr: InstanceType<typeof EventEmitter>;
        kill: () => void;
      };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      // Emit 'close' with code 0 on next tick
      setImmediate(() => proc.emit('close', 0));
      return proc;
    },
  };
});

// ── Also mock fs/promises readFile so we don't hit the filesystem ─────────────
jest.mock('fs/promises', () => {
  const real = jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...real,
    readFile: async (p: string, enc?: unknown) => {
      // Pretend every file that ends with ".pdf" exists and is a tiny PDF.
      if (typeof p === 'string' && p.endsWith('.pdf')) {
        return Buffer.from('%PDF-1.4 fake');
      }
      // For the xetex log file, pretend it doesn't exist.
      if (typeof p === 'string' && p.endsWith('.log')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return real.readFile(p, enc as BufferEncoding);
    },
    rm: async () => {},
  };
});

import { runPtxprint } from '../src/runner/runPtxprint';

beforeEach(() => {
  spawnArgs.length = 0;
});

const BASE = {
  bin: 'ptxprint',
  projectsRoot: '/tmp/root',
  projectId: 'PROJ',
  bookCode: 'JHN',
  configId: 'Default',
  workspaceTempDir: '/tmp/root',
};

describe('runPtxprint — args mapping', () => {
  it('builds a minimal args array with required flags only', async () => {
    await runPtxprint(BASE);
    const { args } = spawnArgs[0]!;
    expect(args).toContain('-p');
    expect(args).toContain('/tmp/root');
    expect(args).toContain('-c');
    expect(args).toContain('Default');
    expect(args).toContain('-b');
    expect(args).toContain('JHN');
    expect(args).toContain('-P');
    expect(args).toContain('PROJ');
  });

  it('passes multiple book codes as a space-separated -b argument', async () => {
    await runPtxprint({ ...BASE, bookCodes: ['JHN', 'GEN'] });
    const { args } = spawnArgs[0]!;
    const bIdx = args.indexOf('-b');
    expect(bIdx).toBeGreaterThan(-1);
    expect(args[bIdx + 1]).toBe('JHN GEN');
  });

  it('adds -f for each fontPath', async () => {
    await runPtxprint({ ...BASE, fontPaths: ['/fonts/a', '/fonts/b'] });
    const { args } = spawnArgs[0]!;
    const fIdxs = args.reduce<number[]>((acc, a, i) => (a === '-f' ? [...acc, i] : acc), []);
    expect(fIdxs).toHaveLength(2);
    expect(args[fIdxs[0]! + 1]).toBe('/fonts/a');
    expect(args[fIdxs[1]! + 1]).toBe('/fonts/b');
  });

  it('adds -V for pdfVersion', async () => {
    await runPtxprint({ ...BASE, pdfVersion: 17 });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('-V') + 1]).toBe('17');
  });

  it('adds --timeout for xetexTimeoutSec', async () => {
    await runPtxprint({ ...BASE, xetexTimeoutSec: 120 });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('--timeout') + 1]).toBe('120');
  });

  it('adds -R for xetexRuns', async () => {
    await runPtxprint({ ...BASE, xetexRuns: 2 });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('-R') + 1]).toBe('2');
  });

  it('adds -q when quiet is true', async () => {
    await runPtxprint({ ...BASE, quiet: true });
    expect(spawnArgs[0]!.args).toContain('-q');
  });

  it('does NOT add -q when quiet is false', async () => {
    await runPtxprint({ ...BASE, quiet: false });
    expect(spawnArgs[0]!.args).not.toContain('-q');
  });

  it('adds -N when noInternet is true', async () => {
    await runPtxprint({ ...BASE, noInternet: true });
    expect(spawnArgs[0]!.args).toContain('-N');
  });

  it('adds repeatable -D for ptxDefine entries', async () => {
    await runPtxprint({ ...BASE, ptxDefine: { 'Paper/pagesize': 'A5', 'Document/columns': '2' } });
    const { args } = spawnArgs[0]!;
    const dIdxs = args.reduce<number[]>((acc, a, i) => (a === '-D' ? [...acc, i] : acc), []);
    expect(dIdxs).toHaveLength(2);
    const pairs = dIdxs.map((i) => args[i + 1]);
    expect(pairs).toContain('Paper/pagesize=A5');
    expect(pairs).toContain('Document/columns=2');
  });

  it('adds --debug when debugMode is true', async () => {
    await runPtxprint({ ...BASE, debugMode: true });
    expect(spawnArgs[0]!.args).toContain('--debug');
  });

  it('adds -l for logLevel', async () => {
    await runPtxprint({ ...BASE, logLevel: 'DEBUG' });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('-l') + 1]).toBe('DEBUG');
  });

  it('adds --logfile for logFile', async () => {
    await runPtxprint({ ...BASE, logFile: '/tmp/ptxprint.log' });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('--logfile') + 1]).toBe('/tmp/ptxprint.log');
  });

  it('adds -m for macrosDir', async () => {
    await runPtxprint({ ...BASE, macrosDir: '/opt/ptx/macros' });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('-m') + 1]).toBe('/opt/ptx/macros');
  });

  it('adds -z for extras', async () => {
    await runPtxprint({ ...BASE, extras: 'v=3' });
    const { args } = spawnArgs[0]!;
    expect(args[args.indexOf('-z') + 1]).toBe('v=3');
  });

  it('omits all optional flags when not provided', async () => {
    await runPtxprint(BASE);
    const { args } = spawnArgs[0]!;
    for (const flag of ['-f', '-V', '--timeout', '-R', '-q', '-N', '-D', '--debug', '-l', '--logfile', '-m', '-z']) {
      expect(args).not.toContain(flag);
    }
  });
});
