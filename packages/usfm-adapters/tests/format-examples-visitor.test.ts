/**
 * USJ → USFM via the universal visitor, using examples under examples/usfm-markers/.
 * We assert structural presence, not byte-identical USFM to example.usfm (formatting differs).
 */

import { convertUSJDocumentToUSFM } from '../src/usfm';
import * as fs from 'fs';
import * as path from 'path';

interface FormatExample {
  id: string;
  directory: string;
  description: string;
  formats: {
    usfm: boolean;
    usx: boolean;
    usj: boolean;
  };
}

interface FormatExampleIndex {
  allExamples: FormatExample[];
}

describe('Format Examples - USJ to USFM Conversion (Visitor)', () => {
  let formatIndex: FormatExampleIndex;

  beforeAll(() => {
    const indexPath = path.join(__dirname, '../../../examples/usfm-markers/index.json');
    formatIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  });

  function loadExampleFiles(example: FormatExample) {
    const basePath = path.join(__dirname, '../../../', example.directory);
    const files = {
      usfm: null as string | null,
      usj: null as unknown | null,
    };

    const usfmPath = path.join(basePath, 'example.usfm');
    if (fs.existsSync(usfmPath)) {
      files.usfm = fs.readFileSync(usfmPath, 'utf8').trim();
    }

    const usjPath = path.join(basePath, 'example.usj');
    if (fs.existsSync(usjPath)) {
      files.usj = JSON.parse(fs.readFileSync(usjPath, 'utf8'));
    }

    return files;
  }

  function requireExample(id: string): FormatExample {
    const ex = formatIndex.allExamples.find((e) => e.id === id);
    if (!ex) {
      throw new Error(`Example ${id} not found in index`);
    }
    return ex;
  }

  describe('Character markers (word / lemma)', () => {
    test('char-w-example-1: emits book, chapter, and word marker from USJ', () => {
      const files = loadExampleFiles(requireExample('char-w-example-1'));
      if (!files.usj) throw new Error('missing USJ');
      const out = convertUSJDocumentToUSFM(files.usj as any).trim();
      expect(out.length).toBeGreaterThan(20);
      expect(out).toContain('\\id NEH');
      expect(out).toContain('\\c 9');
      expect(out).toMatch(/\\w gracious\\w\*/);
    });

    test('char-w-example-2: USJ includes lemma; USFM contains marked word', () => {
      const files = loadExampleFiles(requireExample('char-w-example-2'));
      if (!files.usj) throw new Error('missing USJ');
      const doc = files.usj as { content?: unknown[] };
      const json = JSON.stringify(doc);
      expect(json).toContain('"lemma":"grace"');
      const out = convertUSJDocumentToUSFM(files.usj as any).trim();
      expect(out).toContain('\\id NEH');
      expect(out).toMatch(/\\w gracious/);
    });
  });

  describe('Chapter marker', () => {
    test('cv-c-example-1: converts USJ with chapter', () => {
      const files = loadExampleFiles(requireExample('cv-c-example-1'));
      if (!files.usfm || !files.usj) {
        throw new Error('cv-c-example-1 files missing');
      }
      const out = convertUSJDocumentToUSFM(files.usj as any).trim();
      expect(out).toContain('\\c');
      expect(out.length).toBeGreaterThan(5);
    });
  });

  describe('Sample smoke tests', () => {
    test.each(['char-w-example-3', 'para-p-example-1'])('USJ → USFM for %s', (exampleId) => {
      const files = loadExampleFiles(requireExample(exampleId));
      if (!files.usj) {
        throw new Error(`missing USJ for ${exampleId}`);
      }
      const out = convertUSJDocumentToUSFM(files.usj as any).trim();
      expect(out.length).toBeGreaterThan(30);
      expect(out).toMatch(/\\id\s+[A-Z0-9]{3}/);
    });
  });
});
