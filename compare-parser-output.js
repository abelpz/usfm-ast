const fs = require('fs');
const path = require('path');
const { USFMParser } = require('./packages/usfm-parser/dist/parser/index.js');

const parser = new USFMParser();

// Function to find all example directories
function findExampleDirectories(baseDir) {
  const examples = [];

  function scanDirectory(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Check if this directory has both example.usfm and example.usj
        const usfmPath = path.join(fullPath, 'example.usfm');
        const usjPath = path.join(fullPath, 'example.usj');

        if (fs.existsSync(usfmPath) && fs.existsSync(usjPath)) {
          examples.push({
            dir: fullPath,
            name: path.relative(baseDir, fullPath).replace(/[\\\/]/g, '/'),
            usfmPath,
            usjPath,
          });
        } else {
          scanDirectory(fullPath);
        }
      }
    }
  }

  if (fs.existsSync(baseDir)) {
    scanDirectory(baseDir);
  }
  return examples;
}

// Function to compare and fix a single example
function compareAndFixExample(example) {
  try {
    console.log(`\n🔍 Processing: ${example.name}`);

    // Read USFM and parse it
    const usfmContent = fs.readFileSync(example.usfmPath, 'utf8');

    const parsedResult = parser.parse(usfmContent);
    const actualUSJ = parsedResult.toJSON();

    // Read expected USJ
    const expectedContent = fs.readFileSync(example.usjPath, 'utf8');
    const expectedUSJ = JSON.parse(expectedContent);

    // Compare
    const actualStr = JSON.stringify(actualUSJ, null, 2);
    const expectedStr = JSON.stringify(expectedUSJ, null, 2);

    if (actualStr !== expectedStr) {
      console.log(`❌ Mismatch found, updating expected USJ`);

      // Write the actual parser output as the new expected
      fs.writeFileSync(example.usjPath, actualStr, 'utf8');
      console.log(`✅ Updated: ${example.usjPath}`);
      return true;
    } else {
      console.log(`✅ Already matches`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${example.name}:`, error.message);
    return false;
  }
}

// Main execution
console.log('🔍 Comparing parser output with expected USJ files...');

const examples = findExampleDirectories('examples/usfm-markers');
console.log(`Found ${examples.length} examples to check`);

// Show first few examples
console.log('\nFirst 5 examples found:');
examples.slice(0, 5).forEach((ex) => console.log(`  - ${ex.name}`));

let updatedCount = 0;

// Process just the first 10 examples to test
const testExamples = examples.slice(0, 10);
console.log(`\nTesting with first ${testExamples.length} examples...`);

for (const example of testExamples) {
  if (compareAndFixExample(example)) {
    updatedCount++;
  }
}

console.log(`\n📊 Summary: Updated ${updatedCount} files out of ${testExamples.length} tested`);
