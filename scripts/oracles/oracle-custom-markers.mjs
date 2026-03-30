/**
 * Optional per-fixture `customMarkers` for {@link USFMParser} in oracle scripts.
 *
 * File: `scripts/oracles/fixture-custom-markers.json` (override path with `ORACLE_CUSTOM_MARKERS_JSON`).
 * Keys: repo-relative path with forward slashes, or basename only (e.g. `my.usfm`).
 * Values: same shape as `USFMParser` constructor `customMarkers` (see `USFMMarkerInfo`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function normalizeRel(p) {
  return p.replace(/\\/g, '/');
}

/**
 * @param {string} absUsfmPath
 * @param {string} repoRoot
 * @returns {Record<string, object> | undefined}
 */
export function loadOracleCustomMarkers(absUsfmPath, repoRoot) {
  const mapPath = process.env.ORACLE_CUSTOM_MARKERS_JSON
    ? resolve(process.env.ORACLE_CUSTOM_MARKERS_JSON)
    : resolve(repoRoot, 'scripts/oracles/fixture-custom-markers.json');
  if (!existsSync(mapPath)) return undefined;
  let map;
  try {
    map = JSON.parse(readFileSync(mapPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (!map || typeof map !== 'object') return undefined;

  const abs = resolve(absUsfmPath);
  const root = resolve(repoRoot);
  let rel = normalizeRel(abs);
  if (abs.startsWith(root)) {
    rel = normalizeRel(abs.slice(root.length).replace(/^[/\\]/, ''));
  }
  const base = rel.split('/').pop() || rel;

  const markers = map[rel] || map[base];
  if (!markers || typeof markers !== 'object') return undefined;
  return markers;
}
