/**
 * Tests for WebFontAdapter.
 *
 * `registerFont` requires browser APIs (FontFace, document.fonts,
 * URL.createObjectURL) which we mock here so the tests run in Node.
 */
import { WebFontAdapter } from '../src/web/web-font-adapter';

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

const addedFaces: { name: string; src: string; weight: string; style: string }[] = [];
let loadShouldReject = false;

class MockFontFace {
  readonly name: string;
  readonly src: string;
  readonly weight: string;
  readonly style: string;

  constructor(name: string, src: string, opts: { weight?: string; style?: string } = {}) {
    this.name = name;
    this.src = src;
    this.weight = opts.weight ?? '400';
    this.style = opts.style ?? 'normal';
  }

  async load(): Promise<this> {
    if (loadShouldReject) throw new Error('FontFace load failed');
    return this;
  }
}

const mockFonts = {
  add(face: MockFontFace) {
    addedFaces.push({
      name: face.name,
      src: face.src,
      weight: face.weight,
      style: face.style,
    });
  },
};

let blobObjectUrl = 'blob:mock-url';

beforeEach(() => {
  addedFaces.length = 0;
  loadShouldReject = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).FontFace = MockFontFace;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).document = { fonts: mockFonts };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).URL = {
    createObjectURL: (_blob: Blob) => blobObjectUrl,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Blob = class {
    constructor(public parts: unknown[]) {}
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebFontAdapter', () => {
  describe('isGraphiteSupported', () => {
    it('always returns false on web', () => {
      const adapter = new WebFontAdapter();
      expect(adapter.isGraphiteSupported()).toBe(false);
    });
  });

  describe('registerFont', () => {
    it('loads a font and adds it to document.fonts with defaults', async () => {
      const adapter = new WebFontAdapter();
      const buf = new ArrayBuffer(8);
      await adapter.registerFont('MyFont', buf);

      expect(addedFaces).toHaveLength(1);
      const face = addedFaces[0]!;
      expect(face.name).toBe('MyFont');
      expect(face.src).toContain(blobObjectUrl);
      expect(face.weight).toBe('400');
      expect(face.style).toBe('normal');
    });

    it('respects weight and style options', async () => {
      const adapter = new WebFontAdapter();
      const buf = new ArrayBuffer(8);
      await adapter.registerFont('BoldFont', buf, { weight: 700, style: 'italic' });

      expect(addedFaces).toHaveLength(1);
      const face = addedFaces[0]!;
      expect(face.weight).toBe('700');
      expect(face.style).toBe('italic');
    });

    it('throws when FontFace.load() rejects', async () => {
      loadShouldReject = true;
      const adapter = new WebFontAdapter();
      const buf = new ArrayBuffer(8);
      await expect(adapter.registerFont('FailFont', buf)).rejects.toThrow('FontFace load failed');
      expect(addedFaces).toHaveLength(0);
    });
  });

  describe('shapeText', () => {
    it('throws a "not supported" error', () => {
      const adapter = new WebFontAdapter();
      expect(() => adapter.shapeText('hello', 'MyFont', 14)).toThrow(
        'Graphite shaping is not supported on web.',
      );
    });
  });
});
