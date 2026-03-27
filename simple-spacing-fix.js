const fs = require('fs');
const path = require('path');

// Simple function to fix text content in place
function fixTextSpacing(text) {
  if (typeof text !== 'string') return text;

  // Add space after colon if missing
  if (text.endsWith(':') && !text.endsWith(': ')) {
    return text + ' ';
  }

  // Add space after semicolon if missing
  if (text.endsWith(';') && !text.endsWith('; ')) {
    return text + ' ';
  }

  return text;
}

// Simple recursive function to fix content
function fixContentRecursive(obj) {
  if (typeof obj === 'string') {
    return fixTextSpacing(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => fixContentRecursive(item));
  }

  if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = fixContentRecursive(obj[key]);
    }
    return newObj;
  }

  return obj;
}

// Function to process a single USJ file
function processUSJFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const usj = JSON.parse(originalContent);

    const fixedUSJ = fixContentRecursive(usj);
    const newContent = JSON.stringify(fixedUSJ, null, 2);

    if (originalContent !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Fixed: ${path.relative('.', filePath)}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Find all USJ files
function findUSJFiles(baseDir) {
  const usjFiles = [];

  function scanDirectory(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (item === 'example.usj') {
        usjFiles.push(fullPath);
      }
    }
  }

  if (fs.existsSync(baseDir)) {
    scanDirectory(baseDir);
  }
  return usjFiles;
}

// Main execution
console.log('🔍 Fixing USJ spacing issues...');

const usjFiles = findUSJFiles('examples/usfm-markers');
console.log(`Found ${usjFiles.length} USJ files to check`);

let fixedFiles = 0;

for (const file of usjFiles) {
  if (processUSJFile(file)) {
    fixedFiles++;
  }
}

console.log(`\n📊 Summary: Fixed spacing in ${fixedFiles} files`);
