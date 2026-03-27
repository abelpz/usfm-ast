#!/usr/bin/env node

/**
 * USFM Formatting Demo
 *
 * This script demonstrates how to use @usfm-tools/formatter to format USFM text.
 * It reads the complex.usfm test file and applies various formatting rules.
 */

const fs = require('fs').promises;
const path = require('path');

// Import the formatter packages
// Note: These would be actual imports in a real project
// For this demo, we'll simulate the API calls

async function main() {
  try {
    console.log('🔧 USFM Formatting Demo');
    console.log('========================\n');

    // Read the complex USFM file
    const inputPath = path.join(
      __dirname,
      '../../packages/usfm-parser/tests/fixtures/usfm/complex.usfm'
    );
    const usfmInput = await fs.readFile(inputPath, 'utf8');

    console.log('📖 Input USFM (first 200 chars):');
    console.log(usfmInput.substring(0, 200) + '...\n');

    // Simulate formatting with different rule sets
    // In a real implementation, you would use:
    // import { USFMFormatter, coreUSFMFormattingRules } from '@usfm-tools/formatter';
    // import { USFMVisitor } from '@usfm-tools/adapters';
    // import { USFMParser } from '@usfm-tools/parser';

    console.log('⚙️  Applying Bible Translation Rules...');
    const bibleFormatted = await formatWithBibleRules(usfmInput);

    console.log('⚙️  Applying Study Bible Rules...');
    const studyFormatted = await formatWithStudyRules(usfmInput);

    console.log('⚙️  Applying Custom Poetry Rules...');
    const poetryFormatted = await formatWithPoetryRules(usfmInput);

    // Write output files
    const outputDir = path.join(__dirname, 'output');
    await ensureDirectoryExists(outputDir);

    await fs.writeFile(path.join(outputDir, 'complex-bible-format.usfm'), bibleFormatted);
    await fs.writeFile(path.join(outputDir, 'complex-study-format.usfm'), studyFormatted);
    await fs.writeFile(path.join(outputDir, 'complex-poetry-format.usfm'), poetryFormatted);

    console.log('\n✅ Formatting complete!');
    console.log('📁 Output files written to:', outputDir);
    console.log('   - complex-bible-format.usfm');
    console.log('   - complex-study-format.usfm');
    console.log('   - complex-poetry-format.usfm');

    // Show comparison
    console.log('\n📊 Format Comparison:');
    console.log('Original length:', usfmInput.length);
    console.log('Bible format length:', bibleFormatted.length);
    console.log('Study format length:', studyFormatted.length);
    console.log('Poetry format length:', poetryFormatted.length);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Simulate formatting with Bible translation rules
 */
async function formatWithBibleRules(usfm) {
  // This simulates the actual formatting process
  // In real usage, you would use the actual USFM parser and formatter

  const rules = {
    // Bible translation rules prioritize readability
    chapters: { before: '\n\n', after: ' ' },
    verses: { before: '\n', after: ' ' },
    paragraphs: { before: '\n', after: '' },
    poetry: { before: '\n', after: ' ' },
    lists: { before: '\n', after: ' ' },
  };

  console.log('   📋 Rules: Chapters with double breaks, verses on new lines');
  return simulateFormatting(usfm, rules, 'bible');
}

/**
 * Simulate formatting with Study Bible rules
 */
async function formatWithStudyRules(usfm) {
  const rules = {
    // Study Bible rules emphasize structure
    chapters: { before: '\n\n\n', after: '\n' },
    verses: { before: ' ', after: ' ' }, // Inline verses
    paragraphs: { before: '\n', after: '' },
    poetry: { before: '\n', after: '  ' }, // Extra indentation
    lists: { before: '\n', after: '  ' },
    sections: { before: '\n\n\n', after: '\n' }, // Major section breaks
  };

  console.log('   📋 Rules: Triple breaks for chapters/sections, inline verses');
  return simulateFormatting(usfm, rules, 'study');
}

/**
 * Simulate formatting with Poetry-focused rules
 */
async function formatWithPoetryRules(usfm) {
  const rules = {
    // Poetry rules emphasize verse structure
    chapters: { before: '\n\n', after: '\n' },
    verses: { before: '\n', after: ' ' },
    paragraphs: { before: '\n', after: '' },
    poetry: { before: '\n', after: ' ' },
    lists: { before: '\n  ', after: ' ' }, // Indented lists
    quotes: { before: '\n    ', after: ' ' }, // Indented quotes
  };

  console.log('   📋 Rules: Enhanced poetry formatting with proper indentation');
  return simulateFormatting(usfm, rules, 'poetry');
}

/**
 * Simulate the formatting process
 */
function simulateFormatting(usfm, rules, style) {
  // Basic simulation of USFM formatting
  // This is a simplified version of what the actual formatter does

  let formatted = usfm;

  // Normalize line endings
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Apply basic whitespace normalization
  formatted = formatted.replace(/\s+/g, ' ');
  formatted = formatted.replace(/\s*\\([a-zA-Z0-9]+)/g, '\n\\$1');

  // Style-specific formatting
  switch (style) {
    case 'bible':
      // Bible style: verses on new lines, chapters with double breaks
      formatted = formatted.replace(/\\c\s+/g, '\n\n\\c ');
      formatted = formatted.replace(/\\v\s+/g, '\n\\v ');
      formatted = formatted.replace(/\\p\s*/g, '\n\\p\n');
      break;

    case 'study':
      // Study style: inline verses, major section breaks
      formatted = formatted.replace(/\\c\s+/g, '\n\n\n\\c ');
      formatted = formatted.replace(/\\v\s+/g, ' \\v ');
      formatted = formatted.replace(/\\s[12]?\s*/g, '\n\n\n\\s$1\n');
      break;

    case 'poetry':
      // Poetry style: enhanced indentation
      formatted = formatted.replace(/\\q([12]?)\s*/g, (match, level) => {
        const indent = '  '.repeat(parseInt(level) || 1);
        return `\n${indent}\\q${level} `;
      });
      formatted = formatted.replace(/\\li([12]?)\s*/g, (match, level) => {
        const indent = '  '.repeat((parseInt(level) || 1) + 1);
        return `\n${indent}\\li${level} `;
      });
      break;
  }

  // Clean up extra whitespace
  formatted = formatted.replace(/\n\n\n+/g, '\n\n');
  formatted = formatted.replace(/^\s+|\s+$/g, '');

  return formatted + '\n';
}

/**
 * Ensure directory exists
 */
async function ensureDirectoryExists(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Real-world example of how to use the actual formatter
function createRealWorldExample() {
  return `
/*
 * Real-world usage with actual @usfm-tools packages:
 */

const { USFMFormatter, coreUSFMFormattingRules } = require('@usfm-tools/formatter');
const { USFMVisitor } = require('@usfm-tools/adapters');
const { USFMParser } = require('@usfm-tools/parser');

async function formatUSFMFile(inputPath, outputPath, customRules = []) {
  // Read input file
  const usfmInput = await fs.readFile(inputPath, 'utf8');
  
  // Parse USFM into AST
  const parser = new USFMParser();
  const ast = parser.load(usfmInput).parse();
  
  // Create formatter with rules
  const rules = [...coreUSFMFormattingRules, ...customRules];
  const formatter = new USFMFormatter(rules);
  
  // Apply formatting using visitor
  const visitor = new USFMVisitor({ formatter });
  const formatted = visitor.visit(ast);
  
  // Write output file
  await fs.writeFile(outputPath, formatted);
  
  return formatted;
}

// Custom rules for Bible translation
const bibleRules = [
  {
    id: 'chapter-breaks',
    name: 'Chapter Breaks',
    priority: 100,
    applies: { marker: 'c' },
    whitespace: { before: '\\n\\n', after: ' ' }
  },
  {
    id: 'verse-newlines',
    name: 'Verses on New Lines',
    priority: 90,
    applies: { marker: 'v' },
    whitespace: { before: '\\n', after: ' ' }
  },
  {
    id: 'poetry-formatting',
    name: 'Poetry Lines',
    priority: 80,
    applies: { pattern: /^q\\d*$/ },
    whitespace: { before: '\\n', after: ' ' }
  }
];

// Usage
formatUSFMFile('input.usfm', 'output.usfm', bibleRules);
`;
}

// Add the real-world example to output
console.log('\n' + '='.repeat(50));
console.log('📚 Real-World Usage Example:');
console.log('='.repeat(50));
console.log(createRealWorldExample());

if (require.main === module) {
  main();
}

module.exports = {
  formatWithBibleRules,
  formatWithStudyRules,
  formatWithPoetryRules,
};
