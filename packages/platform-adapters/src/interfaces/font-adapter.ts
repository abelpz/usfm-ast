/**
 * Font management and Graphite smart-font rendering.
 *
 * On the web and in Capacitor, `isGraphiteSupported()` returns `false` — the
 * app falls back to OpenType shaping via the OS or browser.
 *
 * On Tauri desktop, Graphite support can be enabled either through a graphite2
 * WASM module or (future) HarfBuzz+Graphite sidecar.
 */
export interface FontAdapter {
  /**
   * Register a font so it is available to the editor.
   * On web: injects a `@font-face` rule via CSS.
   * On Tauri: also registers the font with the Graphite shaper when available.
   */
  registerFont(name: string, data: ArrayBuffer, options?: FontRegisterOptions): Promise<void>;

  /** True when the Graphite rendering path is active for this platform. */
  isGraphiteSupported(): boolean;

  /**
   * Shape a text run with Graphite and return positioned glyphs.
   * Only available when `isGraphiteSupported()` is true; throws otherwise.
   */
  shapeText?(text: string, fontName: string, fontSize: number): Promise<ShapedGlyph[]>;
}

export interface FontRegisterOptions {
  /** CSS font-weight value, e.g. 400 | 700. Defaults to 400. */
  weight?: number;
  /** CSS font-style, e.g. "normal" | "italic". Defaults to "normal". */
  style?: string;
}

/** A positioned glyph returned by Graphite shaping. */
export interface ShapedGlyph {
  glyphId: number;
  x: number;
  y: number;
  advanceX: number;
  advanceY: number;
}
