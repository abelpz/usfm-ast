import fs from 'fs';
import path from 'path';
import {
  normalizeUSFM,
  normalizeUSFMSimple,
  coreUSFMFormattingRules,
  USFMFormattingRule,
  USFMParser,
  USFMVisitor,
} from '../index';

describe('USFM Normalization Integration Tests', () => {
  const fixturesDir = path.join(__dirname, '../grammar/__tests__/fixtures/usfm');

  const readFixture = (filename: string): string => {
    return fs.readFileSync(path.join(fixturesDir, filename), 'utf8');
  };

  describe('Real USFM file normalization', () => {
    const testFiles = ['basic.usfm', 'medium.usfm', 'tit.bsb.usfm'];

    testFiles.forEach((filename) => {
      if (fs.existsSync(path.join(fixturesDir, filename))) {
        describe(`${filename}`, () => {
          let originalContent: string;

          beforeAll(() => {
            originalContent = readFixture(filename);
          });

          it('should normalize without errors', () => {
            expect(() => normalizeUSFM(originalContent)).not.toThrow();
            expect(() => normalizeUSFMSimple(originalContent)).not.toThrow();
          });

          it('should produce valid USFM output', () => {
            const normalized = normalizeUSFM(originalContent);

            // Should contain essential USFM markers
            expect(normalized).toMatch(/\\id\s+\w+/); // Book ID

            // Should not contain Windows line endings
            expect(normalized).not.toContain('\r\n');

            // Should be parseable
            const parser = new USFMParser();
            expect(() => parser.load(normalized).parse()).not.toThrow();
          });

          it('should preserve semantic content', () => {
            const normalized = normalizeUSFM(originalContent);

            // Parse both original and normalized
            const parser = new USFMParser();

            const originalAst = parser.load(originalContent).parse();
            const normalizedAst = parser.load(normalized).parse();

            // Should have same number of top-level nodes
            expect(normalizedAst.getNodes().length).toBe(originalAst.getNodes().length);
          });

          it('should be idempotent', () => {
            const firstNormalization = normalizeUSFM(originalContent);
            const secondNormalization = normalizeUSFM(firstNormalization);

            expect(secondNormalization).toBe(firstNormalization);
          });

          it('should handle custom rules', () => {
            const customRules: USFMFormattingRule[] = [
              ...coreUSFMFormattingRules,
              {
                id: 'test-custom-id-spacing',
                description: 'Custom ID spacing',
                priority: 200,
                applies: { marker: 'id' },
                whitespace: {
                  after: { type: 'space', count: 3 },
                },
              },
            ];

            const defaultNormalized = normalizeUSFM(originalContent);
            const customNormalized = normalizeUSFM(originalContent, undefined, customRules);

            // Should be different due to custom rules
            if (originalContent.includes('\\id')) {
              expect(customNormalized).not.toBe(defaultNormalized);
              expect(customNormalized).toMatch(/\\id\s{3}/); // Three spaces after \id
            }
          });
        });
      }
    });
  });

  describe('Complex normalization scenarios', () => {
    it('should handle mixed line endings', () => {
      const input = '\\id TIT\r\n\\c 1\r\n\\p\r\n\\v 1 Text\n\\v 2 More text\r';
      const result = normalizeUSFM(input);

      expect(result).not.toContain('\r\n');
      expect(result).not.toContain('\r');
      expect(result).toContain('\n');
    });

    it('should handle excessive whitespace', () => {
      const input = `\\id   TIT   


\\c    1   


\\p   


\\v   1   Text   with   lots   of   spaces   `;

      const result = normalizeUSFM(input);

      expect(result).not.toContain('   TIT   ');
      expect(result).not.toContain('   lots   of   spaces   ');
      expect(result).toContain('Text with lots of spaces');
    });

    it('should handle complex nested structures', () => {
      const input = `\\p Text \\w word|strong="G123"\\w* more \\f + \\fr 1:1 \\ft Note with \\w nested|strong="G456"\\w* word\\f* end`;
      const result = normalizeUSFM(input);

      expect(result).toContain('\\w word|strong="G123"\\w*');
      expect(result).toContain(
        '\\f + \\fr 1:1 \\ft Note with \\w nested|strong="G456"\\w* word\\f*'
      );
    });

    it('should handle milestone markers with attributes', () => {
      const input = `\\p \\zaln-s |who="Paul" x-occurrence="1" x-occurrences="1"\\*Text content\\zaln-e\\* more`;
      const result = normalizeUSFM(input);

      expect(result).toContain('\\zaln-s |who="Paul" x-occurrence="1" x-occurrences="1"\\*');
      expect(result).toContain('\\zaln-e\\*');
    });

    it('should handle table structures', () => {
      const input = `\\p\\tr \\th1 Header 1\\th2 Header 2\\tr \\tc1 Cell 1\\tc2 Cell 2`;
      const result = normalizeUSFM(input);

      expect(result).toContain('\\tr');
      expect(result).toContain('\\th1');
      expect(result).toContain('\\tc1');
    });
  });

  describe('Performance and reliability', () => {
    it('should handle large documents efficiently', () => {
      // Generate a large USFM document
      const verses = Array.from(
        { length: 500 },
        (_, i) =>
          `\\v ${i + 1} This is verse ${i + 1} with some \\w word${i}|strong="G${1000 + i}"\\w* content and \\f + \\fr 1:${i + 1} \\ft footnote text\\f* notes.`
      ).join('\n');

      const largeDocument = `\\id GEN\n\\h Genesis\n\\c 1\n\\p\n${verses}`;

      const startTime = Date.now();
      const result = normalizeUSFM(largeDocument);
      const endTime = Date.now();

      expect(result).toContain('\\id GEN');
      expect(result).toContain('\\v 1');
      expect(result).toContain('\\v 500');

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle documents with many custom markers', () => {
      const customMarkers = Array.from(
        { length: 50 },
        (_, i) => `\\custom${i} Content for custom marker ${i}`
      ).join('\n');

      const input = `\\id TST\n\\c 1\n\\p\n${customMarkers}`;

      expect(() => normalizeUSFM(input)).not.toThrow();
      const result = normalizeUSFM(input);
      expect(result).toContain('\\id TST');
    });

    it('should maintain consistency across multiple normalizations', () => {
      const input = readFixture('tit.bsb.usfm');

      const results = Array.from({ length: 10 }, () => normalizeUSFM(input));

      // All results should be identical
      results.forEach((result) => {
        expect(result).toBe(results[0]);
      });
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty files', () => {
      expect(normalizeUSFM('')).toBe('');
      expect(normalizeUSFMSimple('')).toBe('');
    });

    it('should handle files with only whitespace', () => {
      const whitespaceOnly = '   \n\n\t\t\n   ';
      expect(normalizeUSFM(whitespaceOnly).trim()).toBe('');
      expect(normalizeUSFMSimple(whitespaceOnly).trim()).toBe('');
    });

    it('should handle malformed USFM gracefully', () => {
      const malformed = `\\id TIT\n\\c 1\n\\p\n\\v 1 Text\n\\ incomplete marker\n\\v 2 More text`;

      expect(() => normalizeUSFM(malformed)).not.toThrow();
      expect(() => normalizeUSFMSimple(malformed)).not.toThrow();

      const result = normalizeUSFM(malformed);
      expect(result).toContain('\\id TIT');
      expect(result).toContain('\\v 1');
      expect(result).toContain('\\v 2');
    });

    it('should handle files with unusual encoding', () => {
      const unicodeContent = `\\id TIT\n\\c 1\n\\p\n\\v 1 Pāulu, Atua tamaiti`;

      expect(() => normalizeUSFM(unicodeContent)).not.toThrow();
      const result = normalizeUSFM(unicodeContent);
      expect(result).toContain('Pāulu');
      expect(result).toContain('Atua');
    });
  });

  describe('Comparison with simple normalization', () => {
    it('should show differences when using formatting rules', () => {
      const input = `\\id TIT\\c 1\\p\\v 1 Text\\w word\\w*more`;

      const simpleResult = normalizeUSFMSimple(input);
      const rulesResult = normalizeUSFM(input);

      // Both should be valid but may differ in formatting
      expect(simpleResult).toContain('\\id TIT');
      expect(rulesResult).toContain('\\id TIT');

      // Rules-based should have more consistent formatting
      expect(rulesResult).toMatch(/\\id TIT\n/);
    });

    it('should demonstrate custom rule benefits', () => {
      const customRules: USFMFormattingRule[] = [
        ...coreUSFMFormattingRules,
        {
          id: 'demo-verse-formatting',
          description: 'Demo verse formatting with extra space',
          priority: 200,
          applies: { marker: 'v' },
          whitespace: {
            before: { type: 'newline' },
            after: { type: 'space', count: 2 },
          },
        },
      ];

      const input = `\\p\\v 1 First\\v 2 Second\\v 3 Third`;

      const simpleResult = normalizeUSFMSimple(input);
      const defaultRulesResult = normalizeUSFM(input);
      const customRulesResult = normalizeUSFM(input, undefined, customRules);

      // Custom rules should produce different output
      expect(customRulesResult).not.toBe(simpleResult);
      expect(customRulesResult).not.toBe(defaultRulesResult);

      // Custom rules should have double spaces after verses
      expect(customRulesResult).toContain('\\v 1  ');
      expect(customRulesResult).toContain('\\v 2  ');
      expect(customRulesResult).toContain('\\v 3  ');
    });
  });

  describe('Round-trip consistency', () => {
    it('should maintain consistency in parse -> normalize -> parse cycle', () => {
      const input = readFixture('tit.bsb.usfm');

      // First cycle
      const parser1 = new USFMParser();
      const ast1 = parser1.load(input).parse();

      const visitor1 = new USFMVisitor();
      ast1.visit(visitor1);
      const normalized1 = visitor1.getResult();

      // Second cycle
      const parser2 = new USFMParser();
      const ast2 = parser2.load(normalized1).parse();

      const visitor2 = new USFMVisitor();
      ast2.visit(visitor2);
      const normalized2 = visitor2.getResult();

      // Should be identical after first normalization
      expect(normalized2).toBe(normalized1);
    });
  });
});
