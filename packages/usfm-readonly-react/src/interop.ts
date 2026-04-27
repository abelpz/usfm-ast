/**
 * Named imports from some `@usfm-tools/*` builds resolve as CJS `exports` without
 * ESM named export metadata; Rollup then fails on `import { X }`. Resolve at runtime.
 */
export function cjsNamed<T>(ns: unknown, exportName: string): T {
  const m = ns as Record<string, unknown> & { default?: Record<string, unknown> };
  const direct = m[exportName];
  if (typeof direct !== 'undefined') return direct as T;
  const d = m.default;
  if (d && typeof d[exportName] !== 'undefined') return d[exportName] as T;
  throw new Error(`@usfm-tools: missing export "${exportName}"`);
}
