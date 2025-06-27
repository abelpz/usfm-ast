import {
  normalizeUSFM,
  normalizeUSFMSimple,
  coreUSFMFormattingRules,
  USFMFormattingRule,
} from '../index';

describe('USFM Normalization Functions', () => {
  describe('normalizeUSFM (rules-based)', () => {
    it('should normalize basic USFM structure', () => {
      const input = '\\id TIT\\c 1\\p\\v 1 Text';
      const result = normalizeUSFM(input);

      expect(result).toMatch(/\\id TIT\n\\c 1\n\\p/);
      expect(result).toContain('\\v 1');
      expect(result).toContain('Text');
    });

    it('should handle line ending normalization', () => {
      const input = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text';
      const result = normalizeUSFM(input);

      expect(result).not.toContain('\r\n');
      expect(result).toContain('\n');
    });

    it('should normalize whitespace', () => {
      const input = '\\p   Text   with   multiple   spaces   ';
      const result = normalizeUSFM(input);

      expect(result).not.toContain('   Text   with   multiple   spaces   ');
      expect(result).toContain('Text with multiple spaces');
    });

    it('should handle character markers', () => {
      const input = '\\p Text\\w word\\w*more text';
      const result = normalizeUSFM(input);

      expect(result).toMatch(/\\p.*\\w word\\w.*more text/);
    });

    it('should handle note markers', () => {
      const input = '\\p Paul\\f + \\fr 1:1 \\ft note\\f*wrote';
      const result = normalizeUSFM(input);

      expect(result).toContain('\\f + \\fr 1:1 \\ft note\\f*');
    });

    it('should handle milestone markers', () => {
      const input = '\\p \\zaln-s |who="Paul"\\*Text\\zaln-e\\*';
      const result = normalizeUSFM(input);

      expect(result).toContain('\\zaln-s |who="Paul"\\*');
      expect(result).toContain('\\zaln-e\\*');
    });

    it('should accept custom formatting rules', () => {
      const customRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'custom-verse-double-space',
          description: 'Double space after verses',
          priority: 200,
          applies: { marker: 'v' },
          whitespace: {
            before: { type: 'newline' },
            after: { type: 'space', count: 2 },
          },
        },
      ];

      const input = '\\p\\v 1 Text\\v 2 More';
      const defaultResult = normalizeUSFM(input);
      const customResult = normalizeUSFM(input, undefined, customRules);

      expect(defaultResult).not.toBe(customResult);
      expect(customResult).toContain('\\v 1  '); // Double space
      expect(customResult).toContain('\\v 2  '); // Double space
    });

    it('should handle complex real-world USFM', () => {
      const input = `\\id TIT\r\n\\h Titus\r\n\r\n\\c 1\n\\p   \n\\v 1   Paul,  a   servant\\w of\\w*God.\n\\v 2Grace   and   peace.`;
      const result = normalizeUSFM(input);

      expect(result).toContain('\\id TIT');
      expect(result).toContain('\\h Titus');
      expect(result).toContain('\\c 1');
      expect(result).toContain('\\p');
      expect(result).toContain('\\v 1');
      expect(result).toContain('Paul, a servant');
      expect(result).toContain('\\w of\\w*');
      expect(result).toContain('\\v 2');
      expect(result).toContain('Grace and peace');
    });
  });

  describe('normalizeUSFMSimple (built-in)', () => {
    it('should normalize using built-in parser method', () => {
      const input = '\\id TIT\r\n\\c 1\n\n\\p\n\\v 1 Text';
      const result = normalizeUSFMSimple(input);

      expect(result).toContain('\\id TIT');
      expect(result).toContain('\\c 1');
      expect(result).toContain('\\p');
      expect(result).toContain('\\v 1 Text');
    });

    it('should handle line ending normalization', () => {
      const input = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text';
      const result = normalizeUSFMSimple(input);

      expect(result).not.toContain('\r\n');
      expect(result).toContain('\n');
    });

    it('should handle basic whitespace normalization', () => {
      const input = '\\p   Text   with   spaces   ';
      const result = normalizeUSFMSimple(input);

      // Built-in normalization may handle this differently
      expect(result).toContain('Text');
      expect(result).toContain('spaces');
    });
  });

  describe('Comparison between normalization methods', () => {
    const testCases = [
      {
        name: 'Basic paragraph structure',
        input: '\\id TIT\\c 1\\p\\v 1 Text',
      },
      {
        name: 'Line ending variations',
        input: '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text',
      },
      {
        name: 'Character markers',
        input: '\\p Text \\w word\\w* more',
      },
      {
        name: 'Note markers',
        input: '\\p Paul \\f + note\\f* wrote',
      },
      {
        name: 'Complex structure',
        input: `\\id TIT\n\\c 1\n\\p\n\\v 1 Paul, a servant of God.\n\\v 2 Grace and peace.`,
      },
    ];

    testCases.forEach((testCase) => {
      it(`should handle ${testCase.name} in both methods`, () => {
        const simpleResult = normalizeUSFMSimple(testCase.input);
        const rulesResult = normalizeUSFM(testCase.input);

        // Both should produce valid USFM
        expect(simpleResult).toBeTruthy();
        expect(rulesResult).toBeTruthy();

        // Both should contain the same core content
        expect(simpleResult).toContain('TIT');
        expect(rulesResult).toContain('TIT');

        if (testCase.input.includes('\\v 1')) {
          expect(simpleResult).toContain('\\v 1');
          expect(rulesResult).toContain('\\v 1');
        }
      });
    });

    it('should show differences when using custom rules', () => {
      const customRules: USFMFormattingRule[] = [
        {
          id: 'test-custom-spacing',
          description: 'Custom spacing test',
          priority: 200,
          applies: { marker: 'p' },
          whitespace: {
            before: { type: 'newline' },
            after: { type: 'space', count: 3 }, // Triple space
          },
        },
      ];

      const input = '\\p Text content';
      const simpleResult = normalizeUSFMSimple(input);
      const defaultRulesResult = normalizeUSFM(input);
      const customRulesResult = normalizeUSFM(input, undefined, customRules);

      // Simple and default rules might be similar
      // Custom rules should be different
      expect(customRulesResult).not.toBe(simpleResult);
      expect(customRulesResult).toContain('\\p   '); // Triple space
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty input', () => {
      expect(normalizeUSFM('')).toBe('');
      expect(normalizeUSFMSimple('')).toBe('');
    });

    it('should handle whitespace-only input', () => {
      const input = '   \n\n   ';
      expect(normalizeUSFM(input).trim()).toBe('');
      expect(normalizeUSFMSimple(input).trim()).toBe('');
    });

    it('should handle single marker', () => {
      const input = '\\id TIT';
      const rulesResult = normalizeUSFM(input);
      const simpleResult = normalizeUSFMSimple(input);

      expect(rulesResult).toContain('\\id TIT');
      expect(simpleResult).toContain('\\id TIT');
    });

    it('should handle malformed input gracefully', () => {
      const input = '\\p Text \\ incomplete';

      expect(() => normalizeUSFM(input)).not.toThrow();
      expect(() => normalizeUSFMSimple(input)).not.toThrow();

      const rulesResult = normalizeUSFM(input);
      const simpleResult = normalizeUSFMSimple(input);

      expect(rulesResult).toContain('Text');
      expect(simpleResult).toContain('Text');
    });

    it('should handle very long input', () => {
      const longText = 'word '.repeat(1000);
      const input = `\\p ${longText}`;

      expect(() => normalizeUSFM(input)).not.toThrow();
      expect(() => normalizeUSFMSimple(input)).not.toThrow();

      const rulesResult = normalizeUSFM(input);
      const simpleResult = normalizeUSFMSimple(input);

      expect(rulesResult).toContain('word');
      expect(simpleResult).toContain('word');
    });
  });

  describe('Performance considerations', () => {
    it('should handle medium-sized documents efficiently', () => {
      const verses = Array.from(
        { length: 100 },
        (_, i) => `\\v ${i + 1} This is verse ${i + 1} with some text content.`
      ).join('\n');

      const input = `\\id TST\n\\c 1\n\\p\n${verses}`;

      const startTime = Date.now();
      const result = normalizeUSFM(input);
      const endTime = Date.now();

      expect(result).toContain('\\id TST');
      expect(result).toContain('\\v 1');
      expect(result).toContain('\\v 100');

      // Should complete in reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
