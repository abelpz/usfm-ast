#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Extract code examples from AsciiDoc files
 * Looks for [tabs] sections and extracts USFM, USX, and USJ code blocks
 */

/**
 * Check if content is valid (not "Missing", not empty, not just whitespace)
 */
function isValidContent(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();

  // Check for common invalid content patterns
  if (
    trimmed === '' ||
    trimmed.toLowerCase() === 'missing' ||
    trimmed === 'TBD' ||
    trimmed === 'TODO' ||
    trimmed.startsWith('//') || // Comments only
    trimmed.length < 3
  ) {
    // Too short to be meaningful
    return false;
  }

  return true;
}

/**
 * Check if USFM content is valid (not XML/USX content)
 */
function isValidUSFM(content) {
  if (!isValidContent(content)) {
    return false;
  }

  const trimmed = content.trim();

  // Check if it's XML/USX content (starts with < or contains XML tags)
  if (
    trimmed.startsWith('<') ||
    trimmed.includes('<usx') ||
    trimmed.includes('<para') ||
    trimmed.includes('<verse') ||
    trimmed.includes('<char') ||
    trimmed.includes('</')
  ) {
    return false;
  }

  return true;
}

/**
 * Check if USJ content is valid JSON with proper USJ structure
 */
function isValidUSJ(content) {
  if (!isValidContent(content)) {
    return false;
  }

  try {
    const parsed = JSON.parse(content);

    // Check if it has proper USJ structure
    if (typeof parsed !== 'object' || !parsed) {
      return false;
    }

    // Must have type: "USJ" and version
    if (parsed.type !== 'USJ' || !parsed.version) {
      return false;
    }

    // Must have content array
    if (!Array.isArray(parsed.content)) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Detect the actual format of content regardless of what the header claims
 */
function detectContentFormat(content) {
  if (!isValidContent(content)) {
    return null;
  }

  const trimmed = content.trim();

  // Check if it's XML/USX (starts with < or contains XML tags)
  if (
    trimmed.startsWith('<') ||
    trimmed.includes('<usx') ||
    trimmed.includes('<para') ||
    trimmed.includes('<verse') ||
    trimmed.includes('<char') ||
    trimmed.includes('</')
  ) {
    return 'usx';
  }

  // Check if it's valid JSON (could be USJ)
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed) {
      // Check if it's proper USJ structure
      if (parsed.type === 'USJ' && parsed.version && Array.isArray(parsed.content)) {
        return 'usj';
      }
      // Could be partial USJ content (array of nodes)
      if (Array.isArray(parsed)) {
        return 'usj';
      }
      // Could be a single USJ node
      if (parsed.type && ['para', 'char', 'verse', 'chapter', 'book'].includes(parsed.type)) {
        return 'usj';
      }
    }
    return null; // JSON but not recognizable USJ
  } catch (error) {
    // Not JSON, continue checking
  }

  // Check if it looks like USFM (contains USFM markers)
  if (
    trimmed.includes('\\id ') ||
    trimmed.includes('\\c ') ||
    trimmed.includes('\\v ') ||
    trimmed.includes('\\p') ||
    trimmed.includes('\\h ') ||
    trimmed.includes('\\s ') ||
    trimmed.match(/\\[a-zA-Z]+[0-9]*\s/)
  ) {
    return 'usfm';
  }

  // Default to unknown
  return null;
}

/**
 * Check if an example has at least one valid format with proper format validation
 */
function hasValidFormats(example) {
  const hasValidUSFM = isValidUSFM(example.usfm);
  const hasValidUSX = isValidContent(example.usx); // USX validation can use general content check for now
  const hasValidUSJ = isValidUSJ(example.usj);

  return hasValidUSFM || hasValidUSX || hasValidUSJ;
}

