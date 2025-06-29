import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src';
import { USFMFormatterOptions } from '@usfm-tools/formatter';

describe('USFM Normalization Rules', () => {
  let parser: USFMParser;
  let visitor: USFMVisitor;

  beforeEach(() => {
    parser = new USFMParser();
    visitor = new USFMVisitor();
  });

  describe('Paragraph and Content Spacing', () => {
    it('should render paragraph markers and their content on the same line', () => {
      const input = '\\id TIT\\h Titus\\toc1 The Letter to Titus';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      // Split by lines and check each line
      const lines = output.split('\n');
      expect(lines).toEqual(['\\id TIT', '\\h Titus', '\\toc1 The Letter to Titus']);
    });

    it('should render paragraph markers with multiple words content on same line', () => {
      const input = '\\mt1 The Book of Titus\\mt2 New Testament Letter';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual(['\\mt1 The Book of Titus', '\\mt2 New Testament Letter']);
    });
  });

  describe('Verse Spacing Rules', () => {
    it('should render verses on new lines by default', () => {
      const input = '\\id TIT\n\\h Titus\n\\p\\v 1 First verse text\\v 2 Second verse text';
      const ast = parser.load(input).parse();
      ast.visit(visitor);
      const output = visitor.getResult();
      const lines = output.split('\n');
      expect(lines).toEqual([
        '\\id TIT',
        '\\h Titus',
        '\\p',
        '\\v 1 First verse text',
        '\\v 2 Second verse text',
      ]);
    });

    it('should render verses on new lines when the option is enabled', () => {
      const input = '\\p\\v 1 First verse text\\v 2 Second verse text';
      const ast = parser.load(input).parse();

      const visitorWithSpacing = new USFMVisitor({
        formatterOptions: { versesOnNewLine: true },
      });
      ast.visit(visitorWithSpacing);
      const output = visitorWithSpacing.getResult().trim();
      const lines = output.split('\n');
      expect(lines).toEqual(['\\p', '\\v 1 First verse text', '\\v 2 Second verse text']);
    });

    it('should render paragraph without content when first child is verse and option is enabled', () => {
      const input = '\\m\\v 1 Verse content follows paragraph';
      const ast = parser.load(input).parse();
      const visitorWithSpacing = new USFMVisitor({
        formatterOptions: { versesOnNewLine: true },
      });
      ast.visit(visitorWithSpacing);
      const output = visitorWithSpacing.getResult().trim();
      const lines = output.split('\n');
      expect(lines).toEqual(['\\m', '\\v 1 Verse content follows paragraph']);
    });

    it('should handle paragraph with mixed content and verse', () => {
      const input = '\\p Some intro text\\v 1 Verse content';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      // When paragraph has content before verse, content stays on same line
      // but verse goes to new line
      const lines = output.split('\n');
      expect(lines).toEqual(['\\p Some intro text', '\\v 1 Verse content']);
    });
  });

  describe('Chapter and Verse Interaction', () => {
    it('should handle chapter followed by verse properly', () => {
      const input = '\\c 1\\v 1 First verse of chapter';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual(['\\c 1', '\\v 1 First verse of chapter']);
    });

    it('should handle chapter with paragraph and verse', () => {
      const input = '\\c 2\\p\\v 1 Chapter two verse one';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual(['\\c 2', '\\p', '\\v 1 Chapter two verse one']);
    });
  });

  describe('Complex Paragraph Content', () => {
    it('should handle paragraph with character markers on same line', () => {
      const input = '\\p Paul was \\w a|strong="G1520"\\w* \\w servant|strong="G1401"\\w* of God.';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      // Should be on single line
      expect(output).toBe(
        '\\p Paul was \\w a|strong="G1520"\\w* \\w servant|strong="G1401"\\w* of God.'
      );
    });

    it('should handle section headings with content', () => {
      const input = '\\s1 Paul Greeting\\r (2 Corinthians 8:16–24)';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual(['\\s1 Paul Greeting', '\\r (2 Corinthians 8:16–24)']);
    });
  });

  describe('Document Structure', () => {
    it('should handle document start correctly', () => {
      const input = '\\id TIT\\h Titus\\c 1\\p\\v 1 Text';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines[0]).toBe('\\id TIT'); // First line, no leading newline
      expect(lines[1]).toBe('\\h Titus');
      expect(lines[2]).toBe('\\c 1');
      expect(lines[3]).toBe('\\p');
      expect(lines[4]).toBe('\\v 1 Text');
    });

    it('should not have trailing whitespace on lines', () => {
      const input = '\\p Content\\v 1 Verse';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult();

      const lines = output.split('\n');
      lines.forEach((line) => {
        expect(line).toBe(line.trimEnd());
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paragraph markers', () => {
      const input = '\\b\\p Content after break';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual(['\\b', '\\p Content after break']);
    });

    it('should handle consecutive paragraph markers', () => {
      const input = '\\p First paragraph\\p Second paragraph';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual(['\\p First paragraph', '\\p Second paragraph']);
    });

    it('should handle multiple verses in same paragraph', () => {
      const input = '\\p\\v 1 First verse\\v 2 Second verse\\v 3 Third verse';
      const result = parser.load(input).parse().visit(visitor);
      const output = visitor.getResult().trim();

      const lines = output.split('\n');
      expect(lines).toEqual([
        '\\p',
        '\\v 1 First verse',
        '\\v 2 Second verse',
        '\\v 3 Third verse',
      ]);
    });
  });

  describe('Roundtrip Consistency', () => {
    it('should maintain consistency on roundtrip parsing', () => {
      const input =
        '\\id TIT\\h Titus\\c 1\\s1 Greeting\\p\\v 1 Paul was a servant.\\v 2 Grace and peace.';

      // Use normalize-and-trim to ensure consistent whitespace handling
      const visitorWithTrimming = new USFMVisitor({ whitespaceHandling: 'normalize-and-trim' });

      // First pass
      const firstResult = parser.load(input).parse().visit(visitorWithTrimming);
      const firstOutput = visitorWithTrimming.getResult();

      // Second pass (roundtrip)
      visitorWithTrimming.reset();
      const secondResult = parser.load(firstOutput).parse().visit(visitorWithTrimming);
      const secondOutput = visitorWithTrimming.getResult();

      // Compare line by line to avoid minor trailing whitespace differences
      const firstLines = firstOutput.trim().split('\n');
      const secondLines = secondOutput.trim().split('\n');

      expect(secondLines.length).toBe(firstLines.length);
      firstLines.forEach((line, index) => {
        expect(secondLines[index].trim()).toBe(line.trim());
      });
    });
  });
});
