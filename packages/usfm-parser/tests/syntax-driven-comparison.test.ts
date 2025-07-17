/**
 * Syntax-Driven Parser Comparison Test Suite
 *
 * Tests both the original parser and the new syntax-driven parser
 * side by side to validate the new approach.
 */

import { USFMParser } from '../src/parser/index';
import { SyntaxDrivenUSFMParser } from '../src/parser/syntax-driven-parser';
import * as fs from 'fs';
import * as path from 'path';

describe('Syntax-Driven Parser Comparison', () => {
  let originalParser: USFMParser;
  let syntaxParser: SyntaxDrivenUSFMParser;

  beforeAll(() => {
    originalParser = new USFMParser();
    syntaxParser = new SyntaxDrivenUSFMParser();
  });

  describe('Basic Parsing Comparison', () => {
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
      console.log(`\n=== Testing: ${input} ===`);

      // Parse with original parser
      const originalResult = originalParser.parse(input);
      const originalUSJ = originalResult.toJSON();

      // Parse with syntax-driven parser
      const syntaxResult = syntaxParser.parse(input);

      console.log('Original Parser Result:');
      console.log(JSON.stringify(originalUSJ, null, 2));

      console.log('\nSyntax-Driven Parser Result:');
      console.log(JSON.stringify(syntaxResult, null, 2));

      // For now, just ensure both parsers produce something
      expect(originalUSJ).toBeDefined();
      expect(syntaxResult).toBeDefined();
      expect(originalUSJ.type).toBe('USJ');
      expect(syntaxResult.type).toBe('USJ');
    });
  });

  describe('File-Based Comparison', () => {
    const EXAMPLES_DIR = path.join(__dirname, '../../../examples/usfm-markers');

    // Test a few simple examples
    const simpleExamples = ['cv-v/v-example-1', 'para-p/p-example-1'];

    test.each(simpleExamples)('Example: %s', (examplePath) => {
      const usfmPath = path.join(EXAMPLES_DIR, examplePath, 'example.usfm');
      const usjPath = path.join(EXAMPLES_DIR, examplePath, 'example.usj');

      if (!fs.existsSync(usfmPath)) {
        console.log(`Skipping ${examplePath} - USFM file not found`);
        return;
      }

      const usfmContent = fs.readFileSync(usfmPath, 'utf8');
      console.log(`\n=== Testing File: ${examplePath} ===`);
      console.log(`USFM Input: ${usfmContent}`);

      // Parse with original parser
      const originalResult = originalParser.parse(usfmContent);
      const originalUSJ = originalResult.toJSON();

      // Parse with syntax-driven parser
      const syntaxResult = syntaxParser.parse(usfmContent);

      console.log('\nOriginal Parser Result:');
      console.log(JSON.stringify(originalUSJ, null, 2));

      console.log('\nSyntax-Driven Parser Result:');
      console.log(JSON.stringify(syntaxResult, null, 2));

      // Compare basic structure
      expect(originalUSJ.type).toBe('USJ');
      expect(syntaxResult.type).toBe('USJ');
      expect(Array.isArray(originalUSJ.content)).toBe(true);
      expect(Array.isArray(syntaxResult.content)).toBe(true);
    });
  });

  describe('Performance Comparison', () => {
    const testInput =
      '\\p \\v 1 This is a test verse. \\v 2 This is another verse with more content.';
    const iterations = 1000;

    test('Parse speed comparison', () => {
      console.log(`\nPerformance test with ${iterations} iterations`);

      // Time original parser
      const originalStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        originalParser.parse(testInput);
      }
      const originalEnd = performance.now();
      const originalTime = originalEnd - originalStart;

      // Time syntax-driven parser
      const syntaxStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        syntaxParser.parse(testInput);
      }
      const syntaxEnd = performance.now();
      const syntaxTime = syntaxEnd - syntaxStart;

      console.log(
        `Original Parser: ${originalTime.toFixed(2)}ms (${(originalTime / iterations).toFixed(4)}ms per parse)`
      );
      console.log(
        `Syntax Parser: ${syntaxTime.toFixed(2)}ms (${(syntaxTime / iterations).toFixed(4)}ms per parse)`
      );
      console.log(`Speedup: ${(originalTime / syntaxTime).toFixed(2)}x`);

      // Both should complete in reasonable time
      expect(originalTime).toBeLessThan(10000); // 10 seconds max
      expect(syntaxTime).toBeLessThan(10000); // 10 seconds max
    });
  });

  describe('Architecture Analysis', () => {
    test('Code complexity comparison', () => {
      // This is more of a documentation test to highlight the architectural differences
      console.log('\n=== ARCHITECTURE COMPARISON ===');

      console.log('\nOriginal Parser Characteristics:');
      console.log('- Complex procedural parsing methods');
      console.log('- Hardcoded marker-specific logic');
      console.log('- Difficult to add new markers');
      console.log('- Whitespace handling scattered throughout');

      console.log('\nSyntax-Driven Parser Characteristics:');
      console.log('- Declarative syntax definitions');
      console.log('- Generic pattern interpreter');
      console.log('- Easy to add new markers via definitions');
      console.log('- Centralized whitespace rules');

      console.log('\nNext Steps for Syntax Parser:');
      console.log('1. Implement full syntax definition system');
      console.log('2. Add pattern variations support');
      console.log('3. Integrate all USFM marker types');
      console.log('4. Add comprehensive error handling');

      // This test always passes - it's for documentation
      expect(true).toBe(true);
    });
  });
});
