/**
 * Tauri font adapter with optional Graphite smart-font support.
 *
 * ## Strategy
 *
 * Many fonts used in Bible translation (Padauk, Charis SIL, Scheherazade New,
 * Lateef, Awami Nastaliq, etc.) are published as both Graphite and OpenType
 * fonts. The OpenType path works inside Chromium/WKWebView with zero extra
 * tooling.
 *
 * For fonts that **require** Graphite shaping (those that have complex features
 * only accessible through Graphite rules, not OpenType GSUB/GPOS equivalents),
 * we will integrate the `graphite2` C library compiled to WebAssembly in a
 * future iteration. The interface already supports `shapeText()` for this path.
 *
 * ## Current implementation
 *
 * - `registerFont`: injects a `@font-face` rule via CSS Font Loading API (same
 *   as web, works in Tauri WebView).
 * - `isGraphiteSupported()`: returns `false` until the WASM shaper is integrated.
 * - `shapeText()`: throws (Graphite not yet available).
 *
 * When the WASM Graphite shaper is added, `isGraphiteSupported()` will return
 * `true` and `shapeText()` will delegate to the WASM module.
 */
import type { FontAdapter, FontRegisterOptions, ShapedGlyph } from '../interfaces/font-adapter';

export class TauriFontAdapter implements FontAdapter {
  isGraphiteSupported(): boolean {
    // TODO: return true when graphite2-wasm module is bundled and loaded.
    return false;
  }

  async registerFont(
    name: string,
    data: ArrayBuffer,
    options: FontRegisterOptions = {},
  ): Promise<void> {
    const { weight = 400, style = 'normal' } = options;
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);

    const face = new FontFace(name, `url(${url})`, {
      weight: String(weight),
      style,
    });

    await face.load();
    (document.fonts as FontFaceSet & { add(face: FontFace): void }).add(face);
  }

  shapeText(_text: string, _fontName: string, _fontSize: number): Promise<ShapedGlyph[]> {
    // TODO: delegate to graphite2-wasm when integrated.
    throw new Error(
      'TauriFontAdapter: Graphite shaping is not yet implemented. ' +
        'Register fonts with OpenType tables as a fallback.',
    );
  }
}
