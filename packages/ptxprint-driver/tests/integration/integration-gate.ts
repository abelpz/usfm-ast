import { existsSync } from 'fs';

/**
 * Run slow integration tests only when explicitly requested or when PTXPRINT_BIN
 * points at an existing executable (local dev convenience).
 */
export function shouldRunPtxIntegration(): boolean {
  if (process.env.PTXPRINT_INTEGRATION === '1') return true;
  const bin = process.env.PTXPRINT_BIN?.trim();
  if (bin && existsSync(bin)) return true;
  return false;
}
