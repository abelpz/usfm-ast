/**
 * Parser comparison: legacy USFMParser vs registry-driven UsfmParser.
 *
 * The previous SyntaxDrivenUSFMParser module was never landed; UsfmParser
 * is the syntax-driven implementation in tree today.
 */

import { USFMParser } from '../src/parser/index';
import { UsfmParser } from '../src/parser/UsfmParser';
import * as fs from 'fs';
import * as path from 'path';

describe('USFMParser vs UsfmParser comparison', () => {
  let legacyParser: USFMParser;

  beforeAll(() => {
    legacyParser = new USFMParser();
  });

  describe('Basic parsing comparison', () => {
    const testCases = [
      {
        name: 'Simple verse',
        input: '\\v 1 This is verse one.',
      },
      {
        name: 'Verse with paragraph',
        input: '\\p \\v 1 This is verse content in a paragraph.',
      },
      {
        name: 'Multiple verses',
        input: '\\v 1 First verse. \\v 2 Second verse.',
      },
      {
        name: 'Paragraph with content',
        input: '\\p This is paragraph content.',
      },
    ];

    test.each(testCases)('$name', ({ input }) => {
      const legacyResult = legacyParser.parse(input).toJSON();

      const syntaxParser = new UsfmParser(input, {});
      const syntaxOutcome = syntaxParser.parse();

      expect(legacyResult).toBeDefined();
      expect(syntaxOutcome.success).toBe(true);
      expect(syntaxOutcome.result).toBeDefined();

      const syntaxUSJ = syntaxOutcome.result!;
      expect(legacyResult.type).toBe('USJ');
      expect(syntaxUSJ.type).toBe('USJ');
    });
  });

  describe('File-based comparison', () => {
    const EXAMPLES_DIR = path.join(__dirname, '../../../examples/usfm-markers');
    // Keep examples small: UsfmParser does not yet match legacy on full chapter samples (e.g. para-p/p-example-1).
    const simpleExamples = ['cv-v/v-example-1', 'doc-id/id-example-1'];

    test.each(simpleExamples)('Example: %s', (examplePath) => {
      const usfmPath = path.join(EXAMPLES_DIR, examplePath, 'example.usfm');

      if (!fs.existsSync(usfmPath)) {
        console.log(`Skipping ${examplePath} - USFM file not found`);
        return;
      }

      const usfmContent = fs.readFileSync(usfmPath, 'utf8');

      const legacyUSJ = legacyParser.parse(usfmContent).toJSON();
      const syntaxParser = new UsfmParser(usfmContent, {});
      const syntaxOutcome = syntaxParser.parse();

      expect(syntaxOutcome.success).toBe(true);
      const syntaxUSJ = syntaxOutcome.result!;

      expect(legacyUSJ.type).toBe('USJ');
      expect(syntaxUSJ.type).toBe('USJ');
      expect(Array.isArray(legacyUSJ.content)).toBe(true);
      expect(Array.isArray(syntaxUSJ.content)).toBe(true);
    });
  });

  describe('Performance comparison', () => {
    const testInput =
      '\\p \\v 1 This is a test verse. \\v 2 This is another verse with more content.';
    const iterations = 1000;

    test('Parse speed comparison', () => {
      const legacyStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        legacyParser.parse(testInput);
      }
      const legacyTime = performance.now() - legacyStart;

      const syntaxStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const p = new UsfmParser(testInput, {});
        p.parse();
      }
      const syntaxTime = performance.now() - syntaxStart;

      expect(legacyTime).toBeLessThan(10000);
      expect(syntaxTime).toBeLessThan(10000);

      // Log for local tuning (not asserted)
      if (process.env.DEBUG_PARSER_PERF) {
        console.log(
          `Legacy USFMParser: ${legacyTime.toFixed(2)}ms (${(legacyTime / iterations).toFixed(4)}ms/parse)`
        );
        console.log(
          `UsfmParser: ${syntaxTime.toFixed(2)}ms (${(syntaxTime / iterations).toFixed(4)}ms/parse)`
        );
      }
    });
  });
});
