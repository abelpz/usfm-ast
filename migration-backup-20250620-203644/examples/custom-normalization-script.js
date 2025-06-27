#!/usr/bin/env node

/**
 * Custom USFM Normalization Script
 *
 * This script demonstrates how to use the rules-based normalization system
 * to create organization-specific USFM formatting.
 *
 * Usage:
 *   node custom-normalization-script.js input.usfm [output.usfm]
 *   node custom-normalization-script.js --batch "*.usfm"
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Import the normalization system
// Note: In a real project, you'd import from your built package
const { normalizeUSFM, coreUSFMFormattingRules } = require('../dist/index.mjs');

// Define your organization's custom formatting rules
const organizationRules = [
  // High priority organization-specific rules
  {
    id: 'org-chapter-double-newline',
    priority: 95,
    marker: 'c',
    before: '\n\n', // Double newline before chapters for better readability
    after: '\n',
  },

  {
    id: 'org-section-headers',
    priority: 90,
    markerType: 'paragraph',
    pattern: /^s\d*$/, // Section headers (s, s1, s2, etc.)
    before: '\n\n', // Extra spacing before sections
    after: '\n',
  },

  {
    id: 'org-poetry-formatting',
    priority: 88,
    markerType: 'paragraph',
    pattern: /^q\d*$/, // Poetry lines (q, q1, q2, etc.)
    before: '\n',
    after: '\n', // Newline after poetry for better flow
  },

  {
    id: 'org-list-formatting',
    priority: 85,
    markerType: 'paragraph',
    pattern: /^li\d*$/, // List items
    before: '\n',
    after: ' ',
  },

  {
    id: 'org-footnote-tight',
    priority: 82,
    marker: 'f',
    before: '', // No space before footnotes (tight formatting)
    after: ' ',
    exceptions: ['document-start'],
  },

  {
    id: 'org-cross-ref-tight',
    priority: 81,
    marker: 'x',
    before: '', // No space before cross-references
    after: ' ',
    exceptions: ['document-start'],
  },
];

// Combine organization rules with core rules
// Organization rules have higher priority and will override core rules
const allRules = [...organizationRules, ...coreUSFMFormattingRules];

/**
 * Normalize a single USFM file
 */
async function normalizeFile(inputPath, outputPath = null) {
  try {
    console.log(`📖 Reading: ${inputPath}`);
    const usfmContent = await fs.promises.readFile(inputPath, 'utf8');

    console.log(`⚙️  Applying ${allRules.length} formatting rules...`);
    const normalized = normalizeUSFM(usfmContent, undefined, allRules);

    const output = outputPath || inputPath.replace(/\.usfm$/, '.normalized.usfm');
    await fs.promises.writeFile(output, normalized, 'utf8');

    console.log(`✅ Normalized: ${output}`);

    // Show some statistics
    const originalLines = usfmContent.split('\n').length;
    const normalizedLines = normalized.split('\n').length;
    const originalSize = usfmContent.length;
    const normalizedSize = normalized.length;

    console.log(
      `📊 Stats: ${originalLines} → ${normalizedLines} lines, ${originalSize} → ${normalizedSize} chars`
    );

    return { success: true, input: inputPath, output };
  } catch (error) {
    console.error(`❌ Error normalizing ${inputPath}:`, error.message);
    return { success: false, input: inputPath, error: error.message };
  }
}

/**
 * Batch normalize multiple files
 */
async function batchNormalize(pattern) {
  console.log(`🔍 Finding files matching: ${pattern}`);
  const files = await glob(pattern);

  if (files.length === 0) {
    console.log('❌ No files found matching pattern');
    return;
  }

  console.log(`📁 Found ${files.length} files to normalize`);

  const results = [];
  for (const file of files) {
    const result = await normalizeFile(file);
    results.push(result);
  }

  // Summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('\n📋 Summary:');
  console.log(`✅ Successfully normalized: ${successful} files`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed} files`);
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`   - ${r.input}: ${r.error}`);
      });
  }
}

/**
 * Test the rules with sample USFM
 */
function testRules() {
  console.log('🧪 Testing formatting rules...\n');

  const testCases = [
    {
      name: 'Basic Structure',
      usfm: '\\id GEN Test\\c 1\\p\\v 1 In the beginning God created the heavens and the earth.',
    },
    {
      name: 'Poetry',
      usfm: '\\q1 The Lord is my shepherd,\\q2 I shall not want.',
    },
    {
      name: 'Footnotes',
      usfm: '\\p Jesus\\f + \\ft The name means "God saves"\\f* came to save.',
    },
    {
      name: 'Section Headers',
      usfm: '\\s1 The Creation\\p\\v 1 In the beginning...',
    },
    {
      name: 'Lists',
      usfm: '\\li1 First item\\li2 Sub item\\li1 Second item',
    },
  ];

  testCases.forEach((test, i) => {
    console.log(`Test ${i + 1}: ${test.name}`);
    console.log('Input: ', JSON.stringify(test.usfm));

    try {
      const normalized = normalizeUSFM(test.usfm, undefined, allRules);
      console.log('Output:', JSON.stringify(normalized));
      console.log('✅ Success\n');
    } catch (error) {
      console.log('❌ Error:', error.message);
      console.log('');
    }
  });
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
📚 Custom USFM Normalization Script

This script applies organization-specific formatting rules to USFM files.

Usage:
  node custom-normalization-script.js <input.usfm> [output.usfm]
  node custom-normalization-script.js --batch "<pattern>"
  node custom-normalization-script.js --test
  node custom-normalization-script.js --help

Examples:
  # Normalize single file
  node custom-normalization-script.js genesis.usfm

  # Normalize with custom output
  node custom-normalization-script.js genesis.usfm genesis-formatted.usfm

  # Batch normalize all USFM files in current directory
  node custom-normalization-script.js --batch "*.usfm"

  # Batch normalize all USFM files recursively
  node custom-normalization-script.js --batch "**/*.usfm"

  # Test the formatting rules
  node custom-normalization-script.js --test

Custom Rules Applied:
  - Double newlines before chapters
  - Extra spacing before section headers  
  - Proper poetry line formatting
  - Tight footnote and cross-reference spacing
  - Consistent list item formatting

Priority: Organization rules (80-95) override core rules (1-79)
`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--test')) {
    testRules();
    return;
  }

  if (args.includes('--batch')) {
    const patternIndex = args.indexOf('--batch') + 1;
    if (patternIndex >= args.length) {
      console.error('❌ Error: --batch requires a file pattern');
      console.log('Example: node script.js --batch "*.usfm"');
      return;
    }
    await batchNormalize(args[patternIndex]);
    return;
  }

  // Single file normalization
  const inputFile = args[0];
  const outputFile = args[1];

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: Input file not found: ${inputFile}`);
    return;
  }

  await normalizeFile(inputFile, outputFile);
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

// Export for use as a module
module.exports = {
  normalizeFile,
  batchNormalize,
  organizationRules,
  allRules,
};
