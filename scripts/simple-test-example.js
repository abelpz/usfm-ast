#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Simple example showing how to write individual conversion tests
 * using the extracted examples
 */

// Mock converter function - replace with your actual implementation
function myUSFMToUSJConverter(usfmContent) {
  // TODO: Replace this with your actual USFM to USJ conversion logic
  // This is just a placeholder that will fail the test
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      {
        type: 'book',
        marker: 'id',
        code: 'MAT',
        content: [],
      },
    ],
  };
}

// Test helper to load an example file
function loadExample(examplePath, format) {
  const filePath = path.join(examplePath, `example.${format}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Example file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Parse JSON for USJ format
  if (format === 'usj') {
    return JSON.parse(content);
  }

  return content;
}

// Simple test function
function testUSFMToUSJ(examplePath, testName) {
  console.log(`\n🧪 Testing: ${testName}`);
  console.log(`Example: ${path.basename(examplePath)}`);

  try {
    // Load the USFM input and expected USJ output
    const usfmInput = loadExample(examplePath, 'usfm');
    const expectedUSJ = loadExample(examplePath, 'usj');

    console.log('Input USFM preview:', usfmInput.slice(0, 100) + '...');

    // Run the conversion
    const actualUSJ = myUSFMToUSJConverter(usfmInput);

    // Compare results (simplified comparison)
    const expectedStr = JSON.stringify(expectedUSJ, null, 2);
    const actualStr = JSON.stringify(actualUSJ, null, 2);

    if (expectedStr === actualStr) {
      console.log('✅ PASS - Conversion successful!');
      return true;
    } else {
      console.log('❌ FAIL - Conversion does not match expected output');
      console.log('Expected content array length:', expectedUSJ.content?.length || 0);
      console.log('Actual content array length:  ', actualUSJ.content?.length || 0);

      // Show some differences
      if (expectedUSJ.content && actualUSJ.content) {
        console.log('Expected first item type:', expectedUSJ.content[0]?.type);
        console.log('Actual first item type:  ', actualUSJ.content[0]?.type);
      }

      return false;
    }
  } catch (error) {
    console.log('❌ ERROR -', error.message);
    return false;
  }
}

// Example of how you might structure tests in a test framework like Jest
function exampleJestTest() {
  return `
// Example Jest test using extracted examples
// You would put this in a .test.js file

const { loadExample } = require('./test-helpers');
const { convertUSFMToUSJ } = require('./my-converter');

describe('USFM to USJ Conversion', () => {
  test('should convert cat example 1 correctly', () => {
    const examplePath = 'temp/extracted-examples/cat-example-1';
    const usfmInput = loadExample(examplePath, 'usfm');
    const expectedUSJ = loadExample(examplePath, 'usj');
    
    const result = convertUSFMToUSJ(usfmInput);
    
    expect(result).toEqual(expectedUSJ);
  });
  
  test('should convert cat example 2 correctly', () => {
    const examplePath = 'temp/extracted-examples/cat-example-2';
    const usfmInput = loadExample(examplePath, 'usfm');
    const expectedUSJ = loadExample(examplePath, 'usj');
    
    const result = convertUSFMToUSJ(usfmInput);
    
    expect(result).toEqual(expectedUSJ);
  });
});

// You can also test the reverse direction
describe('USJ to USFM Conversion', () => {
  test('should convert cat example 1 correctly', () => {
    const examplePath = 'temp/extracted-examples/cat-example-1';
    const usjInput = loadExample(examplePath, 'usj');
    const expectedUSFM = loadExample(examplePath, 'usfm');
    
    const result = convertUSJToUSFM(usjInput);
    
    expect(result.trim()).toBe(expectedUSFM.trim());
  });
});
  `;
}

// Main execution
function main() {
  console.log('📝 Simple Test Example');
  console.log('======================');
  console.log('This shows how to write individual tests using extracted examples.');

  const examplesDir = 'temp/extracted-examples';

  if (!fs.existsSync(examplesDir)) {
    console.error('\nNo extracted examples found.');
    console.error('Run: node scripts/extract-examples.js first');
    return;
  }

  // Find available examples
  const examples = fs
    .readdirSync(examplesDir)
    .filter((name) => fs.statSync(path.join(examplesDir, name)).isDirectory())
    .map((name) => path.join(examplesDir, name));

  if (examples.length === 0) {
    console.log('No example directories found.');
    return;
  }

  console.log(`\nFound ${examples.length} examples. Running simple tests...`);

  let passed = 0;
  let total = 0;

  // Test each example
  for (const example of examples) {
    const testName = `USFM → USJ conversion for ${path.basename(example)}`;
    const result = testUSFMToUSJ(example, testName);

    if (result) passed++;
    total++;
  }

  console.log(`\n📊 Results: ${passed}/${total} tests passed`);

  if (passed === 0) {
    console.log("\n💡 All tests failed because we're using a mock converter.");
    console.log('Replace the myUSFMToUSJConverter function with your real implementation.');
  }

  console.log('\n📋 Jest Test Example:');
  console.log(exampleJestTest());
}

if (require.main === module) {
  main();
}

module.exports = {
  loadExample,
  testUSFMToUSJ,
  myUSFMToUSJConverter,
};
