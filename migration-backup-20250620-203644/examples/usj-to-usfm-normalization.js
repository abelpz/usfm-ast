/**
 * USJ to USFM Normalization Example
 *
 * This example demonstrates how to use the USJToUSFMConverter for complete
 * USFM normalization without needing to work with the USFM AST directly.
 *
 * The process is: USFM → USJ → Normalized USFM
 */

import { USFMParser, USJVisitor, USJToUSFMConverter } from '../dist/index.mjs';

// Sample USFM with various formatting issues
const messyUSFM = `\\id TIT Titus


\\c 1


\\p
\\v 1   Paul,    a servant of God and an apostle of Jesus Christ,   for the sake of the faith of God's elect and their knowledge of the truth, which accords with godliness,


\\v 2    in hope of eternal life, which God, who never lies, promised before the ages began


\\p

\\v 3 and at the proper time manifested in his word through the preaching with which I have been entrusted by the command of God our Savior;


\\b


\\p\\v 4 To Titus, my true child in a common faith:


Grace and peace from God the Father and Christ Jesus our Savior.

\\c    2

\\p
\\v 1  But as for you, teach what accords with sound doctrine.`;

console.log('=== USJ to USFM Normalization Example ===\n');

console.log('Original USFM (with formatting issues):');
console.log('─'.repeat(60));
console.log(messyUSFM);
console.log('\n');

// Step 1: Parse USFM to AST
console.log('Step 1: Parsing USFM to AST...');
const parser = new USFMParser();
const ast = parser.load(messyUSFM).parse();

// Step 2: Convert AST to USJ
console.log('Step 2: Converting AST to USJ...');
const usjVisitor = new USJVisitor();
ast.visit(usjVisitor);
const usj = usjVisitor.getDocument(); // Get the complete USJ document

console.log('USJ structure (first few nodes):');
console.log(
  JSON.stringify(
    {
      type: usj.type,
      version: usj.version,
      content: usj.content.slice(0, 3), // Show first 3 content nodes
    },
    null,
    2
  )
);
console.log('...\n');

// Step 3: Convert USJ back to normalized USFM with different rules
const normalizationConfigs = [
  {
    name: 'Default Normalization',
    options: {
      normalize: true,
    },
  },
  {
    name: 'Verses on New Lines',
    options: {
      normalize: true,
      normalizationRules: {
        verseSpacing: 'newline',
        paragraphSpacing: 'single',
      },
    },
  },
  {
    name: 'Double Paragraph Spacing',
    options: {
      normalize: true,
      normalizationRules: {
        paragraphSpacing: 'double',
        verseSpacing: 'inline',
      },
    },
  },
  {
    name: 'Minimal Character Spacing',
    options: {
      normalize: true,
      normalizationRules: {
        characterMarkerSpacing: 'minimal',
        paragraphSpacing: 'single',
        verseSpacing: 'inline',
      },
    },
  },
];

normalizationConfigs.forEach((config, index) => {
  console.log(`Step 3.${index + 1}: ${config.name}`);
  console.log('─'.repeat(60));

  const converter = new USJToUSFMConverter(config.options);
  const normalizedUSFM = converter.convert(usj);

  console.log(normalizedUSFM);
  console.log('\n');
});

// Demonstrate round-trip consistency
console.log('=== Round-trip Consistency Test ===');
console.log('Testing: Original USFM → USJ → Normalized USFM → USJ → USFM');

// First round-trip
const firstConverter = new USJToUSFMConverter({ normalize: true });
const firstNormalized = firstConverter.convert(usj);

// Parse the normalized USFM back
const secondParser = new USFMParser();
const secondAst = secondParser.load(firstNormalized).parse();
const secondUsjVisitor = new USJVisitor();
secondAst.visit(secondUsjVisitor);
const secondUSJ = secondUsjVisitor.getDocument();

// Convert back to USFM
const secondConverter = new USJToUSFMConverter({ normalize: true });
const secondNormalized = secondConverter.convert(secondUSJ);

console.log('First normalization:');
console.log(firstNormalized);
console.log('\nSecond normalization (should be identical):');
console.log(secondNormalized);
console.log('\nRound-trip consistent:', firstNormalized === secondNormalized);

// Function to create a complete normalization pipeline
function createNormalizationPipeline(normalizationOptions = {}) {
  return function normalizeUSFM(inputUSFM) {
    // Parse USFM → AST
    const parser = new USFMParser();
    const ast = parser.load(inputUSFM).parse();

    // AST → USJ
    const usjVisitor = new USJVisitor();
    ast.visit(usjVisitor);
    const usj = usjVisitor.getDocument();

    // USJ → Normalized USFM
    const converter = new USJToUSFMConverter({
      normalize: true,
      ...normalizationOptions,
    });

    return converter.convert(usj);
  };
}

console.log('\n=== Pipeline Function Example ===');

// Create different normalization pipelines
const defaultNormalizer = createNormalizationPipeline();
const newlineVerseNormalizer = createNormalizationPipeline({
  normalizationRules: { verseSpacing: 'newline' },
});

console.log('Using default pipeline:');
console.log(defaultNormalizer(messyUSFM));

console.log('\nUsing newline verse pipeline:');
console.log(newlineVerseNormalizer(messyUSFM));

console.log('\n=== Example Complete ===');
