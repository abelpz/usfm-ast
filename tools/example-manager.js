#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// Default paths
const DEFAULT_EXAMPLES_DIR = 'examples/usfm-markers';
const TEMPLATE_DIR = path.join(__dirname, 'templates');

// Marker categories for organizing examples
const MARKER_CATEGORIES = {
  char: 'Character markers (inline formatting)',
  para: 'Paragraph markers (block-level)',
  cv: 'Chapter and verse markers',
  note: 'Note markers (footnotes, cross-references)',
  ms: 'Milestone markers',
  fig: 'Figure markers',
  cat: 'Category markers',
  sbar: 'Sidebar markers',
  periph: 'Peripheral markers',
  doc: 'Document markers',
};

// USFM marker templates
const MARKER_TEMPLATES = {
  char: {
    template:
      '\\id GEN\n\\c 1\n\\p\n\\v 1 In the beginning God created the \\{marker} heavens\\{marker}* and the earth.',
    description: 'Character marker template with inline formatting',
  },
  para: {
    template:
      '\\id GEN\n\\c 1\n\\{marker} Paragraph content goes here.\n\\p\n\\v 1 Verse content follows.',
    description: 'Paragraph marker template',
  },
  cv: {
    template: '\\id GEN\n\\c 1\n\\{marker} 1\n\\p\n\\v 1 Verse content.',
    description: 'Chapter/verse marker template',
  },
  note: {
    template:
      '\\id GEN\n\\c 1\n\\p\n\\v 1 Text with \\{marker} + Note content.\\{marker}* continues.',
    description: 'Note marker template',
  },
  ms: {
    template:
      '\\id GEN\n\\c 1\n\\p\n\\v 1 Text with \\{marker} milestone content\\{marker}* continues.',
    description: 'Milestone marker template',
  },
  fig: {
    template:
      '\\id GEN\n\\c 1\n\\p\n\\v 1 Text before figure.\n\\{marker} ALT="Description" SRC="image.jpg" SIZE="col" REF="1:1"\\{marker}*\n\\p Continue after figure.',
    description: 'Figure marker template',
  },
  default: {
    template:
      '\\id GEN\n\\c 1\n\\p\n\\v 1 Example content with \\{marker} marker content\\{marker}*.',
    description: 'Default marker template',
  },
};

/**
 * Get the category from a marker name (e.g., 'char-add' -> 'char')
 */
function getCategoryFromMarker(markerName) {
  const parts = markerName.split('-');
  return parts[0];
}

/**
 * Get the appropriate template for a marker
 */
function getTemplate(markerName) {
  const category = getCategoryFromMarker(markerName);
  return MARKER_TEMPLATES[category] || MARKER_TEMPLATES.default;
}

/**
 * Create directory structure for a new example
 */
function createExampleStructure(examplesDir, markerName, exampleName) {
  const exampleDir = path.join(examplesDir, markerName, exampleName);

  if (fs.existsSync(exampleDir)) {
    console.log(`❌ Example already exists: ${exampleDir}`);
    return null;
  }

  // Create directory
  fs.mkdirSync(exampleDir, { recursive: true });
  console.log(`📁 Created directory: ${exampleDir}`);

  return exampleDir;
}

/**
 * Generate USFM template content
 */
function generateUSFMContent(markerName) {
  const template = getTemplate(markerName);
  const marker = markerName.split('-')[1] || markerName; // Extract marker from 'char-add' -> 'add'

  let content = template.template.replace(/\\{marker}/g, `\\${marker}`);

  // Handle special cases
  if (markerName.startsWith('cv-')) {
    content = content.replace(`\\${marker} 1`, `\\${marker} 1`);
  }

  return content;
}

/**
 * Generate metadata.json content
 */
function generateMetadata(markerName, exampleName, description = '') {
  const category = getCategoryFromMarker(markerName);
  const marker = markerName.split('-')[1] || markerName;

  return {
    marker: marker,
    category: category,
    example: exampleName,
    description: description || `Example usage of \\${marker} marker`,
    source: 'Generated template',
    created: new Date().toISOString().split('T')[0],
  };
}

/**
 * Generate empty USJ template
 */
function generateEmptyUSJ() {
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      {
        type: 'book',
        marker: 'id',
        code: 'GEN',
        content: [],
      },
      {
        type: 'chapter',
        marker: 'c',
        number: '1',
        sid: 'GEN 1',
      },
      {
        type: 'para',
        marker: 'p',
        content: [
          {
            type: 'verse',
            marker: 'v',
            number: '1',
            sid: 'GEN 1:1',
          },
          'Example content - edit this USJ to match your USFM',
        ],
      },
    ],
  };
}

/**
 * Find examples that have USFM but missing USJ
 */
