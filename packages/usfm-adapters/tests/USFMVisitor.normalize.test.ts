import { USFMFormatter, USFMFormatterOptions } from '@usfm-tools/formatter';
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor, USFMVisitorOptions } from '../src/';

describe('USFMVisitor with New Formatter API', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  const normalizeWithOptions = (input: string, options: USFMVisitorOptions = {}): string => {
    const ast = parser.load(input).parse();
    const visitor = new USFMVisitor(options);
    ast.visit(visitor);
    return visitor.getResult();
  };

  describe('Default formatting behavior', () => {
    it('should apply default formatting for basic structure', () => {
      const input = '\\id TIT\\c 1\\p\\v 1 Text';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\id TIT\\c 1\n\\p\n\\v 1 Text');
    });

    it('should handle paragraph with verse context', () => {
      const input = '\\p\\v 1 In the beginning';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p\n\\v 1 In the beginning');
    });

    it('should normalize line endings', () => {
      const input = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text';
      const result = normalizeWithOptions(input, {
        normalizeLineEndings: true,
      });

      expect(result).not.toContain('\r\n');
      expect(result).toContain('\n');
    });

    it('should handle character markers with proper spacing', () => {
      const input = '\\p Text\\w word\\w*more text';
      const result = normalizeWithOptions(input);

      // Formatter should NOT add spaces - output should match input spacing
      expect(result).toBe('\\p Text\\w word\\w*more text');
    });

    it('should handle note markers with proper spacing', () => {
      const input = '\\p Paul\\f + note\\f* wrote this.';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p Paul\\f  +  note\\f* wrote this.');
    });

    it('should handle milestone markers', () => {
      const input = '\\p Text\\zaln-s |who="Paul"\\*content\\zaln-e\\*more';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p Text\\zaln-s |who="Paul"\\*content\\zaln-e\\*more');
    });
  });

  describe('Custom formatting options', () => {
    it('should apply custom formatter options', () => {
      const input = '\\p\\v 1 First verse\\v 2 Second verse';
      const result = normalizeWithOptions(input, {
        formatterOptions: {
          versesOnNewLine: true,
          paragraphContentOnNewLine: false,
        },
      });

      expect(result).toContain('\\p\n\\v 1');
      expect(result).toContain('\n\\v 2');
    });

    it('should handle custom spacing options', () => {
      const input = '\\p Text \\w word\\w* more';
      const result = normalizeWithOptions(input, {
        formatterOptions: {
          characterMarkersOnNewLine: true,
        },
      });

      expect(result).toContain('\n\\w word\\w*');
    });
  });

  describe('Visitor options', () => {
    it('should preserve whitespace when whitespaceHandling is preserve', () => {
      const input = '\\p   Text   with   spaces   ';
      const result = normalizeWithOptions(input, {
        whitespaceHandling: 'preserve',
      });

      // The parser normalizes spaces between marker and content to 1 space
      // When whitespaceHandling='preserve', we preserve the parsed content as-is
      expect(result).toBe('\\p  Text   with   spaces   ');
    });

    it('should normalize whitespace when whitespaceHandling is normalize-and-trim', () => {
      const input = '\\p   Text   with   spaces   ';
      const result = normalizeWithOptions(input, {
        whitespaceHandling: 'normalize-and-trim',
      });

      expect(result).toBe('\\p Text with spaces');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle nested character markers', () => {
      const input = '\\p Text \\w outer\\+nd inner\\+nd*\\w* more';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p Text \\w outer\\+nd inner\\+nd*\\w* more');
    });

    it('should handle notes with content markers', () => {
      const input = '\\p Text\\f + \\fr 1:1 \\ft Note text\\f* more';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p Text\\f  +  \\fr 1:1 \\ft Note text\\f* more');
    });

    it('should handle attributes in character markers', () => {
      const input = '\\p Text \\w word|strong="G123"\\w* more';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p Text \\w word|strong="G123"\\w* more');
    });

    it('should handle attributes in milestone markers', () => {
      const input = '\\p \\zaln-s |who="Paul" x-occurrence="1"\\*Text\\zaln-e\\*';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p \\zaln-s |who="Paul" x-occurrence="1"\\*Text\\zaln-e\\*');
    });

    it('should handle mixed line endings and complex structure', () => {
      const input = `\\id TIT \r\n\\h Titus \r\n\r\n\\c 1\n\\p   \n\\v 1   Paul,  a   servant\\w of\\w*God.\n\\v 2 Grace   and   peace.`;
      const result = normalizeWithOptions(input, {
        normalizeLineEndings: false,
        whitespaceHandling: 'normalize-and-trim',
      });

      expect(result).not.toContain('\r\n');
      expect(result).toBe(
        '\\id TIT\n\\h Titus\n\\c 1\n\\p\n\\v 1 Paul, a servant\\w of\\w*God.\n\\v 2 Grace and peace.'
      );
      expect(result).toContain('Paul, a servant');
      expect(result).toContain('Grace and peace');
    });

    it('should not add a space before or after a character marker', () => {
      const input = '\\p\n\\v 1 Text\\w word\\w*more';
      const result = normalizeWithOptions(input);

      expect(result).toBe('\\p\n\\v 1 Text\\w word\\w*more');
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

      expect(result1).toBe('\\p First text');
      expect(result2).toBe('\\p Second text');
      expect(result2).not.toContain('First text');
    });
  });

  describe('Error handling', () => {
    it('should handle empty input', () => {
      const result = normalizeWithOptions('');
      expect(result).toBe('');
    });

    it('should handle input with only whitespace', () => {
      const result = normalizeWithOptions('   \n\n   ');
      expect(result.trim()).toBe('');
    });
  });

  describe('Integration with USFMFormatter', () => {
    it('should use formatter options consistently', () => {
      const input = '\\p\\v 1 Text';

      const result1 = normalizeWithOptions(input, {
        formatterOptions: { versesOnNewLine: true },
      });

      const result2 = normalizeWithOptions(input, {
        formatterOptions: { versesOnNewLine: false },
      });

      expect(result1).toBe('\\p\n\\v 1 Text');
      expect(result2).toBe('\\p \\v 1 Text');
    });
  });
});
