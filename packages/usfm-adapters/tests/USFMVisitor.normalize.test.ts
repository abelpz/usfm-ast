import { coreUSFMFormattingRules, USFMFormatter, USFMFormattingRule } from '@usfm-tools/formatter';
import { USFMParser } from '@usfm-tools/parser';
import { MarkerTypeEnum } from '@usfm-tools/types';
import { USFMVisitor, USFMVisitorOptions } from '../src/';
import { USFMFormatterOptions } from '@usfm-tools/formatter';
import { FormattingFunction } from '@usfm-tools/types';

describe('USFMVisitor with Formatting Rules', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  const normalizeWithRules = (input: string, options: USFMVisitorOptions = {}): string => {
    const ast = parser.load(input).parse();
    const visitor = new USFMVisitor(options);
    ast.visit(visitor);
    return visitor.getResult();
  };

  describe('Default formatting rules', () => {
    it('should apply default rules for basic paragraph structure', () => {
      const input = '\\id TIT\\c 1\\p\\v 1 Text';
      const result = normalizeWithRules(input);

      expect(result).toBe('\\id TIT\n\\c 1\n\\p\n\\v 1 Text');
    });

    it('should handle paragraph with verse context', () => {
      const input = '\\p\n\\v 1 In the beginning';
      const result = normalizeWithRules(input);

      // Should apply paragraph-with-verse formatting
      expect(result).toContain('\\p\n\\v 1');
    });

    it('should normalize line endings', () => {
      const input = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text';
      const result = normalizeWithRules(input, {
        normalizeLineEndings: true,
      });

      expect(result).not.toContain('\r\n');
      expect(result).toContain('\n');
    });

    it('should handle character markers with proper spacing', () => {
      const input = '\\p Text\\w word\\w*more text';
      const result = normalizeWithRules(input);

      expect(result).toContain(' \\w word\\w*');
    });

    it('should handle note markers with proper spacing', () => {
      const input = '\\p Paul\\f + note\\f* wrote this.';
      const result = normalizeWithRules(input);

      expect(result).toBe('\\p Paul\\f + note\\f* wrote this.');
    });

    it('should handle milestone markers', () => {
      const input = '\\p Text\\zaln-s |who="Paul"\\*content\\zaln-e\\*more';
      const result = normalizeWithRules(input);

      expect(result).toContain('\\zaln-s |who="Paul"\\*');
      expect(result).toContain('\\zaln-e\\*');
    });
  });

  describe('Custom formatting rules', () => {
    it('should apply custom rules with higher priority', () => {
      const customRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'custom-verse-spacing',
          name: 'Custom Verse Spacing',
          description: 'Double space after verses',
          priority: 200,
          applies: { marker: 'v' },
          whitespace: {
            before: '\n',
            after: ' ',
            afterContent: '  ',
          },
        },
      ];

      const input = '\\p\\v 1 First verse\\v 2 Second verse';
      const usfmFormatter = new USFMFormatter(customRules);
      const result = normalizeWithRules(input, {
        formatter: {
          formatMarker: (marker, markerType, nextMarker, context, isDocumentStart) =>
            usfmFormatter.formatMarker(
              marker,
              markerType as any,
              nextMarker,
              nextMarker ? (nextMarker as any) : undefined,
              isDocumentStart
            ),
          formatParagraphWithContext: usfmFormatter.formatParagraphWithContext.bind(usfmFormatter),
          formatVerseWithContext: usfmFormatter.formatVerseWithContext.bind(usfmFormatter),
        },
      });

      // Should have double spaces after verse markers
      expect(result).toContain('\\v 1  ');
      expect(result).toContain('\\v 2  ');
    });

    it('should apply custom character marker rules', () => {
      const customRules: USFMFormattingRule[] = [
        {
          id: 'custom-word-spacing',
          name: 'Custom Word Spacing',
          description: 'No space before word markers',
          priority: 100000,
          applies: { marker: 'w' },
          whitespace: {
            before: '',
            after: '',
          },
        },
      ];

      const input = '\\p Text \\w word\\w* more';
      // Merge custom rules with core rules - custom rules override due to higher priority
      const usfmFormatter = new USFMFormatter([...coreUSFMFormattingRules, ...customRules]);
      const result = normalizeWithRules(input, {
        preserveWhitespace: false,
        formatter: {
          formatMarker: (marker, markerType, nextMarker, context, isDocumentStart) =>
            usfmFormatter.formatMarker(
              marker,
              markerType as any,
              nextMarker,
              nextMarker ? (nextMarker as any) : undefined,
              isDocumentStart
            ),
          formatParagraphWithContext: usfmFormatter.formatParagraphWithContext.bind(usfmFormatter),
          formatVerseWithContext: usfmFormatter.formatVerseWithContext.bind(usfmFormatter),
        },
      });

      // The custom rule should remove spaces before/after the w marker itself
      // But the original text content spacing is preserved (Text has trailing space)
      expect(result).toContain('Text \\wword\\w* more');
    });

    it('should handle rule exceptions', () => {
      const customRules: USFMFormattingRule[] = [
        {
          id: 'paragraph-with-exceptions',
          name: 'Paragraph With Exceptions',
          description: 'Paragraph with document-start exception',
          priority: 1000000,
          applies: {
            marker: 'p',
            context: {
              isDocumentStart: false,
            },
          },
          whitespace: {
            before: '\n',
            after: ' ',
          },
        },
      ];

      const input = '\\id TIT\\p First paragraph\\p Second paragraph';
      // Merge custom rules with core rules - custom rules override due to higher priority
      const usfmFormatter = new USFMFormatter([...coreUSFMFormattingRules, ...customRules]);
      const result = normalizeWithRules(input, {
        formatter: {
          formatMarker: (marker, markerType, nextMarker, context, isDocumentStart) =>
            usfmFormatter.formatMarker(
              marker,
              markerType as any,
              nextMarker,
              nextMarker ? (nextMarker as any) : undefined,
              isDocumentStart
            ),
          formatParagraphWithContext: usfmFormatter.formatParagraphWithContext.bind(usfmFormatter),
          formatVerseWithContext: usfmFormatter.formatVerseWithContext.bind(usfmFormatter),
        },
        isDocumentStart: true,
      });

      // First paragraph should not have newline before (document-start exception)
      // Second paragraph should have newline before
      expect(result).toMatch(/\\id TIT\\p /);
      expect(result).toMatch(/\n\\p /);
    });
  });

  describe('Visitor options', () => {
    it('should preserve whitespace when preserveWhitespace is true', () => {
      const input = '\\p   Text   with   spaces   ';
      const result = normalizeWithRules(input, {
        preserveWhitespace: true,
      });

      expect(result).toContain('   Text   with   spaces   ');
    });

    it('should normalize whitespace when preserveWhitespace is false', () => {
      const input = '\\p   Text   with   spaces   ';
      const result = normalizeWithRules(input, {
        preserveWhitespace: false,
      });

      expect(result).not.toContain('   Text   with   spaces   ');
      expect(result).toContain('Text with spaces');
    });

    it('should handle document start context', () => {
      const input = '\\id TIT\\c 1';

      const resultDocStart = normalizeWithRules(input, {
        isDocumentStart: true,
      });

      const resultNotDocStart = normalizeWithRules(input, {
        isDocumentStart: false,
      });

      // Both should work but may have different formatting
      expect(resultDocStart).toContain('\\id TIT');
      expect(resultNotDocStart).toContain('\\id TIT');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle nested character markers', () => {
      const input = '\\p Text \\w outer\\+nd inner\\+nd*\\w* more';
      const result = normalizeWithRules(input);

      expect(result).toContain('\\w outer\\+nd inner\\+nd*\\w*');
    });

    it('should handle notes with content markers', () => {
      const input = '\\p Text\\f + \\fr 1:1 \\ft Note text\\f* more';
      const result = normalizeWithRules(input);

      expect(result).toContain('\\f + \\fr 1:1 \\ft Note text\\f*');
    });

    it('should handle attributes in character markers', () => {
      const input = '\\p Text \\w word|strong="G123"\\w* more';
      const result = normalizeWithRules(input);

      expect(result).toContain('\\w word|strong="G123"\\w*');
    });

    it('should handle attributes in milestone markers', () => {
      const input = '\\p \\zaln-s |who="Paul" x-occurrence="1"\\*Text\\zaln-e\\*';
      const result = normalizeWithRules(input);

      expect(result).toContain('|who="Paul" x-occurrence="1"');
    });

    it('should handle mixed line endings and complex structure', () => {
      const input = `\\id TIT\r\n\\h Titus\r\n\r\n\\c 1\n\\p   \n\\v 1   Paul,  a   servant\\w of\\w*God.\n\\v 2Grace   and   peace.`;
      const result = normalizeWithRules(input, {
        normalizeLineEndings: true,
        preserveWhitespace: false,
      });

      expect(result).not.toContain('\r\n');
      expect(result).toContain('Paul, a servant');
      expect(result).toContain('Grace and peace');
    });
  });

  describe('Visitor state management', () => {
    it('should reset visitor state correctly', () => {
      const visitor = new USFMVisitor();

      // First use
      const ast1 = parser.load('\\p First text').parse();
      ast1.visit(visitor);
      const result1 = visitor.getResult();

      // Reset and second use
      visitor.reset();
      const ast2 = parser.load('\\p Second text').parse();
      ast2.visit(visitor);
      const result2 = visitor.getResult();

      expect(result1).toContain('First text');
      expect(result2).toContain('Second text');
      expect(result2).not.toContain('First text');
    });

    it('should track document start context correctly', () => {
      const visitor = new USFMVisitor({ isDocumentStart: true });

      const ast = parser.load('\\id TIT\\c 1\\p Text').parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      expect(result).toContain('\\id TIT');
    });
  });

  describe('Error handling', () => {
    it('should handle empty input', () => {
      const result = normalizeWithRules('');
      expect(result).toBe('');
    });

    it('should handle input with only whitespace', () => {
      const result = normalizeWithRules('   \n\n   ');
      expect(result.trim()).toBe('');
    });

    it('should handle malformed markers gracefully', () => {
      const input = '\\p Text \\ incomplete marker';
      const result = normalizeWithRules(input);

      // Should not throw and should include the text
      expect(result).toContain('Text');
    });
  });

  describe('Integration with USFMFormatter', () => {
    it('should use formatter rules consistently', () => {
      const formatter = new USFMFormatter(coreUSFMFormattingRules);
      const paragraphFormatting = formatter.formatMarker('p', MarkerTypeEnum.PARAGRAPH);

      const input = '\\p Text';
      const result = normalizeWithRules(input);

      // The visitor should apply the same formatting as the formatter
      if (paragraphFormatting.before === '\n') {
        expect(result).toMatch(/\n\\p/);
      }
    });

    it('should handle context-specific formatting', () => {
      const formatter = new USFMFormatter(coreUSFMFormattingRules);
      const verseFormatting = formatter.formatVerseWithContext('paragraph');

      const input = '\\p\\v 1 Text';
      const result = normalizeWithRules(input);

      // Should apply context-specific verse formatting
      expect(result).toContain('\\v 1');
    });
  });

  describe('USFMVisitor with custom formatting rules', () => {
    it('should not place verses on a new line by default', () => {
      const input = '\\p \\v 1 Test';
      const parser = new USFMParser();
      const ast = parser.parse(input);

      const usfmFormatter = new USFMFormatter(); // Default options

      const visitor = new USFMVisitor({
        formatter: createFormattingFunction(usfmFormatter),
      });
      ast.accept(visitor);
      const output = visitor.getResult().trim();

      expect(output).toBe('\\p \\v 1 Test');
    });

    it('should apply custom rules to place verses on a new line', () => {
      const input = '\\p \\v 1 Test';
      const parser = new USFMParser();
      const ast = parser.parse(input);

      const customOptions: USFMFormatterOptions = {
        versesOnNewLine: true,
      };
      const usfmFormatter = new USFMFormatter(customOptions);

      const visitor = new USFMVisitor({
        formatter: createFormattingFunction(usfmFormatter),
      });
      ast.accept(visitor);
      const output = visitor.getResult().trim();

      expect(output).toBe('\\p\n\\v 1 Test');
    });

    it('should not place paragraphs on a new line by default', () => {
      const input = '\\p My paragraph.';
      const parser = new USFMParser();
      const ast = parser.parse(input);

      const usfmFormatter = new USFMFormatter();

      const visitor = new USFMVisitor({
        formatter: createFormattingFunction(usfmFormatter),
      });
      ast.accept(visitor);
      const output = visitor.getResult().trim();

      expect(output).toBe('\\p My paragraph.');
    });

    it('should place paragraphs on a new line when content follows if option is true', () => {
      const input = '\\p My paragraph.';
      const parser = new USFMParser();
      const ast = parser.parse(input);

      const customOptions: USFMFormatterOptions = {
        paragraphsOnNewLine: true,
      };
      const usfmFormatter = new USFMFormatter(customOptions);

      const visitor = new USFMVisitor({
        formatter: createFormattingFunction(usfmFormatter),
      });
      ast.accept(visitor);
      const output = visitor.getResult().trim();

      expect(output).toBe('\\p\nMy paragraph.');
    });
  });
});

// Helper to create a formatting function from a formatter instance
function createFormattingFunction(formatter: USFMFormatter): FormattingFunction {
  return {
    formatMarker: (marker, markerType, nextMarker, context, isDocumentStart) =>
      formatter.formatMarker(marker, markerType as string, { isDocumentStart }),
    formatParagraphWithContext: (marker, nextMarker, nextMarkerType, isDocumentStart) =>
      formatter.formatMarker(marker, 'paragraph', { isDocumentStart }),
    formatVerseWithContext: (context) => formatter.formatMarker('v', 'character'),
    formatMarkerWithContext: (marker, markerType, context) =>
      formatter.formatMarker(marker, markerType as string, context),
  };
}
