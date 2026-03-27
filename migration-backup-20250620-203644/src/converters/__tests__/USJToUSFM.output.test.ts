import path from 'path';
import fs from 'fs';
import { USFMParser } from '../../grammar';
import { USJVisitor } from '../../grammar/visitors/USJ';
import { USJToUSFMConverter } from '../USJToUSFM';

describe('USJ to USFM Output Format Tests', () => {
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

  test('converts table structure correctly', () => {
    const originalUSFM = readFixture('usfm', 'table.usfm');

    parser.load(originalUSFM);
    const ast = parser.parse();
    ast.visit(usjVisitor);
    const usj = usjVisitor.getDocument();

    const reconstructedUSFM = converter.convert(usj);

    // Verify the basic structure is present
    expect(reconstructedUSFM).toContain('\\id NUM');
    expect(reconstructedUSFM).toContain('\\c 2');
    expect(reconstructedUSFM).toContain('\\v 3-9');
    expect(reconstructedUSFM).toContain('On the east side');
    expect(reconstructedUSFM).toContain('\\tr \\th1 Tribe');
    expect(reconstructedUSFM).toContain('\\th2 Leader');
    expect(reconstructedUSFM).toContain('\\thr3 Number');
    expect(reconstructedUSFM).toContain('\\tcr1-2 Total:');

    // Verify it parses without errors
    const verificationParser = new USFMParser();
    verificationParser.load(reconstructedUSFM);
    verificationParser.parse();
    expect(verificationParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);
  });

  test('converts jmp markers correctly', () => {
    const originalUSFM = readFixture('usfm', 'jmp.usfm');

    parser.load(originalUSFM);
    const ast = parser.parse();
    ast.visit(usjVisitor);
    const usj = usjVisitor.getDocument();

    const reconstructedUSFM = converter.convert(usj);

    // Verify the JMP marker format
    expect(reconstructedUSFM).toContain(
      '\\jmp RSV|href="x-prj:RSV52 GEN 1:1" title="Revised Standard Version"\\jmp*'
    );

    // Verify it parses without errors
    const verificationParser = new USFMParser();
    verificationParser.load(reconstructedUSFM);
    verificationParser.parse();
    expect(verificationParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);
  });

  test('converts list markers correctly', () => {
    const originalUSFM = readFixture('usfm', 'list.usfm');

    parser.load(originalUSFM);
    const ast = parser.parse();
    ast.visit(usjVisitor);
    const usj = usjVisitor.getDocument();

    const reconstructedUSFM = converter.convert(usj);

    // Verify list structure
    expect(reconstructedUSFM).toContain('\\lh');
    expect(reconstructedUSFM).toContain('\\li1');
    expect(reconstructedUSFM).toContain('\\lik');
    expect(reconstructedUSFM).toContain('\\liv1');

    // Verify it parses without errors
    const verificationParser = new USFMParser();
    verificationParser.load(reconstructedUSFM);
    verificationParser.parse();
    expect(verificationParser.getLogs().filter((log) => log.type === 'error')).toHaveLength(0);
  });

  test('preserves basic document structure', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'book',
          marker: 'id',
          code: 'TIT',
          content: [],
        },
        {
          type: 'chapter',
          marker: 'c',
          number: '1',
          sid: 'TIT 1',
        },
        {
          type: 'para',
          marker: 'p',
          content: [
            {
              type: 'verse',
              marker: 'v',
              number: '1',
              sid: 'TIT 1:1',
            },
            'Paul, a servant of God and an apostle of Jesus Christ.',
          ],
        },
      ],
    };

    const result = converter.convert(usj);

    expect(result).toBe(
      [
        '\\id TIT',
        '\\c 1',
        '\\p \\v 1 Paul, a servant of God and an apostle of Jesus Christ.',
      ].join('\n')
    );
  });

  test('handles character markers with attributes', () => {
    const usj = {
      type: 'USJ',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            'The word ',
            {
              type: 'char',
              marker: 'w',
              content: 'logos',
              lemma: 'word',
              'x-occurrence': '1',
            },
            ' is important.',
          ],
        },
      ],
    };

    const result = converter.convert(usj);

    expect(result).toContain('\\w logos|lemma="word" x-occurrence="1"\\w*');
  });

  test('handles notes with callers', () => {
    const usj = {
      type: 'USJ',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            'Text with note',
            {
              type: 'note',
              marker: 'f',
              caller: '+',
              content: [
                {
                  type: 'char',
                  marker: 'ft',
                  content: 'Footnote text',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = converter.convert(usj);

    expect(result).toContain('\\f + \\ft Footnote text\\ft*\\f*');
  });

  test('handles milestone markers', () => {
    const usj = {
      type: 'USJ',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            'Text with ',
            {
              type: 'ms',
              marker: 'zaln-s',
              who: 'Paul',
              'x-occurrence': '1',
            },
            ' milestone.',
          ],
        },
      ],
    };

    const result = converter.convert(usj);

    expect(result).toContain('\\zaln-s |who="Paul" x-occurrence="1"\\*');
  });
});
