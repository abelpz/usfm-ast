import { useMemo } from 'react';
import {
  loadDcsCredentials,
  loadDcsTarget,
  type DcsStoredCredentials,
  type DcsStoredTarget,
} from '@/lib/dcs-storage';

export type DcsSnapshot = {
  credentials: DcsStoredCredentials | null;
  target: DcsStoredTarget | null;
};

/**
 * Reads Door43 credentials + sync target from localStorage once per mount.
 * DCS / collaborate flows reload the page when persistence changes.
 */
export function useDcsCredentials(): DcsSnapshot {
  return useMemo(
    () => ({
      credentials: loadDcsCredentials(),
      target: loadDcsTarget(),
    }),
    [],
  );
}
