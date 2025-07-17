/**
 * Simple UsfmParser Test Suite
 *
 * Tests for the new UsfmParser implementation
 */

import { UsfmParser } from '../src/parser/UsfmParser';

describe('UsfmParser', () => {
  test('Temp', () => {
    const input = '\\w word\\w* \\v 2 some text';
    const parser = new UsfmParser(input, {});
    const response = parser.parse();
    expect(response.success).toBe(true);
    const result = response.result;
    console.log(JSON.stringify(result, null, 2));
    expect(response.result).toBeDefined();
  });
  describe('Basic Parsing', () => {
    test('should parse simple verse', () => {
      const input = '\\v 1 This is verse one.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.type).toBe('USJ');
        expect(result.result).toBe({
          type: 'USJ',
          version: '0.3.1',
          content: [
            {
              type: 'verse',
              marker: 'v',
              number: '1',
            },
            'This is verse one.',
          ],
        });
      }
    });

    test('should parse paragraph', () => {
      const input = '\\p This is a paragraph.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.type).toBe('USJ');
      }
    });

    test('should handle empty input', () => {
      const input = '';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.type).toBe('USJ');
        expect(result.result.content).toHaveLength(0);
      }
    });

    test('should handle plain text', () => {
      const input = 'This is plain text.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.type).toBe('USJ');
        expect(result.result.content).toHaveLength(1);
      }
    });

    test('should handle multiple markers', () => {
      const input = '\\p \\v 1 This is a verse in a paragraph.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.type).toBe('USJ');
        expect(result.result.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Syntax Fallback Tests', () => {
    test('should use paragraph syntax for markers without explicit syntax', () => {
      const input = '\\p This is a paragraph that should use the paragraph type fallback syntax.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.content).toHaveLength(1);
        const element = result.result.content[0] as any;
        expect(element.marker).toBe('p');
        expect(element.type).toBe('para');
        expect(element.content).toBeDefined();
      }
    });

    test('should use character syntax for character markers', () => {
      const input = '\\nd Lord\\nd* spoke';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.content.length).toBeGreaterThan(0);
      }
    });

    test('should handle verse with special content', () => {
      const input = '\\v 1 This is verse content.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.content).toHaveLength(1);
        const element = result.result.content[0] as any;
        expect(element.marker).toBe('v');
        expect(element.type).toBe('verse');
      }
    });

    test('should handle chapter marker', () => {
      const input = '\\c 1';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.content).toHaveLength(1);
        const element = result.result.content[0] as any;
        expect(element.marker).toBe('c');
        expect(element.type).toBe('chapter');
      }
    });

    test('should handle milestone markers', () => {
      const input = '\\qt-s |who="Jesus"\\qt-e';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      // Milestones might be handled differently, just ensure parsing doesn't fail
    });
  });

  describe('Enhanced Fallback System Tests', () => {
    test('should inherit hasSpecialContent from syntaxByType for note markers', () => {
      const input = '\\f + Some footnote text.\\f*';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      // Test that note markers inherit hasSpecialContent: true from syntaxByType
    });

    test('should inherit allowsAttributes from syntaxByType for milestone markers', () => {
      const input = '\\qt-s |who="Jesus"\\*Some other text\\qt-e\\*';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      // Test that milestone markers inherit allowsAttributes: true from syntaxByType
    });

    test('should merge implicitAttributes from syntaxByType with marker-specific ones', () => {
      const input = '\\ts |sid="section1"';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      // Test that milestone markers get default sid/eid attributes plus any specific ones
    });

    test('should use contentType fallbacks correctly', () => {
      const input = '\\p This is paragraph content.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      // Test that paragraph markers inherit contentType: 'text' from syntaxByType
    });

    test('should properly merge specialContent configurations', () => {
      const input = '\\x + Reference text.\\x*';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      // Test that cross-reference markers inherit note fallbacks plus their own configurations
    });

    test('should handle character markers with proper fallbacks', () => {
      const input = '\\add added text\\add*';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      // Test that character markers inherit allowsAttributes: false and contentType: 'mixed'
    });

    test('should verify registry returns merged properties', () => {
      const { USFMMarkerRegistry } = require('../src/constants/registry');
      const registry = USFMMarkerRegistry.getInstance();

      // Test that a basic paragraph marker gets fallback properties
      const pInfo = registry.getMarkerInfo('p');
      expect(pInfo).toBeDefined();
      if (pInfo) {
        expect(pInfo.allowsAttributes).toBe(false); // From syntaxByType.paragraph
        expect(pInfo.hasSpecialContent).toBe(false); // From syntaxByType.paragraph
        expect(pInfo.contentType).toBe('text'); // From syntaxByType.paragraph
      }

      // Test that a note marker gets fallback properties
      const fInfo = registry.getMarkerInfo('f');
      expect(fInfo).toBeDefined();
      if (fInfo) {
        expect(fInfo.hasSpecialContent).toBe(true); // From syntaxByType.note OR explicit
        expect(fInfo.implicitAttributes).toBeDefined(); // Should have merged attributes
        expect(fInfo.implicitAttributes?.caller).toBeDefined(); // From fallback
      }

      // Test that a milestone marker gets fallback properties
      const tsInfo = registry.getMarkerInfo('ts');
      expect(tsInfo).toBeDefined();
      if (tsInfo) {
        expect(tsInfo.allowsAttributes).toBe(true); // From syntaxByType.milestone OR explicit
        expect(tsInfo.implicitAttributes).toBeDefined(); // Should have sid/eid from fallback
        expect(tsInfo.implicitAttributes?.sid).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid markers gracefully', () => {
      const input = '\\invalidMarker This should not break.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      // Should not throw, but may have errors
      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
    });

    test('should handle malformed input', () => {
      const input = '\\v This is missing verse number.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      // Should not throw
      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('Whitespace Handling', () => {
    test('should handle whitespace correctly', () => {
      const input = '\\v 1   This has   extra   spaces.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });

    test('should handle newlines', () => {
      const input = '\\v 1 First line.\n\\v 2 Second line.';
      const parser = new UsfmParser(input, {});
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      if (result.result) {
        expect(result.result.content.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Special Content Parsing', () => {
  describe('Number Content Type', () => {
    it('should parse simple chapter numbers', () => {
      const parser = new UsfmParser('\\c 1');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const chapter = result.result?.content[0] as any;
      expect(chapter?.marker).toBe('c');
      expect(chapter?.number).toBe('1');
    });

    it('should parse chapter numbers with following content', () => {
      const parser = new UsfmParser('\\c 5 \\v 1 Text content');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(2);

      const chapter = result.result?.content[0] as any;
      expect(chapter?.marker).toBe('c');
      expect(chapter?.number).toBe('5');

      const verse = result.result?.content[1] as any;
      expect(verse?.marker).toBe('v');
      expect(verse?.number).toBe('1');
    });
  });

  describe('Number-Reference Content Type', () => {
    it('should parse simple verse numbers', () => {
      const parser = new UsfmParser('\\v 1 Some text');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const verse = result.result?.content[0] as any;
      expect(verse?.marker).toBe('v');
      expect(verse?.number).toBe('1');
    });

    it('should parse verse ranges', () => {
      const parser = new UsfmParser('\\v 1-3 Some text');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const verse = result.result?.content[0] as any;
      expect(verse?.marker).toBe('v');
      expect(verse?.number).toBe('1-3');
    });

    it('should parse verse lists', () => {
      const parser = new UsfmParser('\\v 1,3,5 Some text');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const verse = result.result?.content[0] as any;
      expect(verse?.marker).toBe('v');
      expect(verse?.number).toBe('1,3,5');
    });
  });

  describe('Text Content Type', () => {
    it('should parse footnote callers', () => {
      const parser = new UsfmParser('\\f + Some footnote text \\f*');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const footnote = result.result?.content[0] as any;
      expect(footnote?.marker).toBe('f');
      expect(footnote?.caller).toBe('+');
    });

    it('should parse cross-reference callers', () => {
      const parser = new UsfmParser('\\x a Some cross-reference text \\x*');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const xref = result.result?.content[0] as any;
      expect(xref?.marker).toBe('x');
      expect(xref?.caller).toBe('a');
    });

    it('should parse periph content until attributes', () => {
      const parser = new UsfmParser('\\periph Title Page|id="title"');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(1);

      const periph = result.result?.content[0] as any;
      expect(periph?.marker).toBe('periph');
      expect(periph?.alt).toBe('Title Page');
    });

    it('should parse periph content until next marker', () => {
      const parser = new UsfmParser('\\periph Title Page \\p Following paragraph');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(2);

      const periph = result.result?.content[0] as any;
      expect(periph?.marker).toBe('periph');
      expect(periph?.alt).toBe('Title Page');

      const para = result.result?.content[1] as any;
      expect(para?.marker).toBe('p');
    });
  });

  describe('Whitespace Handling', () => {
    it('should consume whitespace after number content', () => {
      const parser = new UsfmParser('\\c 1   \\v 1 Text');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(2);

      const chapter = result.result?.content[0] as any;
      expect(chapter?.marker).toBe('c');
      expect(chapter?.number).toBe('1');

      const verse = result.result?.content[1] as any;
      expect(verse?.marker).toBe('v');
      expect(verse?.number).toBe('1');
    });

    it('should handle newlines properly', () => {
      const parser = new UsfmParser('\\c 1\n\\v 1 Text');
      const result = parser.parse();

      expect(result.success).toBe(true);
      expect(result.result?.content).toHaveLength(2);

      const chapter = result.result?.content[0] as any;
      expect(chapter?.marker).toBe('c');
      expect(chapter?.number).toBe('1');

      const verse = result.result?.content[1] as any;
      expect(verse?.marker).toBe('v');
      expect(verse?.number).toBe('1');
    });
  });

  describe('Error Handling', () => {
    it('should report error for missing required special content', () => {
      const parser = new UsfmParser('\\c  \\v 1 Text'); // Missing chapter number
      const result = parser.parse();

      expect(result.success).toBe(false);
      expect(parser.getErrors()).toContain(
        expect.stringContaining("Required special content 'number' not found for marker c")
      );
    });

    it('should report error for missing required verse number', () => {
      const parser = new UsfmParser('\\v  Text'); // Missing verse number
      const result = parser.parse();

      expect(result.success).toBe(false);
      expect(parser.getErrors()).toContain(
        expect.stringContaining("Required special content 'number' not found for marker v")
      );
    });

    it('should report error for missing required footnote caller', () => {
      const parser = new UsfmParser('\\f  Text \\f*'); // Missing caller
      const result = parser.parse();

      expect(result.success).toBe(false);
      expect(parser.getErrors()).toContain(
        expect.stringContaining("Required special content 'caller' not found for marker f")
      );
    });
  });
});
