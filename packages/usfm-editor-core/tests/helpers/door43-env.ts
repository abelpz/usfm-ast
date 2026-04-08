/**
 * Load `.env.door43` from repo root or package root into `process.env` (does not override existing).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Call from Jest setup: loads first existing path only (repo root preferred). */
export function loadDoor43EnvFile(): void {
  const candidates = [
    join(__dirname, '../../../../.env.door43'),
    join(__dirname, '../../../.env.door43'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    const parsed = parseEnvFile(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
    return;
  }
}

export interface Door43TestConfig {
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  usfmPath: string;
  journalPath: string;
}

export function getDoor43Config(): Door43TestConfig | null {
  const token = process.env.DOOR43_TOKEN?.trim();
  const owner = process.env.DOOR43_OWNER?.trim();
  const repo = process.env.DOOR43_REPO?.trim();
  if (!token || !owner || !repo) return null;
  return {
    baseUrl: (process.env.DOOR43_DCS_BASE_URL ?? 'https://git.door43.org').replace(/\/$/, ''),
    token,
    owner,
    repo,
    branch: process.env.DOOR43_BRANCH?.trim() || 'main',
    usfmPath: process.env.DOOR43_USFM_PATH?.trim() || '',
    journalPath: process.env.DOOR43_JOURNAL_PATH?.trim() || 'usfm-ast/integration-test-journal.json',
  };
}

export function shouldRunDoor43ReadTests(): boolean {
  return (
    process.env.DOOR43_INTEGRATION === '1' &&
    !!getDoor43Config()
  );
}

export function shouldRunDoor43WriteTests(): boolean {
  return (
    shouldRunDoor43ReadTests() &&
    process.env.DOOR43_ALLOW_WRITE === '1'
  );
}
