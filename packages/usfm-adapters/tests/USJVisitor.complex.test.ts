import path from 'path';
import fs from 'fs';
import { USFMParser } from '@usfm-tools/parser';
import { USJVisitor } from '../src';

describe('USJ Visitor Complex USFM Tests', () => {
  const readFixture = (filename: string) => {
    return fs.readFileSync(path.join(__dirname, 'fixtures', 'usfm', filename), 'utf8');
  };

  test('converts complex.usfm to USJ', () => {
    const usfm = readFixture('complex.usfm');
    const parser = new USFMParser();
    parser.load(usfm);
    const ast = parser.parse();
    const visitor = new USJVisitor();
    ast.visit(visitor);
    const result = visitor.getDocument();

    const astJson = JSON.parse(JSON.stringify(ast.getNodes()));

    // Verify the document structure
    expect(result.type).toBe('USJ');
    expect(result.version).toBe('3.1');
    expect(Array.isArray(result.content)).toBe(true);

    const content = result.content as any[];

    // Check book identification
    const bookNode = content.find((node: any) => node.type === 'book');
    expect(bookNode).toEqual({
      type: 'book',
      marker: 'id',
      code: 'TIT',
      content: ['EN_ULT unfoldingWord® Literal Text'],
    });

    // Check for various paragraph types
    const paraNodes = content.filter((node) => node.type === 'para');
    const paraMarkers = paraNodes.map((node) => node.marker);

    expect(paraMarkers).toContain('h'); // header
    expect(paraMarkers).toContain('toc1'); // table of contents
    expect(paraMarkers).toContain('mt1'); // main title
    expect(paraMarkers).toContain('mt2'); // main title 2
    expect(paraMarkers).toContain('p'); // paragraph
    expect(paraMarkers).toContain('s5'); // section heading
    expect(paraMarkers).toContain('q1'); // poetry
    expect(paraMarkers).toContain('q2'); // poetry indent
    expect(paraMarkers).toContain('li1'); // list item
    expect(paraMarkers).toContain('s2'); // section heading 2
    expect(paraMarkers).toContain('r'); // cross reference

    // Check for verses
    const firstPara = paraNodes.find(
      (node: any) =>
        node.content &&
        node.content.some(
          (item: any) => typeof item === 'object' && item.type === 'verse' && item.number === '1'
        )
    );
    expect(firstPara).toBeDefined();

    // Check for footnotes
    const paraWithFootnote = paraNodes.find(
      (node: any) =>
        node.content &&
        node.content.some(
          (item: any) => typeof item === 'object' && item.type === 'note' && item.marker === 'f'
        )
    );
    expect(paraWithFootnote).toBeDefined();

    // Check for character markers
    const paraWithCharMarker = paraNodes.find(
      (node: any) =>
        node.content &&
        node.content.some(
          (item: any) => typeof item === 'object' && item.type === 'char' && item.marker === 'w'
        )
    );
    expect(paraWithCharMarker).toBeDefined();

    console.log('Total nodes:', content.length);
    console.log('Book nodes:', content.filter((n) => n.type === 'book').length);
    console.log('Para nodes:', content.filter((n) => n.type === 'para').length);
    console.log('Milestone nodes:', content.filter((n) => n.type === 'ms').length);
  });

  test('complex USFM footnote structure', () => {
    const usfm =
      '\\p \\v 4 Grace from God \\f + \\fr 1:4 \\fq God \\ft Some versions add \\fqa the Father\\fqa* .\\f* and Christ.';
    const parser = new USFMParser();
    parser.load(usfm);
    const ast = parser.parse();
    const visitor = new USJVisitor();
    ast.visit(visitor);
    const result = visitor.getResult();

    // Should have a paragraph with verse, text, footnote, and more text
    expect(result.type).toBe('para');
    expect(result.marker).toBe('p');

    const footnote = (result.content as any[]).find(
      (item: any) => typeof item === 'object' && item.type === 'note' && item.marker === 'f'
    );
    expect(footnote).toBeDefined();
    expect(footnote.caller).toBe('+');

    // Footnote should have content with different markers
    expect(Array.isArray(footnote.content)).toBe(true);
    expect(
      footnote.content.some((item: any) => typeof item === 'object' && item.marker === 'fr')
    ).toBe(true); // footnote reference
    expect(
      footnote.content.some((item: any) => typeof item === 'object' && item.marker === 'fq')
    ).toBe(true); // footnote quotation
    expect(
      footnote.content.some((item: any) => typeof item === 'object' && item.marker === 'ft')
    ).toBe(true); // footnote text
  });

  test('complex USFM poetry structure', () => {
    const usfm = `\\q1
\\v 7 For the overseer must be blameless, as God's household manager.
  \\q2 He must not be arrogant,
    \\q2 not easily angered,`;

    const parser = new USFMParser();
    parser.load(usfm);
    const ast = parser.parse();
    const visitor = new USJVisitor();
    ast.visit(visitor);
    const result = visitor.getDocument();

    const q1Para = (result.content as any[]).find(
      (node: any) => node.type === 'para' && node.marker === 'q1'
    );
    const q2Paras = (result.content as any[]).filter(
      (node: any) => node.type === 'para' && node.marker === 'q2'
    );

    expect(q1Para).toBeDefined();
    expect(q2Paras.length).toBeGreaterThan(0);
  });

  test('complex USFM character markers with attributes', () => {
    const usfm = '\\p \\v 6 having \\w the|strong="G3588"\\w* husband of one wife';
    const parser = new USFMParser();
    parser.load(usfm);
    const ast = parser.parse();
    const visitor = new USJVisitor();
    ast.visit(visitor);
    const result = visitor.getResult();

    const charMarker = (result.content as any[]).find(
      (item: any) => typeof item === 'object' && item.type === 'char' && item.marker === 'w'
    );

    expect(charMarker).toBeDefined();
    expect(charMarker.content).toBe('the');
    expect(charMarker.strong).toBe('G3588');
  });

  test('complex USFM list items', () => {
    const usfm = `\\p
\\v 8 Instead, he should be:
\\li1 hospitable,
\\li1 a friend of what is good,
\\li1 sensible,`;

    const parser = new USFMParser();
    parser.load(usfm);
    const ast = parser.parse();
    const visitor = new USJVisitor();
    ast.visit(visitor);
    const result = visitor.getDocument();

    const listItems = (result.content as any[]).filter(
      (node: any) => node.type === 'para' && node.marker === 'li1'
    );
    expect(listItems.length).toBe(3);

    expect(listItems[0].content).toContain('hospitable,');
    expect(listItems[1].content).toContain('a friend of what is good,');
    expect(listItems[2].content).toContain('sensible,');
  });
});
