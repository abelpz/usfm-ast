/**
 * Shared helpers for YamlKeyDiffView and JsonKeyDiffView.
 * Extracted to avoid duplication between the two table-based renderers.
 */

export type PlainObj = Record<string, unknown>;

export function isPlainObj(v: unknown): v is PlainObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function canonical(v: unknown): string {
  return JSON.stringify(v) ?? '';
}

export interface KeyRow {
  dotPath: string;
  baseVal: unknown;
  oursVal: unknown;
  theirsVal: unknown;
  oursChanged: boolean;
  theirsChanged: boolean;
  conflict: boolean;
}

/**
 * Recursively collect changed key rows from three plain objects.
 * Rows where all three sides agree are omitted.
 * Recurses into nested plain objects; uses `{}` as base fallback when base lacks a key.
 */
export function collectRows(
  base: PlainObj,
  ours: PlainObj,
  theirs: PlainObj,
  prefix = '',
): KeyRow[] {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const rows: KeyRow[] = [];
  for (const key of allKeys) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    const bVal = base[key];
    const oVal = ours[key];
    const tVal = theirs[key];
    // Recurse into nested objects; use {} as base fallback when base lacks this key
    if (isPlainObj(oVal) && isPlainObj(tVal)) {
      const bFallback = isPlainObj(bVal) ? bVal : {};
      rows.push(...collectRows(bFallback, oVal, tVal, dotPath));
    } else {
      const bCan = canonical(bVal);
      const oCan = canonical(oVal);
      const tCan = canonical(tVal);
      if (oCan === tCan && oCan === bCan) continue; // all agree, skip
      rows.push({
        dotPath,
        baseVal: bVal,
        oursVal: oVal,
        theirsVal: tVal,
        oursChanged: oCan !== bCan,
        theirsChanged: tCan !== bCan,
        conflict: oCan !== tCan && oCan !== bCan && tCan !== bCan,
      });
    }
  }
  return rows;
}

/**
 * Format a value for compact display in a table cell.
 * Prevents overflow by truncating long strings and summarising collections.
 */
export function formatVal(v: unknown): string {
  if (v === undefined || v === null) return '(absent)';
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((x) => typeof x === 'string')) {
      const joined = (v as string[]).join(', ');
      return joined.length > 80 ? joined.slice(0, 80) + '…' : joined;
    }
    return `[${v.length} item${v.length !== 1 ? 's' : ''}]`;
  }
  // Plain object: summarise key count to prevent overflow
  const keys = Object.keys(v as object);
  if (keys.length === 0) return '{}';
  return `{${keys.length} key${keys.length !== 1 ? 's' : ''}}`;
}
