import path from 'path';
import fs from 'fs';
import { USFMParser } from '../../grammar';
import { USJVisitor } from '../../grammar/visitors/USJ';
import { USJToUSFMConverter } from '../USJToUSFM';

describe('USJ to USFM Normalized Round-trip Tests', () => {
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

  const normalizeUSFM = (usfm: string): string => {
    const normalizer = new USFMParser();
    normalizer.load(usfm);
    normalizer.normalize();
    return normalizer.getInput();
  };

  const testNormalizedRoundTrip = (usfmFile: string, testName: string) => {
    test(`normalized round-trip: ${testName}`, () => {
      // Step 1: Load and normalize original USFM
      const originalUSFM = readFixture('usfm', usfmFile);
      const normalizedOriginal = normalizeUSFM(originalUSFM);

      // Step 2: Parse normalized USFM to AST
      parser.load(normalizedOriginal);
      const ast = parser.parse();

      // Step 3: Convert AST to USJ
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      // Step 4: Convert USJ back to USFM
      const reconstructedUSFM = converter.convert(usj);

      // Step 5: Normalize the reconstructed USFM
      const normalizedReconstructed = normalizeUSFM(reconstructedUSFM);

      // Step 6: Parse both normalized versions and compare USJ structures
      const originalParser = new USFMParser();
      originalParser.load(normalizedOriginal);
      const originalAST = originalParser.parse();
      const originalVisitor = new USJVisitor();
      originalAST.visit(originalVisitor);
      const originalUSJ = originalVisitor.getDocument();

      const reconstructedParser = new USFMParser();
      reconstructedParser.load(normalizedReconstructed);
      const reconstructedAST = reconstructedParser.parse();
      const reconstructedVisitor = new USJVisitor();
      reconstructedAST.visit(reconstructedVisitor);
      const reconstructedUSJ = reconstructedVisitor.getDocument();

      // Should parse without errors
      expect(originalParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);
      expect(reconstructedParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);

      // The USJ structures should be identical
      expect(reconstructedUSJ).toEqual(originalUSJ);
    });
  };

  describe('File-based normalized round-trip tests', () => {
    testNormalizedRoundTrip('basic.usfm', 'basic document');
    testNormalizedRoundTrip('jmp.usfm', 'jmp markers');
    testNormalizedRoundTrip('list.usfm', 'list markers');
    testNormalizedRoundTrip('list-total.usfm', 'list with totals');
    testNormalizedRoundTrip('table.usfm', 'table markers');
    testNormalizedRoundTrip('medium.usfm', 'medium complexity document');
  });

  describe('Specific normalization scenarios', () => {
    test('handles multi-line text normalization', () => {
      const originalUSFM = String.raw`\id TIT
\c 1
\p
\v 1 This is a verse that spans
multiple lines for readability.`;

      const normalizedOriginal = normalizeUSFM(originalUSFM);

      parser.load(normalizedOriginal);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);
      const normalizedReconstructed = normalizeUSFM(reconstructed);

      // Compare normalized versions
      expect(normalizedReconstructed).toBe(normalizedOriginal);
    });

    test('handles whitespace variations', () => {
      const originalUSFM = String.raw`\id  TIT
\c   1
\p
\v 1    Text with   extra    spaces.`;

      const normalizedOriginal = normalizeUSFM(originalUSFM);

      parser.load(normalizedOriginal);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);
      const normalizedReconstructed = normalizeUSFM(reconstructed);

      expect(normalizedReconstructed).toBe(normalizedOriginal);
    });

    test('handles attribute order variations', () => {
      const originalUSFM = String.raw`\p \w word|strong="123" lemma="test"\w*`;

      const normalizedOriginal = normalizeUSFM(originalUSFM);

      parser.load(normalizedOriginal);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);
      const normalizedReconstructed = normalizeUSFM(reconstructed);

      // Parse both and compare USJ structures (attributes might be reordered)
      const originalParser = new USFMParser();
      originalParser.load(normalizedOriginal);
      const originalAST = originalParser.parse();
      const originalVisitor = new USJVisitor();
      originalAST.visit(originalVisitor);
      const originalUSJ = originalVisitor.getDocument();

      const reconstructedParser = new USFMParser();
      reconstructedParser.load(normalizedReconstructed);
      const reconstructedAST = reconstructedParser.parse();
      const reconstructedVisitor = new USJVisitor();
      reconstructedAST.visit(reconstructedVisitor);
      const reconstructedUSJ = reconstructedVisitor.getDocument();

      expect(reconstructedUSJ).toEqual(originalUSJ);
    });

    test('preserves semantic meaning despite formatting differences', () => {
      const originalUSFM = String.raw`\id TIT
\c 1
\p
\v 1 Paul, a servant of God.
\v 2 Grace and peace.`;

      const normalizedOriginal = normalizeUSFM(originalUSFM);

      parser.load(normalizedOriginal);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);

      // Verify that both versions produce the same semantic structure
      const verificationParser = new USFMParser();
      verificationParser.load(reconstructed);
      verificationParser.normalize();
      const verificationAST = verificationParser.parse();
      const verificationVisitor = new USJVisitor();
      verificationAST.visit(verificationVisitor);
      const verificationUSJ = verificationVisitor.getDocument();

      expect(verificationUSJ).toEqual(usj);
    });
  });

  describe('Edge cases with normalization', () => {
    test('handles empty paragraphs', () => {
      const originalUSFM = String.raw`\id TIT
\c 1
\p
\v 1 Text
\p
\v 2 More text`;

      const normalizedOriginal = normalizeUSFM(originalUSFM);

      parser.load(normalizedOriginal);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);
      const normalizedReconstructed = normalizeUSFM(reconstructed);

      // Should preserve the structure
      expect(normalizedReconstructed).toContain('\\p');
      expect(normalizedReconstructed).toContain('\\v 1');
      expect(normalizedReconstructed).toContain('\\v 2');
    });

    test('handles line ending variations', () => {
      const originalUSFM = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text';

      const normalizedOriginal = normalizeUSFM(originalUSFM);

      parser.load(normalizedOriginal);
      const ast = parser.parse();
      ast.visit(usjVisitor);
      const usj = usjVisitor.getDocument();

      const reconstructed = converter.convert(usj);
      const normalizedReconstructed = normalizeUSFM(reconstructed);

      // Should use consistent line endings
      expect(normalizedReconstructed).not.toContain('\r\n');
      expect(normalizedReconstructed).toContain('\n');
    });
  });
});
