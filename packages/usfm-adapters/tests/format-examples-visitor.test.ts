/**
 * Format Examples Visitor Test Suite
 *
 * Tests the visitor's ability to convert USJ back to USFM using real examples
 * from the format-examples directory.
 */

import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src/usfm/index';
import * as fs from 'fs';
import * as path from 'path';

// Interface for format example index
interface FormatExample {
  id: string;
  directory: string;
  description: string;
  formats: {
    usfm: boolean;
    usx: boolean;
    usj: boolean;
  };
}

interface FormatExampleIndex {
  summary: {
    totalFiles: number;
    filesWithExamples: number;
    totalExamples: number;
    errorFiles: number;
    successRate: string;
    processingDate: string;
  };
  allExamples: FormatExample[];
}

describe('Format Examples - USJ to USFM Conversion (Visitor)', () => {
  let parser: USFMParser;
  let formatIndex: FormatExampleIndex;

  beforeAll(() => {
    parser = new USFMParser();

    // Load the format examples index
    const indexPath = path.join(__dirname, '../../../format-examples/index.json');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    formatIndex = JSON.parse(indexContent);
  });

  // Helper function to load example files
  function loadExampleFiles(example: FormatExample) {
    const basePath = path.join(__dirname, '../../../', example.directory);

    const files = {
      usfm: null as string | null,
      usj: null as any | null,
    };

    // Load USFM file
    if (example.formats.usfm) {
      const usfmPath = path.join(basePath, 'example.usfm');
      if (fs.existsSync(usfmPath)) {
        files.usfm = fs.readFileSync(usfmPath, 'utf8').trim();
      }
    }

    // Load USJ file
    if (example.formats.usj) {
      const usjPath = path.join(basePath, 'example.usj');
      if (fs.existsSync(usjPath)) {
        const usjContent = fs.readFileSync(usjPath, 'utf8');
        files.usj = JSON.parse(usjContent);
      }
    }

    return files;
  }

  // Helper function to normalize USFM for comparison
  function normalizeUSFM(usfm: string): string {
    return usfm
      .trim()
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/[ \t]+/g, ' ') // Normalize whitespace
      .replace(/\n+/g, '\n'); // Normalize multiple newlines
  }

  // Test specific character marker examples
  describe('Character Markers with Attributes', () => {
    test('char-w-example-2: Word marker with lemma attribute', () => {
      const files = loadExampleFiles({
        id: 'char-w-example-2',
        directory: 'format-examples/char-w/w-example-2',
        description: 'Word marker with lemma attribute',
        formats: { usfm: true, usx: true, usj: true },
      });

      if (!files.usfm || !files.usj) {
        throw new Error('Required files not found');
      }

      // Parse the USJ and convert back to USFM using our visitor
      const ast = parser.parse(files.usj);
      const visitor = new USFMVisitor();
      ast.visit(visitor);
      const actualUSFM = visitor.getResult().trim();

      const expectedUSFM = normalizeUSFM(files.usfm);
      const normalizedActual = normalizeUSFM(actualUSFM);

      console.log('Expected USFM:', expectedUSFM);
      console.log('Actual USFM  :', normalizedActual);

      expect(normalizedActual).toEqual(expectedUSFM);
    });
  });

  // Test simple character markers without attributes
  describe('Character Markers without Attributes', () => {
    test('char-w-example-1: Simple word marker', () => {
      const files = loadExampleFiles({
        id: 'char-w-example-1',
        directory: 'format-examples/char-w/w-example-1',
        description: 'Simple word marker',
        formats: { usfm: true, usx: true, usj: true },
      });

      if (!files.usfm || !files.usj) {
        throw new Error('Required files not found');
      }

      const ast = parser.parse(files.usj);
      const visitor = new USFMVisitor();
      ast.visit(visitor);
      const actualUSFM = visitor.getResult().trim();

      const expectedUSFM = normalizeUSFM(files.usfm);
      const normalizedActual = normalizeUSFM(actualUSFM);

      console.log('Expected USFM:', expectedUSFM);
      console.log('Actual USFM  :', normalizedActual);

      expect(normalizedActual).toEqual(expectedUSFM);
    });
  });

  // Test chapter and verse examples
  describe('Chapter and Verse Markers', () => {
    test('cv-c-example-1: Chapter marker', () => {
      const files = loadExampleFiles({
        id: 'cv-c-example-1',
        directory: 'format-examples/cv-c/c-example-1',
        description: 'Chapter marker',
        formats: { usfm: true, usx: true, usj: true },
      });

      if (!files.usfm || !files.usj) {
        console.warn('Skipping cv-c-example-1: files not available');
        return;
      }

      const ast = parser.parse(files.usj);
      const visitor = new USFMVisitor();
      ast.visit(visitor);
      const actualUSFM = visitor.getResult().trim();

      const expectedUSFM = normalizeUSFM(files.usfm);
      const normalizedActual = normalizeUSFM(actualUSFM);

      console.log('Expected USFM:', expectedUSFM);
      console.log('Actual USFM  :', normalizedActual);

      expect(normalizedActual).toEqual(expectedUSFM);
    });
  });

  // Test a few examples to verify basic functionality
  describe('Sample Tests', () => {
    const sampleExamples = [
      'char-w-example-1',
      'char-w-example-2',
      'char-bd-example-1',
      'para-p-example-1',
    ];

    test.each(sampleExamples)('Test %s', (exampleId) => {
      const example = formatIndex.allExamples.find((ex) => ex.id === exampleId);

      if (!example) {
        console.warn(`Example ${exampleId} not found in index`);
        return;
      }

      const files = loadExampleFiles(example);

      if (!files.usfm || !files.usj) {
        console.warn(`Skipping ${exampleId}: missing files`);
        return;
      }

      const ast = parser.parse(files.usj);
      const visitor = new USFMVisitor();
      ast.visit(visitor);
      const actualUSFM = visitor.getResult().trim();

      const expectedUSFM = normalizeUSFM(files.usfm);
      const normalizedActual = normalizeUSFM(actualUSFM);

      console.log(`\n=== ${exampleId} ===`);
      console.log('Expected:', expectedUSFM);
      console.log('Actual  :', normalizedActual);

      expect(normalizedActual).toEqual(expectedUSFM);
    });
  });
});
