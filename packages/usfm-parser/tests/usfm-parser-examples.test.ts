/**
 * Format Examples Test Suite
 *
 * Tests the parser's ability to convert USFM to plain USJ using real examples
 * from the examples/usfm-markers directory. Examples are discovered dynamically
 * by scanning the filesystem and reading metadata.json files.
 */

import { UsfmParser } from '../src/parser/UsfmParser';

import * as fs from 'fs';
import * as path from 'path';

// Interface for example metadata
interface ExampleMetadata {
  marker: string;
  category: string;
  example: string;
  description: string;
  source: string;
  created: string;
}

// Interface for discovered examples
interface DiscoveredExample {
  id: string;
  category: string;
  marker: string;
  exampleName: string;
  directory: string;
  description: string;
  source: string;
  hasUsfm: boolean;
  hasUsj: boolean;
  usfmPath: string;
  usjPath: string;
  metadataPath: string;
}

/**
 * Dynamically discover examples by scanning the filesystem
 */
function discoverExamples(examplesDir: string): DiscoveredExample[] {
  const examples: DiscoveredExample[] = [];

  if (!fs.existsSync(examplesDir)) {
    console.warn(`Examples directory not found: ${examplesDir}`);
    return examples;
  }

  // Get all category directories (char-*, para-*, cv-*, etc.)
  const categories = fs
    .readdirSync(examplesDir)
    .filter((item) => {
      const fullPath = path.join(examplesDir, item);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();

  categories.forEach((category) => {
    const categoryDir = path.join(examplesDir, category);

    // Get all example directories within this category
    const exampleDirs = fs
      .readdirSync(categoryDir)
      .filter((item) => {
        const fullPath = path.join(categoryDir, item);
        return fs.statSync(fullPath).isDirectory();
      })
      .sort();

    exampleDirs.forEach((exampleName) => {
      const exampleDir = path.join(categoryDir, exampleName);
      const usfmPath = path.join(exampleDir, 'example.usfm');
      const usjPath = path.join(exampleDir, 'example.usj');
      const metadataPath = path.join(exampleDir, 'metadata.json');

      // Check which files exist
      const hasUsfm = fs.existsSync(usfmPath);
      const hasUsj = fs.existsSync(usjPath);
      const hasMetadata = fs.existsSync(metadataPath);

      // Read metadata if available
      let metadata: ExampleMetadata | null = null;
      if (hasMetadata) {
        try {
          const metadataContent = fs.readFileSync(metadataPath, 'utf8');
          metadata = JSON.parse(metadataContent);
        } catch (error) {
          console.warn(`Failed to parse metadata for ${category}/${exampleName}: ${error}`);
        }
      }

      // Extract category and marker from directory name
      const parts = category.split('-');
      const categoryName = parts[0] || 'unknown';
      const marker = parts[1] || 'unknown';

      const example: DiscoveredExample = {
        id: `${category}-${exampleName}`,
        category: categoryName,
        marker: marker,
        exampleName: exampleName,
        directory: exampleDir,
        description: metadata?.description || `Example usage of \\${marker} marker`,
        source: metadata?.source || 'Unknown',
        hasUsfm,
        hasUsj,
        usfmPath,
        usjPath,
        metadataPath,
      };

      examples.push(example);
    });
  });

  return examples;
}

// Discover examples from the filesystem
const EXAMPLES_DIR = path.join(__dirname, '../../../examples/usfm-markers');
const allExamples = discoverExamples(EXAMPLES_DIR);

// Filter examples by category - only include examples that have both USFM and USJ
const characterExamples = allExamples.filter(
  (example) => example.category === 'char' && example.hasUsfm && example.hasUsj
);

const paragraphExamples = allExamples.filter(
  (example) => example.category === 'para' && example.hasUsfm && example.hasUsj
);

const cvExamples = allExamples.filter(
  (example) => example.category === 'cv' && example.hasUsfm && example.hasUsj
);

const noteExamples = allExamples.filter(
  (example) => example.category === 'note' && example.hasUsfm && example.hasUsj
);

const milestoneExamples = allExamples.filter(
  (example) => example.category === 'ms' && example.hasUsfm && example.hasUsj
);

const docExamples = allExamples.filter(
  (example) => example.category === 'doc' && example.hasUsfm && example.hasUsj
);

const figureExamples = allExamples.filter(
  (example) => example.category === 'fig' && example.hasUsfm && example.hasUsj
);

const categoryExamples = allExamples.filter(
  (example) => example.category === 'cat' && example.hasUsfm && example.hasUsj
);

const sidebarExamples = allExamples.filter(
  (example) => example.category === 'sbar' && example.hasUsfm && example.hasUsj
);

const periphExamples = allExamples.filter(
  (example) => example.category === 'periph' && example.hasUsfm && example.hasUsj
);

describe('Format Examples - USFM to USJ Conversion', () => {
  let parser: UsfmParser;

  beforeAll(() => {
    parser = new UsfmParser();
    console.log(`Discovered ${allExamples.length} total examples from filesystem`);
    console.log(`Character examples: ${characterExamples.length}`);
    console.log(`Paragraph examples: ${paragraphExamples.length}`);
    console.log(`Chapter/Verse examples: ${cvExamples.length}`);
    console.log(`Note examples: ${noteExamples.length}`);
    console.log(`Milestone examples: ${milestoneExamples.length}`);
    console.log(`Document examples: ${docExamples.length}`);
    console.log(`Figure examples: ${figureExamples.length}`);
    console.log(`Category examples: ${categoryExamples.length}`);
    console.log(`Sidebar examples: ${sidebarExamples.length}`);
    console.log(`Peripheral examples: ${periphExamples.length}`);
  });

  // Helper function to load example files
  function loadExampleFiles(example: DiscoveredExample) {
    const files: { usfm?: string; usj?: any; usfmPath: string; usjPath: string } = {
      usfmPath: example.usfmPath,
      usjPath: example.usjPath,
    };

    if (example.hasUsfm) {
      files.usfm = fs.readFileSync(example.usfmPath, 'utf8');
    }

    if (example.hasUsj) {
      const usjContent = fs.readFileSync(example.usjPath, 'utf8').trim();
      try {
        files.usj = JSON.parse(usjContent);
      } catch (error) {
        console.warn(
          `Failed to parse USJ for ${example.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return files;
  }

  // Helper function to normalize USJ for comparison
  function normalizeUSJ(usj: any): any {
    // Recursive function to sort and normalize
    function normalize(obj: any): any {
      if (Array.isArray(obj)) {
        return obj.map(normalize);
      }

      if (obj && typeof obj === 'object') {
        const normalized: any = {};
        // Sort keys for consistent comparison
        const keys = Object.keys(obj).sort();
        for (const key of keys) {
          normalized[key] = normalize(obj[key]);
        }
        return normalized;
      }

      return obj;
    }

    return normalize(usj);
  }

  // Helper function to perform assertion with file path logging on failure
  function expectWithFileLogging(
    actualUSJ: any,
    expectedUSJ: any,
    usfmPath: string,
    usjPath: string,
    exampleId: string
  ) {
    const normalizedActual = normalizeUSJ(actualUSJ);
    const normalizedExpected = normalizeUSJ(expectedUSJ);

    try {
      expect(normalizedActual).toEqual(normalizedExpected);
    } catch (error) {
      // Add file paths to the error message so they appear with the test failure
      const originalMessage = error instanceof Error ? error.message : String(error);
      const enhancedMessage = `${originalMessage}\n\n📁 Test Files for ${exampleId}:\n   USFM: ${usfmPath}\n   USJ:  ${usjPath}`;

      if (error instanceof Error) {
        error.message = enhancedMessage;
      }
      throw error;
    }
  }

  // Test character markers - each example gets its own test case
  describe('Character Markers', () => {
    if (characterExamples.length > 0) {
      test.each(characterExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const response = parser.parse(files.usfm);
        const actualUSJ = response.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No character marker examples available', () => {
        console.log('No valid character marker examples found');
      });
    }
  });

  // Test paragraph markers - each example gets its own test case
  describe('Paragraph Markers', () => {
    if (paragraphExamples.length > 0) {
      test.each(paragraphExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No paragraph marker examples available', () => {
        console.log('No valid paragraph marker examples found');
      });
    }
  });

  // Test chapter and verse markers - each example gets its own test case
  describe('Chapter and Verse Markers', () => {
    if (cvExamples.length > 0) {
      test.each(cvExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No chapter/verse marker examples available', () => {
        console.log('No valid chapter/verse marker examples found');
      });
    }
  });

  // Test note markers - each example gets its own test case
  describe('Note Markers', () => {
    if (noteExamples.length > 0) {
      test.each(noteExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No note marker examples available', () => {
        console.log('No valid note marker examples found');
      });
    }
  });

  // Test milestone markers - each example gets its own test case
  describe('Milestone Markers', () => {
    if (milestoneExamples.length > 0) {
      test.each(milestoneExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No milestone marker examples available', () => {
        console.log('No valid milestone marker examples found');
      });
    }
  });

  // Test figure markers - each example gets its own test case
  describe('Figure Markers', () => {
    if (figureExamples.length > 0) {
      test.each(figureExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No figure marker examples available', () => {
        console.log('No valid figure marker examples found');
      });
    }
  });

  // Test category markers - each example gets its own test case
  describe('Category Markers', () => {
    if (categoryExamples.length > 0) {
      test.each(categoryExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No category marker examples available', () => {
        console.log('No valid category marker examples found');
      });
    }
  });

  // Test sidebar markers - each example gets its own test case
  describe('Sidebar Markers', () => {
    if (sidebarExamples.length > 0) {
      test.each(sidebarExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No sidebar marker examples available', () => {
        console.log('No valid sidebar marker examples found');
      });
    }
  });

  // Test peripheral markers - each example gets its own test case
  describe('Peripheral Markers', () => {
    if (periphExamples.length > 0) {
      test.each(periphExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No peripheral marker examples available', () => {
        console.log('No valid peripheral marker examples found');
      });
    }
  });

  // Test document markers - each example gets its own test case
  describe('Document Markers', () => {
    if (docExamples.length > 0) {
      test.each(docExamples)('$id: $description', (example) => {
        const files = loadExampleFiles(example);

        if (!files.usfm || !files.usj) {
          throw new Error(`Missing or invalid files for ${example.id}`);
        }

        const result = parser.parse(files.usfm);
        const actualUSJ = result.result;
        const expectedUSJ = files.usj;

        expectWithFileLogging(actualUSJ, expectedUSJ, files.usfmPath, files.usjPath, example.id);
      });
    } else {
      test('No document marker examples available', () => {
        console.log('No valid document marker examples found');
      });
    }
  });
});
