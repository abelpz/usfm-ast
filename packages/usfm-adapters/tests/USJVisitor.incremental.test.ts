import { USFMParser } from '@usfm-tools/parser';
import { USJVisitor } from '../src';

describe('USJ Visitor Incremental Tests', () => {
  let parser: USFMParser;
  let visitor: USJVisitor;

  beforeEach(() => {
    parser = new USFMParser();
    visitor = new USJVisitor();
  });

  const testConversion = (usfm: string, expected: any) => {
    parser.load(usfm);
    const ast = parser.parse();
    visitor = new USJVisitor();
    ast.visit(visitor);
    const actual = visitor.getResult();
    expect(actual).toEqual(expected);
  };

  describe('Basic structure tests', () => {
    test('simple text paragraph', () => {
      testConversion('\\p Hello world', {
        type: 'para',
        marker: 'p',
        content: ['Hello world'],
      });
    });

    test('paragraph with character marker', () => {
      testConversion('\\p Hello \\w world\\w*', {
        type: 'para',
        marker: 'p',
        content: [
          'Hello ',
          {
            type: 'char',
            marker: 'w',
            content: 'world',
          },
        ],
      });
    });

    test('verse marker', () => {
      testConversion('\\v 1 ', {
        type: 'verse',
        marker: 'v',
        number: '1',
      });
    });
  });

  describe('Book and chapter tests', () => {
    test('book identification', () => {
      testConversion("\\id TIT Paul's letter", {
        type: 'book',
        marker: 'id',
        code: 'TIT',
        content: ["Paul's letter"],
      });
    });

    test('chapter marker', () => {
      testConversion('\\c 1', {
        type: 'chapter',
        marker: 'c',
        number: '1',
      });
    });
  });

  describe('Complex structures', () => {
    test('paragraph with verse and character markers', () => {
      testConversion('\\p \\v 1 \\w Paul\\w*, a servant', {
        type: 'para',
        marker: 'p',
        content: [
          {
            type: 'verse',
            marker: 'v',
            number: '1',
          },
          {
            type: 'char',
            marker: 'w',
            content: 'Paul',
          },
          ', a servant',
        ],
      });
    });

    test('milestone with attributes', () => {
      testConversion('\\zaln-s |who="Paul"\\*', {
        type: 'ms',
        marker: 'zaln-s',
        who: 'Paul',
      });
    });

    test('character with attributes', () => {
      testConversion('\\w Paul|x-occurrence="1"\\w*', {
        type: 'char',
        marker: 'w',
        content: 'Paul',
        'x-occurrence': '1',
      });
    });
  });

  describe('Document structure tests', () => {
    test('book with multiple elements', () => {
      const usfm = '\\id TIT\n\\p \\v 1 Hello';
      parser.load(usfm);
      const ast = parser.parse();
      visitor = new USJVisitor();
      ast.visit(visitor);
      const actual = visitor.getDocument();

      expect(actual).toEqual({
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
            type: 'para',
            marker: 'p',
            content: [
              {
                type: 'verse',
                marker: 'v',
                number: '1',
              },
              'Hello',
            ],
          },
        ],
      });
    });
  });
});
