import { execFileSync, execSync } from 'child_process';
import { existsSync } from 'fs';

import { PtxprintNotFoundError } from '../errors';

function tryExecWhich(cmd: string): string | undefined {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', ['ptxprint'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const line = out.split(/\r?\n/).filter(Boolean)[0];
      return line && existsSync(line) ? line : undefined;
    }
    const out = execSync(`command -v ${cmd}`, {
      encoding: 'utf8',
      shell: '/bin/sh',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

const KNOWN_PATHS: string[] = [];
if (process.platform === 'win32') {
  KNOWN_PATHS.push(
    'C:\\Program Files\\PTXprint\\ptxprint.exe',
    'C:\\Program Files (x86)\\PTXprint\\ptxprint.exe',
  );
} else if (process.platform === 'darwin') {
  KNOWN_PATHS.push('/Applications/PTXprint.app/Contents/MacOS/ptxprint');
} else {
  KNOWN_PATHS.push('/usr/bin/ptxprint');
}

/** Locate `ptxprint` executable (PTXprint CLI). */
export function findPtxprint(opts?: { explicitPath?: string }): string {
  const fromOpt = opts?.explicitPath?.trim();
  if (fromOpt && existsSync(fromOpt)) return fromOpt;

  const fromEnv = process.env.PTXPRINT_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const whichPath = tryExecWhich('ptxprint');
  if (whichPath && existsSync(whichPath)) return whichPath;

  for (const p of KNOWN_PATHS) {
    if (existsSync(p)) return p;
  }

  throw new PtxprintNotFoundError();
}