function extractExamples(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const examples = [];
  let currentExample = null;
  let inTabsSection = false;
  let inCodeBlock = false;
  let currentFormat = null;
  let currentCodeLines = [];
  let currentDescription = '';
  let debugMode = false; // Set to true for debugging

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (debugMode) {
      console.log(
        `Line ${i + 1}: "${trimmedLine}" | inTabsSection: ${inTabsSection} | inCodeBlock: ${inCodeBlock} | currentFormat: ${currentFormat}`
      );
    }

    // Start of a tabs section
    if (trimmedLine === '[tabs]') {
      if (debugMode) console.log(`  Found [tabs] at line ${i + 1}`);
      inTabsSection = 'started';
      currentExample = {
        usfm: null,
        usx: null,
        usj: null,
        descriptions: {},
      };
      continue;
    }

    // Handle the tabs section delimiters
    if (inTabsSection && trimmedLine === '======') {
      if (inTabsSection === 'started') {
        // This is the opening ======
        if (debugMode) console.log(`  Found opening ====== at line ${i + 1}`);
        inTabsSection = 'active';
        continue;
      } else if (inTabsSection === 'active') {
        // This is the closing ======
        if (debugMode) console.log(`  Found closing ====== at line ${i + 1}`);

        // Only save the example if it has valid content
        if (currentExample && hasValidFormats(currentExample)) {
          // Clean up invalid formats before saving
          if (!isValidUSFM(currentExample.usfm)) currentExample.usfm = null;
          if (!isValidContent(currentExample.usx)) currentExample.usx = null;
          if (!isValidUSJ(currentExample.usj)) currentExample.usj = null;

          examples.push(currentExample);
          if (debugMode) {
            const validFormats = Object.keys(currentExample)
              .filter((k) => currentExample[k] && k !== 'descriptions')
              .join(', ');
            console.log(`  Saved example with valid formats: ${validFormats}`);
          }
        } else if (debugMode && currentExample) {
          console.log(`  Skipped example - no valid content found`);
        }

        currentExample = null;
        inTabsSection = false;
        currentFormat = null;
        inCodeBlock = false;
        continue;
      }
    }

    if (inTabsSection === 'active') {
      // Check for format headers (USFM::, USX::, USJ::)
      if (trimmedLine.endsWith('::')) {
        const format = trimmedLine.slice(0, -2).toLowerCase();
        if (['usfm', 'usx', 'usj'].includes(format)) {
          currentFormat = format;
          currentDescription = '';
          if (debugMode) console.log(`  Found format: ${format} at line ${i + 1}`);
        }
        continue;
      }

      // Check for description line (starts with .)
      if (currentFormat && trimmedLine.startsWith('.') && !inCodeBlock) {
        currentDescription = trimmedLine.slice(1).trim();
        if (debugMode) console.log(`  Found description: ${currentDescription} at line ${i + 1}`);
        continue;
      }

      // Check for source block start
      if (currentFormat && trimmedLine.startsWith('[source#')) {
        inCodeBlock = true;
        currentCodeLines = [];
        if (debugMode)
          console.log(`  Found source block start for ${currentFormat} at line ${i + 1}`);
        continue;
      }

      // Check for code block delimiter
      if (trimmedLine === '----') {
        if (inCodeBlock && currentCodeLines.length > 0) {
          // End of code block - validate and save the content
          const codeContent = currentCodeLines.join('\n').trim();

          // Auto-detect the actual format instead of trusting the header
          const detectedFormat = detectContentFormat(codeContent);

          if (currentExample && detectedFormat) {
            // Use the detected format, not the header-claimed format
            currentExample[detectedFormat] = codeContent;
            currentExample.descriptions[detectedFormat] = currentDescription;

            // Log when format detection differs from header
            if (detectedFormat !== currentFormat) {
              console.log(
                `📝 Format mismatch in ${currentExample.id}: Header says '${currentFormat}', detected '${detectedFormat}'`
              );
            }
            if (debugMode)
              console.log(
                `  Saved valid ${currentFormat} content (${codeContent.length} chars) at line ${i + 1}`
              );
          } else if (debugMode) {
            console.log(
              `  Skipped invalid ${currentFormat} content at line ${i + 1}: "${codeContent.substring(0, 20)}..."`
            );
          }

          inCodeBlock = false;
          currentFormat = null;
          currentCodeLines = [];
        } else if (currentFormat) {
          // Start of code block content
          inCodeBlock = true;
          if (debugMode)
            console.log(`  Started collecting code content for ${currentFormat} at line ${i + 1}`);
        }
        continue;
      }

      // Collect code lines
      if (inCodeBlock && currentFormat && trimmedLine !== '----') {
        currentCodeLines.push(line);
        if (debugMode) console.log(`  Collected code line for ${currentFormat}: "${line}"`);
      }
    }
  }

  return examples;
}