function findMissingUSJExamples(examplesDir) {
  const missingExamples = [];

  if (!fs.existsSync(examplesDir)) {
    return missingExamples;
  }

  const categories = fs
    .readdirSync(examplesDir)
    .filter((item) => fs.statSync(path.join(examplesDir, item)).isDirectory());

  categories.forEach((category) => {
    const categoryDir = path.join(examplesDir, category);
    const examples = fs
      .readdirSync(categoryDir)
      .filter((item) => fs.statSync(path.join(categoryDir, item)).isDirectory());

    examples.forEach((example) => {
      const exampleDir = path.join(categoryDir, example);
      const usfmFile = path.join(exampleDir, 'example.usfm');
      const usjFile = path.join(exampleDir, 'example.usj');

      if (fs.existsSync(usfmFile) && !fs.existsSync(usjFile)) {
        missingExamples.push({
          category,
          example,
          dir: exampleDir,
          usfmFile,
          usjFile,
        });
      }
    });
  });

  return missingExamples;
}

/**
 * Load the USFM parser
 */
function loadUSFMParser() {
  try {
    // Try to load the USFM parser from the built package
    const { USFMParser } = require('../packages/usfm-parser');
    return USFMParser;
  } catch (error) {
    try {
      // Try alternative path for the built package
      const { USFMParser } = require('../packages/usfm-parser/dist/index.js');
      return USFMParser;
    } catch (error2) {
      console.error('❌ Could not load USFM parser. Make sure the parser package is built.');
      console.error('💡 Try running: pnpm build');
      console.error('💡 Error details:', error2.message);
      return null;
    }
  }
}

/**
 * Generate USJ files from USFM using the parser
 */
function generateUSJFiles(options) {
  const examplesDir = options.dir || DEFAULT_EXAMPLES_DIR;
  const missingExamples = findMissingUSJExamples(examplesDir);

  if (missingExamples.length === 0) {
    console.log('🎉 All examples already have USJ files!');
    return;
  }

  console.log(`🔄 Found ${missingExamples.length} examples missing USJ files`);

  // Load the USFM parser
  const USFMParser = loadUSFMParser();
  if (!USFMParser) {
    return;
  }

  let successful = 0;
  let failed = 0;

  missingExamples.forEach(({ category, example, dir, usfmFile, usjFile }) => {
    try {
      console.log(`📝 Processing ${category}/${example}...`);

      // Read USFM content
      const usfmContent = fs.readFileSync(usfmFile, 'utf8');

      // Parse with USFM parser
      const parser = new USFMParser();
      const result = parser.parse(usfmContent);

      // Convert to USJ format
      const usj = result.toJSON();

      // Write USJ file
      fs.writeFileSync(usjFile, JSON.stringify(usj, null, 2));
      console.log(`✅ Generated USJ for ${category}/${example}`);
      successful++;
    } catch (error) {
      console.error(`❌ Failed to generate USJ for ${category}/${example}: ${error.message}`);
      failed++;

      if (options.verbose) {
        console.error(error.stack);
      }
    }
  });

  console.log(`\n📊 Summary: ${successful} successful, ${failed} failed`);

  if (failed > 0) {
    console.log('💡 Use --verbose flag to see detailed error messages');
  }
}

/**
 * Create empty USJ template files
 */
function createUSJTemplates(options) {
  const examplesDir = options.dir || DEFAULT_EXAMPLES_DIR;
  const missingExamples = findMissingUSJExamples(examplesDir);

  if (missingExamples.length === 0) {
    console.log('🎉 All examples already have USJ files!');
    return;
  }

  console.log(`📝 Creating USJ templates for ${missingExamples.length} examples...`);

  let created = 0;

  missingExamples.forEach(({ category, example, usjFile }) => {
    try {
      const emptyUSJ = generateEmptyUSJ();
      fs.writeFileSync(usjFile, JSON.stringify(emptyUSJ, null, 2));
      console.log(`✅ Created USJ template for ${category}/${example}`);
      created++;
    } catch (error) {
      console.error(
        `❌ Failed to create USJ template for ${category}/${example}: ${error.message}`
      );
    }
  });

  console.log(`\n📊 Created ${created} USJ template files`);
  console.log('📋 Next steps:');
  console.log('1. Edit the USJ files to match your USFM content');
  console.log('2. Or run "pnpm examples generate" to auto-generate from USFM');
}

/**
 * Create a new example
 */
function createExample(markerName, exampleName, options) {
  const examplesDir = options.dir || DEFAULT_EXAMPLES_DIR;

  console.log(`🔨 Creating new example: ${markerName}/${exampleName}`);

  // Validate inputs
  if (!markerName || !exampleName) {
    console.error('❌ Both marker name and example name are required');
    process.exit(1);
  }

  // Create directory structure
  const exampleDir = createExampleStructure(examplesDir, markerName, exampleName);
  if (!exampleDir) return;

  // Generate files
  const files = {
    'example.usfm': generateUSFMContent(markerName),
    'metadata.json': JSON.stringify(
      generateMetadata(markerName, exampleName, options.description),
      null,
      2
    ),
  };

  // Write files
  Object.entries(files).forEach(([filename, content]) => {
    const filePath = path.join(exampleDir, filename);
    fs.writeFileSync(filePath, content);
    console.log(`📝 Created: ${filename}`);
  });

  console.log(`\n✅ Example created successfully!`);
  console.log(`📍 Location: ${exampleDir}`);
  console.log(`\n📋 Next steps:`);
  console.log(`1. Edit ${path.join(exampleDir, 'example.usfm')} with your USFM content`);
  console.log(`2. Generate USJ: Use "pnpm examples generate" or "pnpm examples create-usj"`);
  console.log(`3. Update metadata.json if needed`);

  if (options.edit) {
    console.log(`\n🚀 Opening example.usfm for editing...`);
    const { spawn } = require('child_process');
    spawn(process.env.EDITOR || 'code', [path.join(exampleDir, 'example.usfm')], {
      stdio: 'inherit',
      detached: true,
    });
  }
}

