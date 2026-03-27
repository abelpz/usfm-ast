#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Example test file showing how to use extracted examples for conversion testing
 * This demonstrates the testing approach for bidirectional conversions
 */

// Mock converter functions - these would be your actual conversion implementations
function convertUSFMToUSJ(usfmContent) {
  // TODO: Implement actual USFM to USJ conversion
  // For now, just return a placeholder
  console.log('Converting USFM to USJ...');
  return { type: 'USJ', version: '3.1', content: [] };
}

function convertUSFMToUSX(usfmContent) {
  // TODO: Implement actual USFM to USX conversion
  console.log('Converting USFM to USX...');
  return '<usx version="3.0"></usx>';
}

function convertUSJToUSFM(usjContent) {
  // TODO: Implement actual USJ to USFM conversion
  console.log('Converting USJ to USFM...');
  return '// Generated USFM content';
}

function convertUSJToUSX(usjContent) {
  // TODO: Implement actual USJ to USX conversion
  console.log('Converting USJ to USX...');
  return '<usx version="3.0"></usx>';
}

function convertUSXToUSFM(usxContent) {
  // TODO: Implement actual USX to USFM conversion
  console.log('Converting USX to USFM...');
  return '// Generated USFM content';
}

function convertUSXToUSJ(usxContent) {
  // TODO: Implement actual USX to USJ conversion
  console.log('Converting USX to USJ...');
  return { type: 'USJ', version: '3.1', content: [] };
}

// Test helper functions
function loadExample(exampleDir, format) {
  const filePath = path.join(exampleDir, `example.${format}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${format.toUpperCase()} example not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Parse JSON for USJ
  if (format === 'usj') {
    return JSON.parse(content);
  }

  return content;
}

function normalizeForComparison(content, format) {
  if (format === 'usj') {
    // For USJ, stringify with consistent formatting
    return JSON.stringify(content, null, 2);
  }

  // For text formats, normalize whitespace
  return content.trim().replace(/\r\n/g, '\n');
}

// Test runner
function runConversionTest(exampleDir, fromFormat, toFormat, converter) {
  console.log(`\nTesting ${fromFormat.toUpperCase()} → ${toFormat.toUpperCase()}`);
  console.log(`Example: ${path.basename(exampleDir)}`);

  try {
    // Load input and expected output
    const input = loadExample(exampleDir, fromFormat);
    const expected = loadExample(exampleDir, toFormat);

    // Run conversion
    const actual = converter(input);

    // Normalize for comparison
    const normalizedActual = normalizeForComparison(actual, toFormat);
    const normalizedExpected = normalizeForComparison(expected, toFormat);

    // Compare results
    if (normalizedActual === normalizedExpected) {
      console.log('✅ PASS - Conversion matches expected output');
      return true;
    } else {
      console.log('❌ FAIL - Conversion does not match expected output');
      console.log('Expected length:', normalizedExpected.length);
      console.log('Actual length:  ', normalizedActual.length);

      // Show first difference
      const minLength = Math.min(normalizedExpected.length, normalizedActual.length);
      for (let i = 0; i < minLength; i++) {
        if (normalizedExpected[i] !== normalizedActual[i]) {
          console.log(`First difference at position ${i}:`);
          console.log(`Expected: "${normalizedExpected.slice(i, i + 50)}..."`);
          console.log(`Actual:   "${normalizedActual.slice(i, i + 50)}..."`);
          break;
        }
      }
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR - ${error.message}`);
    return false;
  }
}

// Test suite for a single example directory
function runExampleTests(exampleDir) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing example: ${path.basename(exampleDir)}`);
  console.log(`${'='.repeat(60)}`);

  // Load metadata
  const metadataPath = path.join(exampleDir, 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  console.log(
    'Available formats:',
    Object.keys(metadata.formats)
      .filter((f) => metadata.formats[f])
      .join(', ')
  );
  console.log('Description:', metadata.descriptions.usfm || 'No description');

  const results = [];

  // Test all possible conversions based on available formats
  if (metadata.formats.usfm) {
    if (metadata.formats.usj) {
      results.push(runConversionTest(exampleDir, 'usfm', 'usj', convertUSFMToUSJ));
    }
    if (metadata.formats.usx) {
      results.push(runConversionTest(exampleDir, 'usfm', 'usx', convertUSFMToUSX));
    }
  }

  if (metadata.formats.usj) {
    if (metadata.formats.usfm) {
      results.push(runConversionTest(exampleDir, 'usj', 'usfm', convertUSJToUSFM));
    }
    if (metadata.formats.usx) {
      results.push(runConversionTest(exampleDir, 'usj', 'usx', convertUSJToUSX));
    }
  }

  if (metadata.formats.usx) {
    if (metadata.formats.usfm) {
      results.push(runConversionTest(exampleDir, 'usx', 'usfm', convertUSXToUSFM));
    }
    if (metadata.formats.usj) {
      results.push(runConversionTest(exampleDir, 'usx', 'usj', convertUSXToUSJ));
    }
  }

  const passed = results.filter((r) => r === true).length;
  const total = results.length;

  console.log(`\nExample Summary: ${passed}/${total} tests passed`);
  return { passed, total };
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const examplesDir = args[0] || 'temp/extracted-examples';

  if (!fs.existsSync(examplesDir)) {
    console.error(`Examples directory not found: ${examplesDir}`);
    console.error('Run the extract-examples.js script first to generate test data.');
    process.exit(1);
  }

  console.log('🧪 Conversion Test Suite');
  console.log('========================');
  console.log('This is a demonstration of how to use extracted examples for conversion testing.');
  console.log('Note: Converter functions are currently mock implementations.');

  const exampleDirs = fs
    .readdirSync(examplesDir)
    .filter((name) => fs.statSync(path.join(examplesDir, name)).isDirectory())
    .map((name) => path.join(examplesDir, name));

  if (exampleDirs.length === 0) {
    console.log('No example directories found.');
    return;
  }

  let totalPassed = 0;
  let totalTests = 0;

  for (const exampleDir of exampleDirs) {
    const result = runExampleTests(exampleDir);
    totalPassed += result.passed;
    totalTests += result.total;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Overall Results: ${totalPassed}/${totalTests} tests passed`);
  console.log(`${'='.repeat(60)}`);

  if (totalPassed === totalTests) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Implement the converter functions to make them pass.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runConversionTest,
  runExampleTests,
  // Export converter functions for individual testing
  convertUSFMToUSJ,
  convertUSFMToUSX,
  convertUSJToUSFM,
  convertUSJToUSX,
  convertUSXToUSFM,
  convertUSXToUSJ,
};
