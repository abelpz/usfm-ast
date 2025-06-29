import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src/';

describe('USFMVisitor Whitespace Handling', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  describe('when whitespaceHandling is normalize (default)', () => {
    it('should preserve significant whitespace', () => {
      const input = '\\p  Text with leading and trailing spaces  ';

      const visitor = new USFMVisitor({
        whitespaceHandling: 'preserve',
      });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Preserves trailing space (formatter adds structural space after \p)
      expect(result).toBe('\\p Text with leading and trailing spaces  ');
    });

    it('should apply normal formatting without edge trimming', () => {
      const input = '\\p  \\w Grace\\w* and \\w peace\\w*  ';

      const visitor = new USFMVisitor({ whitespaceHandling: 'normalize' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Normal formatting applies (spaces normalized) but no edge trimming
      expect(result).toBe('\\p \\w Grace\\w* and \\w peace\\w* ');
    });
  });

  describe('when whitespaceHandling is trim-edges', () => {
    it('should trim leading whitespace from first child text node', () => {
      const input = '\\p  Text with leading spaces';

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should trim leading spaces
      expect(result).toBe('\\p Text with leading spaces');
    });

    it('should trim trailing whitespace from last child text node', () => {
      const input = '\\p Text with trailing spaces  ';

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should trim trailing spaces
      expect(result).toBe('\\p Text with trailing spaces');
    });

    it('should trim both leading and trailing whitespace from single text node', () => {
      const input = '\\p  Text with both leading and trailing  ';

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should trim both leading and trailing spaces
      expect(result).toBe('\\p Text with both leading and trailing');
    });

    it('should preserve internal whitespace while trimming edges', () => {
      const input = '\\p  \\w Grace\\w* and \\w peace\\w*  ';

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should trim leading and trailing spaces but preserve internal spacing
      expect(result).toBe('\\p \\w Grace\\w* and \\w peace\\w*');
    });

    it('should not trim whitespace from non-paragraph contexts', () => {
      const input = '\\f +  \\fr 1:2  \\ft Note with spaces  \\f*';

      const visitor = new USFMVisitor({
        whitespaceHandling: 'trim-edges', // Preserve spaces, trim only paragraph edges
      });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Footnote spaces preserved as they exist in the input (two spaces between 1:2 and \ft)
      expect(result).toBe('\\f + \\fr 1:2  \\ft Note with spaces  \\f*');
    });

    it('should handle mixed text and character markers correctly', () => {
      const input = '\\p  Text \\w before\\w* middle \\w after\\w* end  ';

      const visitor = new USFMVisitor({ whitespaceHandling: 'normalize-and-trim' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should trim only the first and last text nodes
      expect(result).toBe('\\p Text \\w before\\w* middle \\w after\\w* end');
    });

    it('should work with trim-edges option', () => {
      const input = '\\p   Text   with   multiple   spaces   ';

      const visitor = new USFMVisitor({
        whitespaceHandling: 'trim-edges',
      });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should preserve multiple internal spaces but trim edges
      expect(result).toBe('\\p Text   with   multiple   spaces');
    });

    it('should work with normalize-and-trim option', () => {
      const input = '\\p   Text   with   multiple   spaces   ';

      const visitor = new USFMVisitor({
        whitespaceHandling: 'normalize-and-trim',
      });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should normalize multiple spaces AND trim edges
      expect(result).toBe('\\p Text with multiple spaces');
    });
  });

  describe('edge cases', () => {
    it('should handle empty text nodes gracefully', () => {
      const input = '\\p \\w word\\w*';

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should work normally without text nodes to trim
      expect(result).toBe('\\p \\w word\\w*');
    });

    it('should handle text nodes that become empty after trimming', () => {
      const input = '\\p    '; // Only whitespace

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should result in just the paragraph marker (formatter adds its own space)
      expect(result).toBe('\\p ');
    });

    it('should work with multiple paragraph types', () => {
      const testCases = [
        { input: '\\p  text  ', expected: '\\p text' },
        { input: '\\q  text  ', expected: '\\q text' },
        { input: '\\m  text  ', expected: '\\m text' },
        { input: '\\s1  text  ', expected: '\\s1 text' },
      ];

      testCases.forEach(({ input, expected }) => {
        const visitor = new USFMVisitor({ whitespaceHandling: 'normalize-and-trim' });
        const ast = parser.load(input).parse();
        ast.visit(visitor);
        const result = visitor.getResult();

        expect(result).toBe(expected);
      });
    });
  });
});
