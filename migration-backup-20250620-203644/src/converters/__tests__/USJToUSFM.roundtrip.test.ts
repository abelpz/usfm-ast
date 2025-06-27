import path from 'path';
import fs from 'fs';
import { USFMParser } from '../../grammar';
import { USJVisitor } from '../../grammar/visitors/USJ';
import { USJToUSFMConverter, USJNode } from '../USJToUSFM';

describe('USJ to USFM Round-trip Conversion', () => {
  let parser: USFMParser;
  let usjVisitor: USJVisitor;
  let converter: USJToUSFMConverter;

  beforeEach(() => {
    parser = new USFMParser();
    usjVisitor = new USJVisitor();
    converter = new USJToUSFMConverter();
  });

  const readFixture = (dir: string, filename: string) => {
    return fs.readFileSync(
      path.join(__dirname, '../../grammar/__tests__/fixtures', dir, filename),
      'utf8'
    );
  };

  const testRoundTrip = (usfmFile: string, testName: string) => {
    test(`round-trip conversion: ${testName}`, () => {
      // Step 1: Load original USFM
      const originalUSFM = readFixture('usfm', usfmFile);

      // Step 2: Parse USFM to AST
      parser.load(originalUSFM);
      const ast = parser.parse();

      // Step 3: Convert AST to USJ
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      // Step 4: Convert USJ back to USFM
      const reconstructedUSFM = converter.convert(usj);

      // Step 5: Parse reconstructed USFM to verify it's valid
      const verificationParser = new USFMParser();
      verificationParser.load(reconstructedUSFM);
      const verificationAST = verificationParser.parse();

      // Should parse without errors
      expect(verificationParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);

      // Step 6: Convert verification AST to USJ to compare structure
      const verificationVisitor = new USJVisitor();
      verificationAST.visit(verificationVisitor);
      const verificationUSJ = verificationVisitor.getDocument();

      // The USJ structures should be identical
      expect(verificationUSJ).toEqual(usj);
    });
  };

  describe('File-based round-trip tests', () => {
    testRoundTrip('basic.usfm', 'basic document');
    testRoundTrip('jmp.usfm', 'jmp markers');
    testRoundTrip('list.usfm', 'list markers');
    testRoundTrip('list-total.usfm', 'list with totals');
    testRoundTrip('table.usfm', 'table markers');
    testRoundTrip('medium.usfm', 'medium complexity document');
  });

  describe('Specific conversion accuracy tests', () => {
    test('preserves table cell alignment and colspan', () => {
      const usfm = String.raw`\tr \th1 Name \thc2 Score \tcr1-2 Total`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getResult();

      const reconstructed = converter.convert(usj as USJNode);

      expect(reconstructed).toBe(usfm);
    });

    test('preserves character marker attributes', () => {
      const usfm = String.raw`\p \w word|lemma="logos" x-occurrence="1"\w* text`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getResult();

      const reconstructed = converter.convert(usj as USJNode);

      // Parse both to compare structure since attribute order might vary
      const originalParser = new USFMParser();
      originalParser.load(usfm);
      const originalAST = originalParser.parse();

      const reconstructedParser = new USFMParser();
      reconstructedParser.load(reconstructed);
      const reconstructedAST = reconstructedParser.parse();

      // Compare the AST structures
      const originalVisitor = new USJVisitor();
      originalAST.visit(originalVisitor);
      const originalUSJ = originalVisitor.getResult();

      const reconstructedVisitor = new USJVisitor();
      reconstructedAST.visit(reconstructedVisitor);
      const reconstructedUSJ = reconstructedVisitor.getResult();

      expect(reconstructedUSJ).toEqual(originalUSJ);
    });

    test('preserves milestone markers with attributes', () => {
      const usfm = String.raw`\p Text \zaln-s |who="Paul" x-occurrence="1"\* more text`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getResult();

      const reconstructed = converter.convert(usj as USJNode);

      // Verify structure preservation
      const reconstructedParser = new USFMParser();
      reconstructedParser.load(reconstructed);
      const reconstructedAST = reconstructedParser.parse();

      const reconstructedVisitor = new USJVisitor();
      reconstructedAST.visit(reconstructedVisitor);
      const reconstructedUSJ = reconstructedVisitor.getResult();

      expect(reconstructedUSJ).toEqual(usj);
    });

    test('preserves note structure with caller', () => {
      const usfm = String.raw`\p Text with note\f + \ft Footnote text\ft*`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getResult();

      const reconstructed = converter.convert(usj as USJNode);

      // Verify note structure is preserved
      expect(reconstructed).toContain('\\f +');
      expect(reconstructed).toContain('\\ft');
      expect(reconstructed).toContain('\\f*');
    });

    test('handles nested table cells correctly', () => {
      // This tests the specific issue we found with nested cells
      const usfm = String.raw`\tr \th1 Name \thc2 Score \thr3 Rank`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getResult();

      const reconstructed = converter.convert({ type: 'USJ', content: usj } as unknown as USJNode);

      // Should not have duplicated cells
      const cellCount =
        (reconstructed.match(/\\th/g) || []).length + (reconstructed.match(/\\tc/g) || []).length;
      expect(cellCount).toBe(3); // Exactly 3 cells

      expect(reconstructed).toBe(usfm);
    });
  });

  describe('Document structure preservation', () => {
    test('preserves book, chapter, and verse structure', () => {
      const usfm = String.raw`\id TIT
\c 1
\p
\v 1 Paul, a servant of God.`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);

      expect(reconstructed).toContain('\\id TIT');
      expect(reconstructed).toContain('\\c 1');
      expect(reconstructed).toContain('\\v 1');
      expect(reconstructed).toContain('Paul, a servant of God.');
    });

    test('preserves paragraph structure', () => {
      const usfm = String.raw`\p First paragraph.
\q1 Poetry line.
\m Margin paragraph.`;

      parser.load(usfm);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getResult();

      const reconstructed = converter.convert({ type: 'USJ', content: usj } as unknown as USJNode);

      expect(reconstructed).toContain('\\p');
      expect(reconstructed).toContain('\\q1');
      expect(reconstructed).toContain('\\m');
    });
  });

  describe('Edge cases and error handling', () => {
    test('handles empty content gracefully', () => {
      const usj = { type: 'USJ', content: [] };
      const result = converter.convert(usj);
      expect(result).toBe('');
    });

    test('handles missing markers gracefully', () => {
      const usj = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            content: ['Text without marker'],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toContain('\\p'); // Should default to 'p'
    });

    test('handles malformed table cells', () => {
      const usj = {
        type: 'USJ',
        content: [
          {
            type: 'table:row',
            marker: 'tr',
            content: [
              {
                type: 'table:cell',
                marker: 'invalid-marker',
                content: ['Cell content'],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      // Should handle gracefully without throwing
      expect(result).toContain('\\tr');
      expect(result).toContain('Cell content');
    });
  });
});
