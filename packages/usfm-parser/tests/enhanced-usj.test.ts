/**
 * Test enhanced USJ node generation and plain USJ export
 */

import { USFMParser } from '../src/parser';

describe('Enhanced USJ Node Generation', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  test('should parse simple USFM into enhanced USJ nodes', () => {
    const usfm =
      '\\id GEN Genesis\\c 1\\p \\v 1 In the beginning God created the heavens and the earth.';

    const result = parser.parse(usfm);
    const rootNode = result.getRootNode();

    expect(rootNode).not.toBeNull();
    expect(rootNode!.type).toBe('root');
    expect(rootNode!.content).toHaveLength(3); // book, chapter, paragraph

    // Check book node
    const bookNode = rootNode!.content[0];
    expect(bookNode.type).toBe('book');
    expect((bookNode as any).code).toBe('GEN');
    expect((bookNode as any).content).toEqual(['Genesis']);

    // Check chapter node
    const chapterNode = rootNode!.content[1];
    expect(chapterNode.type).toBe('chapter');
    expect((chapterNode as any).number).toBe('1');

    // Check paragraph node
    const paragraphNode = rootNode!.content[2];
    expect(paragraphNode.type).toBe('para');
    expect((paragraphNode as any).marker).toBe('p');
    expect((paragraphNode as any).content).toHaveLength(2); // verse + text
  });

  test('should export plain USJ format', () => {
    const usfm =
      '\\id GEN Genesis\\c 1\\p \\v 1 In the beginning God created the heavens and the earth.';

    const result = parser.parse(usfm);
    const plainUSJ = result.toJSON();

    expect(plainUSJ).toEqual({
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'book',
          marker: 'id',
          code: 'GEN',
          content: ['Genesis'],
        },
        {
          type: 'chapter',
          marker: 'c',
          number: '1',
        },
        {
          type: 'para',
          marker: 'p',
          content: [
            {
              type: 'verse',
              marker: 'v',
              number: '1',
            },
            'In the beginning God created the heavens and the earth.',
          ],
        },
      ],
    });
  });

  test('should handle character markers in enhanced USJ', () => {
    const usfm = '\\p Text with \\w word\\w* marker.';

    const result = parser.parse(usfm);
    const plainUSJ = result.toJSON();

    expect(plainUSJ.content[0].content).toEqual([
      'Text with ',
      {
        type: 'char',
        marker: 'w',
        content: ['word'],
      },
      ' marker.',
    ]);
  });

  test('should handle notes in enhanced USJ', () => {
    const usfm = '\\p Text with \\f + \\ft footnote\\f* content.';

    const result = parser.parse(usfm);
    const plainUSJ = result.toJSON();

    expect(plainUSJ.content[0].content).toEqual([
      'Text with ',
      {
        type: 'note',
        marker: 'f',
        caller: '+',
        content: [
          {
            type: 'char',
            marker: 'ft',
            content: ['footnote'],
          },
        ],
      },
      ' content.',
    ]);
  });

  test('should preserve enhanced methods on parsed nodes', () => {
    const usfm = '\\p Text content.';

    const result = parser.parse(usfm);
    const nodes = result.getNodes();

    expect(nodes).toHaveLength(1);
    const paragraphNode = nodes[0];

    // Check that enhanced methods are available
    expect(typeof paragraphNode.getChildren).toBe('function');
    expect(typeof paragraphNode.accept).toBe('function');
    expect(typeof paragraphNode.acceptWithContext).toBe('function');
    expect(typeof (paragraphNode as any).toJSON).toBe('function');

    // Test navigation methods
    expect(paragraphNode.getParent()).toBeUndefined(); // Root level
    expect(paragraphNode.getChildren()).toHaveLength(1); // One text node
  });

  test('should handle empty input', () => {
    const result = parser.parse('');
    const plainUSJ = result.toJSON();

    expect(plainUSJ).toEqual({
      type: 'USJ',
      version: '3.1',
      content: [],
    });
  });

  test('should handle complex structure with nested markers', () => {
    const usfm = '\\id GEN\\c 1\\p \\v 1 Text with \\w word\\+nd nested\\+nd*\\w* content.';

    const result = parser.parse(usfm);
    const plainUSJ = result.toJSON();

    expect(plainUSJ.content).toHaveLength(3); // book, chapter, paragraph

    const paragraphContent = plainUSJ.content[2].content;
    expect(paragraphContent).toEqual([
      {
        type: 'verse',
        marker: 'v',
        number: '1',
      },
      'Text with ',
      {
        type: 'char',
        marker: 'w',
        content: [
          'word',
          {
            type: 'char',
            marker: 'nd',
            content: ['nested'],
          },
        ],
      },
      ' content.',
    ]);
  });
});