/**
 * List existing examples
 */
function listExamples(options) {
  const examplesDir = options.dir || DEFAULT_EXAMPLES_DIR;

  if (!fs.existsSync(examplesDir)) {
    console.log(`❌ Examples directory not found: ${examplesDir}`);
    return;
  }

  console.log(`📋 Examples in ${examplesDir}:\n`);

  const categories = fs
    .readdirSync(examplesDir)
    .filter((item) => fs.statSync(path.join(examplesDir, item)).isDirectory())
    .sort();

  let totalExamples = 0;
  let totalWithUSJ = 0;

  categories.forEach((category) => {
    const categoryDir = path.join(examplesDir, category);
    const examples = fs
      .readdirSync(categoryDir)
      .filter((item) => fs.statSync(path.join(categoryDir, item)).isDirectory())
      .sort();

    if (examples.length === 0) return;

    console.log(`${category.toUpperCase()} (${examples.length} examples):`);
    console.log(`  ${MARKER_CATEGORIES[getCategoryFromMarker(category)] || 'Other markers'}`);

    examples.forEach((example) => {
      const exampleDir = path.join(categoryDir, example);
      const hasUSFM = fs.existsSync(path.join(exampleDir, 'example.usfm'));
      const hasUSJ = fs.existsSync(path.join(exampleDir, 'example.usj'));

      totalExamples++;
      if (hasUSJ) totalWithUSJ++;

      let status = '';
      if (hasUSFM && hasUSJ) status = '✅';
      else if (hasUSFM) status = '📝';
      else status = '❌';

      console.log(`  ${status} ${example}`);
    });
    console.log('');
  });

  console.log(
    `📊 Summary: ${totalWithUSJ}/${totalExamples} examples have USJ files (${Math.round((totalWithUSJ / totalExamples) * 100)}% coverage)`
  );
}

/**
 * Check for missing USJ files
 */
function checkMissing(options) {
  const examplesDir = options.dir || DEFAULT_EXAMPLES_DIR;
  console.log(`🔍 Checking for missing USJ files in ${examplesDir}...\n`);

  // Use the existing bash script logic but in JavaScript
  const { execSync } = require('child_process');
  try {
    const result = execSync(`bash check-missing-usj.sh "${examplesDir}"`, { encoding: 'utf8' });
    console.log(result);
  } catch (error) {
    console.error('❌ Error running check-missing-usj.sh:', error.message);
    console.log('💡 Make sure check-missing-usj.sh exists and is executable');
  }
}

/**
 * Show available marker templates
 */
function showTemplates() {
  console.log('📝 Available marker templates:\n');

  Object.entries(MARKER_CATEGORIES).forEach(([category, description]) => {
    const template = MARKER_TEMPLATES[category] || MARKER_TEMPLATES.default;
    console.log(`${category.toUpperCase()}:`);
    console.log(`  ${description}`);
    console.log(`  Template: ${template.description}`);
    console.log('');
  });
}

// CLI Setup
program
  .name('example-manager')
  .description('USFM Example Manager - Create and manage USFM format examples')
  .version('1.0.0');

program
  .command('create <marker> <example>')
  .description('Create a new example (e.g., "char-add add-example-3")')
  .option('-d, --dir <directory>', 'Examples directory', DEFAULT_EXAMPLES_DIR)
  .option('--description <desc>', 'Example description')
  .option('-e, --edit', 'Open example.usfm in editor after creation')
  .action(createExample);

program
  .command('list')
  .description('List all existing examples')
  .option('-d, --dir <directory>', 'Examples directory', DEFAULT_EXAMPLES_DIR)
  .action(listExamples);

program
  .command('check')
  .description('Check for missing USJ files')
  .option('-d, --dir <directory>', 'Examples directory', DEFAULT_EXAMPLES_DIR)
  .action(checkMissing);

program
  .command('generate')
  .description('Generate USJ files from USFM using the parser')
  .option('-d, --dir <directory>', 'Examples directory', DEFAULT_EXAMPLES_DIR)
  .option('-v, --verbose', 'Show detailed error messages')
  .action(generateUSJFiles);

program
  .command('create-usj')
  .description('Create empty USJ template files for existing USFM files')
  .option('-d, --dir <directory>', 'Examples directory', DEFAULT_EXAMPLES_DIR)
  .action(createUSJTemplates);

program.command('templates').description('Show available marker templates').action(showTemplates);

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