function saveExamples(examples, outputDir, fileName) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.basename(fileName, '.adoc');
  let validExampleCount = 0;

  examples.forEach((example, index) => {
    // Double-check that the example has valid formats before saving
    if (!hasValidFormats(example)) {
      console.warn(`Skipping example ${index + 1} - no valid formats`);
      return;
    }

    validExampleCount++;
    const exampleDir = path.join(outputDir, `${baseName}-example-${validExampleCount}`);
    if (!fs.existsSync(exampleDir)) {
      fs.mkdirSync(exampleDir, { recursive: true });
    }

    // Save each format if it exists and is valid
    if (isValidUSFM(example.usfm)) {
      fs.writeFileSync(path.join(exampleDir, 'example.usfm'), example.usfm);
    }

    if (isValidContent(example.usx)) {
      fs.writeFileSync(path.join(exampleDir, 'example.usx'), example.usx);
    }

    if (isValidUSJ(example.usj)) {
      fs.writeFileSync(path.join(exampleDir, 'example.usj'), example.usj);
    }

    // Save metadata
    const metadata = {
      descriptions: example.descriptions,
      formats: {
        usfm: isValidUSFM(example.usfm),
        usx: isValidContent(example.usx),
        usj: isValidUSJ(example.usj),
      },
    };

    fs.writeFileSync(path.join(exampleDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  });

  if (validExampleCount < examples.length) {
    console.log(
      `Note: Saved ${validExampleCount} valid examples out of ${examples.length} total found`
    );
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] || 'temp/usfm-docs/markers/cat/cat.adoc';
  const outputDir = args[1] || 'temp/extracted-examples';

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Extracting examples from: ${inputFile}`);

  try {
    const examples = extractExamples(inputFile);
    const validExamples = examples.filter(hasValidFormats);

    console.log(`Found ${examples.length} total examples`);
    console.log(`Found ${validExamples.length} valid examples`);

    if (examples.length > validExamples.length) {
      console.log(
        `Filtered out ${examples.length - validExamples.length} examples with invalid/missing content`
      );
    }

    if (validExamples.length > 0) {
      saveExamples(validExamples, outputDir, inputFile);
      console.log(`Valid examples saved to: ${outputDir}`);

      // Print summary
      validExamples.forEach((example, index) => {
        console.log(`\nExample ${index + 1}:`);
        console.log(`  USFM: ${isValidUSFM(example.usfm) ? 'Yes' : 'No'}`);
        console.log(`  USX: ${isValidContent(example.usx) ? 'Yes' : 'No'}`);
        console.log(`  USJ: ${isValidUSJ(example.usj) ? 'Yes' : 'No'}`);
        if (example.descriptions.usfm) {
          console.log(`  Description: ${example.descriptions.usfm}`);
        }
      });

      console.log(`\nExtracted examples are ready for conversion testing!`);
      console.log(`You can now use these files to test conversions like:`);
      console.log(`  - USFM → USJ`);
      console.log(`  - USFM → USX`);
      console.log(`  - USJ → USFM`);
      console.log(`  - USJ → USX`);
      console.log(`  - USX → USJ`);
      console.log(`  - USX → USFM`);
    } else {
      console.log('No valid examples found in the file.');
    }
  } catch (error) {
    console.error('Error extracting examples:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractExamples,
  saveExamples,
  isValidContent,
  isValidUSFM,
  isValidUSJ,
  detectContentFormat,
  hasValidFormats,
};
