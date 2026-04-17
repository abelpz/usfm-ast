import type { FontAdapter, FontRegisterOptions, ShapedGlyph } from '../interfaces/font-adapter';

/**
 * Web font adapter — injects `@font-face` rules via the CSS Font Loading API.
 * Graphite shaping is not supported in the browser; `isGraphiteSupported()`
 * always returns `false`.
 */
export class WebFontAdapter implements FontAdapter {
  isGraphiteSupported(): boolean {
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
    // FontFaceSet.add() exists in all modern browsers; cast for older TS lib types.
    (document.fonts as FontFaceSet & { add(face: FontFace): void }).add(face);
  }

  shapeText(_text: string, _fontName: string, _fontSize: number): Promise<ShapedGlyph[]> {
    throw new Error('Graphite shaping is not supported on web.');
  }
}
