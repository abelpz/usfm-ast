import { USFMParser } from '../index';

describe('USFMParser Normalize', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  const normalize = (input: string): string => {
    parser.load(input);
    parser.normalize();
    return parser.getInput();
  };

  describe('Line ending normalization', () => {
    it('converts CRLF to LF', () => {
      const input = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text';
      const expected = '\\id TIT\n\\c 1\n\\p\\v 1 Text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('converts CR to LF', () => {
      const input = '\\id TIT\r\\c 1\r\\p\r\\v 1 Text';
      const expected = '\\id TIT\n\\c 1\n\\p\\v 1 Text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('preserves LF', () => {
      const input = '\\id TIT\n\\c 1\n\\p\n\\v 1 Text';
      const expected = '\\id TIT\n\\c 1\n\\p\\v 1 Text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Paragraph marker whitespace normalization', () => {
    it('collapses multiple newlines between paragraph markers', () => {
      const input = '\\id TIT\n\n\n\\c 1';
      const expected = '\\id TIT\n\\c 1';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('normalizes spaces and newlines before paragraph markers', () => {
      const input = '\\id TIT   \n  \\c 1';
      const expected = '\\id TIT \n\\c 1';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('preserves single newline between paragraph markers', () => {
      const input = '\\id TIT\n\\c 1';
      const expected = '\\id TIT\n\\c 1';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Character and note marker whitespace normalization', () => {
    it('preserves spacing around character markers', () => {
      const input = '\\p Text \\w word\\w* more';
      const expected = '\\p Text \\w word\\w* more';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('preserves spacing around note markers', () => {
      const input = '\\p Text \\f + note\\f* more';
      const expected = '\\p Text \\f + note\\f* more';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('adds space between consecutive markers', () => {
      const input = '\\p\\w word\\w*';
      const expected = '\\p \\w word\\w*';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Verse marker special handling', () => {
    it('removes newline before verse marker after paragraph', () => {
      const input = '\\p\n\\v 1 text';
      const expected = '\\p\\v 1 text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('removes newline before verse marker in basic structure', () => {
      const input = '\\id TIT\n\\c 1\n\\p\n\\v 1 Text';
      const expected = '\\id TIT\n\\c 1\n\\p\\v 1 Text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles consecutive paragraph and verse markers', () => {
      const input = '\\p\\v 1 text';
      const expected = '\\p \\v 1 text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Word spacing normalization', () => {
    it('normalizes multiple spaces between words to single space', () => {
      const input = '\\p word1    word2     word3';
      const expected = '\\p word1 word2 word3';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('normalizes mixed whitespace (tabs and spaces) to single space', () => {
      const input = '\\p word1\t  \t word2';
      const expected = '\\p word1 word2';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('preserves single spaces between words', () => {
      const input = '\\p word1 word2 word3';
      const expected = '\\p word1 word2 word3';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Complex scenarios', () => {
    it('handles real-world USFM structure', () => {
      const input = `\\id TIT
\\c 1
\\p
\\v 1 Paul, a servant of God.`;
      const expected = `\\id TIT
\\c 1
\\p\\v 1 Paul, a servant of God.`;

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles mixed line endings and whitespace', () => {
      const input = '\\id TIT\r\n\\h Titus\r\n\r\n\\c 1\n\\p   \n\\v 1 Text';
      const expected = '\\id TIT\n\\h Titus\n\\c 1\n\\p \\v 1 Text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles character markers within paragraphs', () => {
      const input = '\\p In the \\w beginning\\w* was the \\w word\\w*.';
      const expected = '\\p In the \\w beginning\\w* was the \\w word\\w*.';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles notes within paragraphs', () => {
      const input = '\\p Paul\\f + \\fr 1:1 \\ft Apostle\\f* wrote this.';
      const expected = '\\p Paul \\f + \\fr 1:1 \\ft Apostle\\f* wrote this.';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles multiple verses with mixed whitespace', () => {
      const input = `\\p
\\v 1 First verse.  
\\v 2   Second verse.
\\v 3    Third verse.`;
      const expected = `\\p\\v 1 First verse. \\v 2 Second verse.\\v 3 Third verse.`;

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Edge cases', () => {
    it('handles empty input', () => {
      const input = '';
      const expected = '';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles input with only whitespace', () => {
      const input = '   \n\n\t  ';
      const expected = ' \n';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles backslash without marker', () => {
      const input = '\\p Text with \\ backslash';
      const expected = '\\p Text with \\ backslash';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('handles consecutive backslashes', () => {
      const input = '\\p Text with \\\\ double backslash';
      const expected = '\\p Text with \\\\ double backslash';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });

  describe('Preservation of content integrity', () => {
    it('does not modify marker names', () => {
      const input = '\\id TIT\n\\h Titus\n\\mt Major Theme\n\\c 1\n\\p\n\\v 1 Text';
      const result = parser.load(input).normalize().getInput();

      expect(result).toContain('\\id TIT');
      expect(result).toContain('\\h Titus');
      expect(result).toContain('\\mt Major Theme');
      expect(result).toContain('\\c 1');
      expect(result).toContain('\\p');
      expect(result).toContain('\\v 1 Text');
    });

    it('preserves marker attributes and content', () => {
      const input = '\\p \\w word|strong="G1234"\\w* and \\f + \\fr 1:1 \\ft note\\f* text';
      const expected = '\\p \\w word|strong="G1234"\\w* and \\f + \\fr 1:1 \\ft note\\f* text';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });

    it('preserves exact text content', () => {
      const input = '\\p This is "quoted text" and this is (parenthetical).';
      const expected = '\\p This is "quoted text" and this is (parenthetical).';

      parser.load(input).normalize();
      expect(parser.getInput()).toBe(expected);
    });
  });
});
