import path from 'path';
import fs from 'fs';
import { USFMParser } from '../../grammar';
import { USJVisitor } from '../../grammar/visitors/USJ';
import { USJToUSFMConverter } from '../USJToUSFM';

describe('USJ to USFM Simple Tests', () => {
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

  test('round-trip conversion: basic table', () => {
    // Step 1: Load original USFM
    const originalUSFM = readFixture('usfm', 'table.usfm');

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

  test('round-trip conversion: jmp markers', () => {
    const originalUSFM = readFixture('usfm', 'jmp.usfm');

    parser.load(originalUSFM);
    const ast = parser.parse();
    ast.visit(usjVisitor);
    const usj = usjVisitor.getDocument();

    const reconstructedUSFM = converter.convert(usj);

    const verificationParser = new USFMParser();
    verificationParser.load(reconstructedUSFM);
    const verificationAST = verificationParser.parse();

    expect(verificationParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);

    const verificationVisitor = new USJVisitor();
    verificationAST.visit(verificationVisitor);
    const verificationUSJ = verificationVisitor.getDocument();

    expect(verificationUSJ).toEqual(usj);
  });

  test('round-trip conversion: list markers', () => {
    const originalUSFM = readFixture('usfm', 'list.usfm');

    parser.load(originalUSFM);
    const ast = parser.parse();
    ast.visit(usjVisitor);
    const usj = usjVisitor.getDocument();

    const reconstructedUSFM = converter.convert(usj);

    const verificationParser = new USFMParser();
    verificationParser.load(reconstructedUSFM);
    const verificationAST = verificationParser.parse();

    expect(verificationParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);

    const verificationVisitor = new USJVisitor();
    verificationAST.visit(verificationVisitor);
    const verificationUSJ = verificationVisitor.getDocument();

    expect(verificationUSJ).toEqual(usj);
  });

  test('preserves basic structure', () => {
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
});
