import type { RenderOptions } from './types';

/**
 * Optional env override when callers omit `fontFamily` (same precedence as explicit opts).
 */
export function withResolvedBodyFont(opts: RenderOptions): RenderOptions {
  const fontFamily =
    opts.fontFamily ?? (process.env.PTXPRINT_BODY_FONT?.trim() || undefined);
  return { ...opts, fontFamily };
}
