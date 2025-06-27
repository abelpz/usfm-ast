import {
  normalizeUSFM,
  normalizeUSFMSimple,
  coreUSFMFormattingRules,
  USFMFormattingRule,
  USFMVisitor,
  USFMParser,
} from '../index';

describe('USFM Normalization Examples', () => {
  describe('Basic Usage Examples', () => {
    it('should demonstrate simple normalization', () => {
      const messyInput = `\\id   TIT\r\n\r\n\\c  1\n\n\n\\p\n\n\\v 1   Paul,  a   servant\\w of\\w*God.`;

      const cleanOutput = normalizeUSFM(messyInput);

      expect(cleanOutput).toBe('\\id TIT\n\\c 1\n\\p\n\\v 1  Paul, a servant \\w of\\w* God.');
    });

    it('should demonstrate custom rules usage', () => {
      const customRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'example-custom-verse-spacing',
          description: 'Add extra space after verse markers for readability',
          priority: 200,
          applies: { marker: 'v' },
          whitespace: {
            before: { type: 'newline' },
            after: { type: 'space', count: 2 }, // Double space for readability
          },
        },
      ];

      const input = '\\p\\v 1 First verse\\v 2 Second verse';

      const defaultResult = normalizeUSFM(input);
      const customResult = normalizeUSFM(input, undefined, customRules);

      expect(defaultResult).toContain('\\v 1 '); // Single space
      expect(customResult).toContain('\\v 1  '); // Double space
      expect(customResult).toContain('\\v 2  '); // Double space
    });

    it('should demonstrate visitor options', () => {
      const input = '\\p   Text   with   irregular   spacing   ';

      // Preserve whitespace
      const preservedResult = normalizeUSFM(
        input,
        {
          customMarkers: undefined,
        },
        [
          {
            id: 'preserve-test',
            description: 'Test preserving whitespace',
            priority: 100,
            applies: { type: 'paragraph' },
            whitespace: { before: { type: 'none' }, after: { type: 'preserve' } },
          },
        ]
      );

      // Normalize whitespace (default)
      const normalizedResult = normalizeUSFM(input);

      expect(normalizedResult).toContain('Text with irregular spacing');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle Bible text normalization', () => {
      const bibleText = `\\id MAT\r\n\\h Matthew\r\n\\c 1\n\\p\n\\v 1 The book of the genealogy of Jesus Christ, the son of David, the son of Abraham.\n\\v 2 Abraham became the father of Isaac, Isaac became the father of Jacob, and Jacob became the father of Judah and his brothers.`;

      const normalized = normalizeUSFM(bibleText);

      expect(normalized).toMatch(/^\\id MAT\n\\h Matthew\n\\c 1\n\\p\n\\v 1/);
      expect(normalized).toContain('Jesus Christ');
      expect(normalized).toContain('\\v 2');
      expect(normalized).not.toContain('\r\n');
    });

    it('should handle complex markup with footnotes and cross-references', () => {
      const complexText = `\\p Paul\\f + \\fr 1:1 \\ft Apostle\\f* wrote to \\w Titus\\w*, his \\x + \\xo 1:1 \\xt 2Ti 1:2\\x* true child in the faith.`;

      const normalized = normalizeUSFM(complexText);

      expect(normalized).toContain('\\f + \\fr 1:1 \\ft Apostle\\f*');
      expect(normalized).toContain('\\w Titus\\w*');
      expect(normalized).toContain('\\x + \\xo 1:1 \\xt 2Ti 1:2\\x*');
    });

    it('should handle poetry and special formatting', () => {
      const poetryText = `\\q1 The Lord is my shepherd,\n\\q2 I shall not want.\n\\q1 He makes me lie down in green pastures;\n\\q2 He leads me beside quiet waters.`;

      const normalized = normalizeUSFM(poetryText);

      expect(normalized).toContain('\\q1');
      expect(normalized).toContain('\\q2');
      expect(normalized).toContain('shepherd');
      expect(normalized).toContain('quiet waters');
    });

    it('should handle table structures', () => {
      const tableText = `\\p\n\\tr \\th1 Name \\th2 Age \\th3 City\n\\tr \\tc1 John \\tc2 25 \\tc3 New York\n\\tr \\tc1 Mary \\tc2 30 \\tc3 Boston`;

      const normalized = normalizeUSFM(tableText);

      expect(normalized).toContain('\\tr');
      expect(normalized).toContain('\\th1 Name');
      expect(normalized).toContain('\\tc1 John');
    });
  });

  describe('Advanced Configuration Examples', () => {
    it('should demonstrate organization-specific formatting rules', () => {
      // Example: Organization wants extra spacing around notes for print layout
      const organizationRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'org-note-spacing',
          description: 'Extra spacing around notes for print layout',
          priority: 200,
          applies: { type: 'note' },
          whitespace: {
            before: { type: 'space', count: 2 },
            after: { type: 'space', count: 2 },
          },
        },
      ];

      const input = '\\p Text\\f + note\\f*more text';
      const result = normalizeUSFM(input, undefined, organizationRules);

      expect(result).toContain('Text  \\f + note\\f*  more');
    });

    it('should demonstrate translation-specific rules', () => {
      // Example: Some translations prefer verses on new lines
      const translationRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'translation-verse-newline',
          description: 'Put each verse on a new line for readability',
          priority: 200,
          applies: { marker: 'v' },
          whitespace: {
            before: { type: 'newline' },
            after: { type: 'space', count: 1 },
          },
        },
      ];

      const input = '\\p\\v 1 First verse\\v 2 Second verse\\v 3 Third verse';
      const result = normalizeUSFM(input, undefined, translationRules);

      expect(result).toMatch(/\\p\n\\v 1 First verse\n\\v 2 Second verse\n\\v 3 Third verse/);
    });

    it('should demonstrate conditional formatting based on context', () => {
      // Example: Different spacing for paragraphs followed by verses vs text
      const contextualRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'contextual-paragraph',
          description: 'Context-aware paragraph formatting',
          priority: 150,
          applies: { type: 'paragraph' },
          whitespace: {
            before: { type: 'newline' },
            after: { type: 'space' },
          },
          exceptions: [
            {
              context: 'paragraph-with-verse',
              whitespace: {
                after: { type: 'newline' }, // Newline before verse
              },
            },
          ],
        },
      ];

      const input = '\\p\\v 1 Verse content\\p Text content';
      const result = normalizeUSFM(input, undefined, contextualRules);

      // Should apply different spacing based on what follows the paragraph
      expect(result).toContain('\\p\n\\v 1');
    });
  });

  describe('Performance Comparisons', () => {
    it('should demonstrate performance differences', () => {
      const largeInput =
        `\\id GEN\n\\c 1\n\\p\n` +
        Array.from(
          { length: 100 },
          (_, i) => `\\v ${i + 1} This is verse ${i + 1} with some content.`
        ).join('\n');

      // Time simple normalization
      const simpleStart = Date.now();
      const simpleResult = normalizeUSFMSimple(largeInput);
      const simpleTime = Date.now() - simpleStart;

      // Time rules-based normalization
      const rulesStart = Date.now();
      const rulesResult = normalizeUSFM(largeInput);
      const rulesTime = Date.now() - rulesStart;

      // Both should complete quickly
      expect(simpleTime).toBeLessThan(1000);
      expect(rulesTime).toBeLessThan(1000);

      // Both should produce valid output
      expect(simpleResult).toContain('\\id GEN');
      expect(rulesResult).toContain('\\id GEN');
      expect(simpleResult).toContain('\\v 100');
      expect(rulesResult).toContain('\\v 100');
    });
  });

  describe('Error Recovery Examples', () => {
    it('should demonstrate graceful handling of malformed input', () => {
      const malformedInput = `\\id TIT\n\\c 1\n\\p\n\\v 1 Text\n\\ incomplete\n\\v 2 More text`;

      // Should not throw errors
      expect(() => normalizeUSFM(malformedInput)).not.toThrow();
      expect(() => normalizeUSFMSimple(malformedInput)).not.toThrow();

      const result = normalizeUSFM(malformedInput);

      // Should preserve valid content
      expect(result).toContain('\\id TIT');
      expect(result).toContain('\\v 1 Text');
      expect(result).toContain('\\v 2 More text');
    });

    it('should demonstrate handling of unknown markers', () => {
      const unknownMarkersInput = `\\id TIT\n\\customMarker Content\n\\p Normal paragraph\n\\anotherCustom More content`;

      const result = normalizeUSFM(unknownMarkersInput);

      // Should handle unknown markers gracefully
      expect(result).toContain('\\id TIT');
      expect(result).toContain('\\p Normal paragraph');
      // Unknown markers should be preserved as-is or handled gracefully
    });
  });

  describe('Integration Examples', () => {
    it('should demonstrate integration with parser and visitor', () => {
      const input = '\\id TIT\n\\c 1\n\\p\n\\v 1 Paul, a servant of God.';

      // Manual process using parser and visitor
      const parser = new USFMParser();
      const ast = parser.load(input).parse();

      const visitor = new USFMVisitor({
        formattingRules: coreUSFMFormattingRules,
        normalizeLineEndings: true,
        preserveWhitespace: false,
      });

      ast.visit(visitor);
      const manualResult = visitor.getResult();

      // Should match the convenience function
      const convenientResult = normalizeUSFM(input);

      expect(manualResult).toBe(convenientResult);
    });

    it('should demonstrate reusable visitor configuration', () => {
      const customVisitor = new USFMVisitor({
        formattingRules: coreUSFMFormattingRules,
        normalizeLineEndings: true,
        preserveWhitespace: false,
      });

      const inputs = [
        '\\id MAT\n\\c 1\n\\p\n\\v 1 Text',
        '\\id MRK\n\\c 1\n\\p\n\\v 1 Different text',
        '\\id LUK\n\\c 1\n\\p\n\\v 1 Another text',
      ];

      const results = inputs.map((input) => {
        const parser = new USFMParser();
        const ast = parser.load(input).parse();

        customVisitor.reset(); // Reset for reuse
        ast.visit(customVisitor);
        return customVisitor.getResult();
      });

      // All results should be properly formatted
      results.forEach((result, index) => {
        expect(result).toContain('\\id');
        expect(result).toContain('\\c 1');
        expect(result).toContain('\\v 1');
      });
    });
  });
});
