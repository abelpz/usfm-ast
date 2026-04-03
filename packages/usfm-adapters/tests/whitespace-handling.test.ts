import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor, WhitespaceHandling } from '../src/usfm';

describe('Whitespace Handling API', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  const testInput = '\\p   Text   with   multiple   spaces   ';

  describe('new whitespaceHandling API', () => {
    it('should handle preserve strategy', () => {
      const visitor = new USFMVisitor({ whitespaceHandling: 'preserve' });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Preserves all whitespace (multiple spaces + edges)
      expect(result).toBe('\\p  Text   with   multiple   spaces   ');
    });

    it('should handle normalize strategy', () => {
      const visitor = new USFMVisitor({ whitespaceHandling: 'normalize' });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Multiple spaces → single spaces, keep edges
      expect(result).toBe('\\p  Text with multiple spaces ');
    });

    it('should handle trim-edges strategy', () => {
      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Keep multiple spaces, trim paragraph edges
      expect(result).toBe('\\p Text   with   multiple   spaces');
    });

    it('should handle normalize-and-trim strategy', () => {
      const visitor = new USFMVisitor({ whitespaceHandling: 'normalize-and-trim' });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Multiple spaces → single + trim edges
      expect(result).toBe('\\p Text with multiple spaces');
    });

    it('should default to normalize-and-trim when no option provided', () => {
      const visitor = new USFMVisitor();
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Default behavior: normalize spaces and trim edges
      expect(result).toBe('\\p Text with multiple spaces');
    });
  });

  describe('backward compatibility', () => {
    it('should map preserveWhitespace: false to normalize', () => {
      const visitor = new USFMVisitor({ preserveWhitespace: false });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      expect(result).toBe('\\p  Text with multiple spaces ');
    });

    it('should map preserveWhitespace: true to preserve', () => {
      const visitor = new USFMVisitor({ preserveWhitespace: true });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      expect(result).toBe('\\p  Text   with   multiple   spaces   ');
    });

    it('should map trimParagraphEdges: true to normalize-and-trim', () => {
      const visitor = new USFMVisitor({ trimParagraphEdges: true });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      expect(result).toBe('\\p Text with multiple spaces');
    });

    it('should map preserveWhitespace: true + trimParagraphEdges: true to trim-edges', () => {
      const visitor = new USFMVisitor({
        preserveWhitespace: true,
        trimParagraphEdges: true,
      });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      expect(result).toBe('\\p Text   with   multiple   spaces');
    });

    it('should prioritize whitespaceHandling over legacy options', () => {
      const visitor = new USFMVisitor({
        whitespaceHandling: 'preserve',
        preserveWhitespace: false, // Should be ignored
        trimParagraphEdges: true, // Should be ignored
      });
      const ast = parser.load(testInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should use whitespaceHandling: 'preserve' and ignore legacy options
      expect(result).toBe('\\p  Text   with   multiple   spaces   ');
    });
  });

  describe('edge cases', () => {
    it('should handle complex content with all strategies', () => {
      const complexInput = '\\p  \\w Grace\\w*   and   \\w peace\\w*  ';

      const strategies: WhitespaceHandling[] = [
        'preserve',
        'normalize',
        'trim-edges',
        'normalize-and-trim',
      ];
      const expected = [
        '\\p \\w Grace\\w*   and   \\w peace\\w*  ', // preserve
        '\\p \\w Grace\\w* and \\w peace\\w* ', // normalize
        '\\p \\w Grace\\w*   and   \\w peace\\w*', // trim-edges
        '\\p \\w Grace\\w* and \\w peace\\w*', // normalize-and-trim
      ];

      strategies.forEach((strategy, index) => {
        const visitor = new USFMVisitor({ whitespaceHandling: strategy });
        const ast = parser.load(complexInput).parse();
        ast.visit(visitor);
        const result = visitor.getResult();

        expect(result).toBe(expected[index]);
      });
    });

    it('should handle non-paragraph contexts correctly', () => {
      const footnoteInput = '\\f +  \\fr 1:2  \\ft Note with spaces  \\f*';

      const visitor = new USFMVisitor({ whitespaceHandling: 'trim-edges' });
      const ast = parser.load(footnoteInput).parse();
      ast.visit(visitor);
      const result = visitor.getResult();

      // Should not trim footnote content (only paragraph edges)
      expect(result).toBe('\\f + \\fr 1:2  \\ft Note with spaces  \\f*');
    });
  });
});
 