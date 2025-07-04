const fs = require('fs');
const path = require('path');

// Function to fix spacing in character marker content
function fixCharacterMarkerSpacing(contentArray) {
  let hasChanges = false;
  const newContent = [...contentArray];

  for (let i = 0; i < newContent.length; i++) {
    const item = newContent[i];

    if (typeof item === 'object' && item.type === 'char') {
      // List of note content markers that should typically have trailing spaces
      const noteContentMarkers = [
        'xo',
        'xt',
        'fr',
        'ft',
        'fq',
        'fqa',
        'fk',
        'fl',
        'fw',
        'fp',
        'fv',
        'fdc',
        'fm',
      ];

      if (noteContentMarkers.includes(item.marker) && Array.isArray(item.content)) {
        // Check each text content item
        let itemChanged = false;
        const newItemContent = [...item.content];

        for (let j = 0; j < newItemContent.length; j++) {
          const contentItem = newItemContent[j];

          if (typeof contentItem === 'string') {
            let updatedText = contentItem;

            // Add space after colon if missing
            if (contentItem.endsWith(':') && !contentItem.endsWith(': ')) {
              updatedText = contentItem + ' ';
              newItemContent[j] = updatedText;
              itemChanged = true;
              console.log(`  Fixed colon spacing: "${contentItem}" → "${updatedText}"`);
            }
            // Add space after semicolon if missing
            else if (contentItem.endsWith(';') && !contentItem.endsWith('; ')) {
              updatedText = contentItem + ' ';
              newItemContent[j] = updatedText;
              itemChanged = true;
              console.log(`  Fixed semicolon spacing: "${contentItem}" → "${updatedText}"`);
            }
            // Add space after reference patterns like "15.51,52" if missing
            else if (contentItem.match(/\d+\.\d+(-\d+)?,?\d*:?$/) && !contentItem.endsWith(' ')) {
              updatedText = contentItem + ' ';
              newItemContent[j] = updatedText;
              itemChanged = true;
              console.log(`  Fixed reference spacing: "${contentItem}" → "${updatedText}"`);
            }
          }
        }

        if (itemChanged) {
          newContent[i] = { ...item, content: newItemContent };
          hasChanges = true;
        }
      }

      // Recursively check nested content
      if (item.content && Array.isArray(item.content)) {
        const result = fixCharacterMarkerSpacing(item.content);
        if (result.hasChanges) {
          if (!hasChanges || !newContent[i].content) {
            newContent[i] = { ...newContent[i], content: result.content };
          }
          hasChanges = true;
        }
      }
    }
  }

  return { content: newContent, hasChanges };
}

// Function to fix spacing in USJ content recursively
function fixUSJContentSpacing(obj) {
  let hasChanges = false;

  if (Array.isArray(obj)) {
    const result = fixCharacterMarkerSpacing(obj);
    return result;
  }

  if (typeof obj === 'object' && obj !== null) {
    const newObj = { ...obj };

    for (const key in obj) {
      if (key === 'content' && Array.isArray(obj[key])) {
        const result = fixUSJContentSpacing(obj[key]);
        if (result.hasChanges) {
          newObj[key] = result.content;
          hasChanges = true;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        const result = fixUSJContentSpacing(obj[key]);
        if (result.hasChanges) {
          newObj[key] = result.content;
          hasChanges = true;
        }
      }
    }

    return { content: newObj, hasChanges };
  }

  return { content: obj, hasChanges: false };
}

// Function to process a single USJ file
function processUSJFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const usj = JSON.parse(content);

    const result = fixUSJContentSpacing(usj);

    if (result.hasChanges) {
      const updatedContent = JSON.stringify(result.content, null, 2);
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      console.log(`✅ Fixed spacing in: ${path.relative('.', filePath)}`);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Function to find all USJ files
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
