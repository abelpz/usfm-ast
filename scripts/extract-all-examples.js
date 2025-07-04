#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  extractExamples,
  isValidContent,
  isValidUSFM,
  isValidUSJ,
  detectContentFormat,
  hasValidFormats,
} = require('./extract-examples');

/**
 * Batch extract examples from all marker documentation files
 * and generate a comprehensive JSON index of all examples
 */

function findAdocFiles(directory) {
  const adocFiles = [];

  function scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.adoc')) {
          adocFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
    }
  }

  scanDirectory(directory);
  return adocFiles;
}

function processFile(filePath, outputBaseDir) {
  console.log(`Processing: ${path.relative(process.cwd(), filePath)}`);

  try {
    const allExamples = extractExamples(filePath);
    const validExamples = allExamples.filter(hasValidFormats);

    if (allExamples.length === 0) {
      console.log(`  No examples found`);
      return {
        file: filePath,
        relativePath: path.relative(process.cwd(), filePath),
        marker: path.basename(path.dirname(filePath)),
        fileName: path.basename(filePath, '.adoc'),
        exampleCount: 0,
        validExampleCount: 0,
        examples: [],
        status: 'no-examples',
      };
    }

    if (validExamples.length === 0) {
      console.log(`  Found ${allExamples.length} examples, but none have valid content`);
      return {
        file: filePath,
        relativePath: path.relative(process.cwd(), filePath),
        marker: path.basename(path.dirname(filePath)),
        fileName: path.basename(filePath, '.adoc'),
        exampleCount: allExamples.length,
        validExampleCount: 0,
        examples: [],
        status: 'no-valid-examples',
      };
    }

    // Generate output directory for this file
    const marker = path.basename(path.dirname(filePath));
    const fileName = path.basename(filePath, '.adoc');
    const fileOutputDir = path.join(outputBaseDir, `${marker}-${fileName}`);

    // Save only valid examples using the existing saveExamples function
    const { saveExamples } = require('./extract-examples');
    saveExamples(validExamples, fileOutputDir, filePath);

    const skippedCount = allExamples.length - validExamples.length;
    if (skippedCount > 0) {
      console.log(
        `  Found ${allExamples.length} examples, saved ${validExamples.length} valid → ${fileOutputDir} (skipped ${skippedCount} invalid)`
      );
    } else {
      console.log(`  Found ${validExamples.length} valid examples → ${fileOutputDir}`);
    }

    // Return metadata for valid examples only
    const exampleMetadata = validExamples.map((example, index) => ({
      id: `${marker}-${fileName}-example-${index + 1}`,
      directory: path.join(fileOutputDir, `${fileName}-example-${index + 1}`),
      description:
        example.descriptions.usfm ||
        example.descriptions.usx ||
        example.descriptions.usj ||
        'No description',
      formats: {
        usfm: isValidUSFM(example.usfm),
        usx: isValidContent(example.usx),
        usj: isValidUSJ(example.usj),
      },
      descriptions: example.descriptions,
    }));

    return {
      file: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      marker: marker,
      fileName: fileName,
      exampleCount: allExamples.length,
      validExampleCount: validExamples.length,
      examples: exampleMetadata,
      status: 'success',
    };
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    return {
      file: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      marker: path.basename(path.dirname(filePath)),
      fileName: path.basename(filePath, '.adoc'),
      exampleCount: 0,
      validExampleCount: 0,
      examples: [],
      status: 'error',
      error: error.message,
    };
  }
}

function generateSummaryReport(results) {
  const totalFiles = results.length;
  const filesWithAnyExamples = results.filter((r) => r.exampleCount > 0).length;
  const filesWithValidExamples = results.filter((r) => r.validExampleCount > 0).length;
  const totalExamples = results.reduce((sum, r) => sum + r.exampleCount, 0);
  const totalValidExamples = results.reduce((sum, r) => sum + r.validExampleCount, 0);
  const errorFiles = results.filter((r) => r.status === 'error').length;
  const skippedExamples = totalExamples - totalValidExamples;

  // Format statistics
  const formatStats = {
    usfm: 0,
    usx: 0,
    usj: 0,
  };

  const markerStats = {};

  results.forEach((fileResult) => {
    // Count by marker
    if (!markerStats[fileResult.marker]) {
      markerStats[fileResult.marker] = {
        files: 0,
        totalExamples: 0,
        validExamples: 0,
        filesWithValidExamples: 0,
      };
    }

    markerStats[fileResult.marker].files++;
    markerStats[fileResult.marker].totalExamples += fileResult.exampleCount;
    markerStats[fileResult.marker].validExamples += fileResult.validExampleCount;
    if (fileResult.validExampleCount > 0) {
      markerStats[fileResult.marker].filesWithValidExamples++;
    }

    // Count formats (only valid examples)
    fileResult.examples.forEach((example) => {
      if (example.formats.usfm) formatStats.usfm++;
      if (example.formats.usx) formatStats.usx++;
      if (example.formats.usj) formatStats.usj++;
    });
  });

  return {
    summary: {
      totalFiles,
      filesWithAnyExamples,
      filesWithValidExamples,
      totalExamples,
      totalValidExamples,
      skippedExamples,
      errorFiles,
      successRate: `${Math.round((filesWithValidExamples / totalFiles) * 100)}%`,
      validContentRate:
        totalExamples > 0 ? `${Math.round((totalValidExamples / totalExamples) * 100)}%` : '0%',
      processingDate: new Date().toISOString(),
    },
    formatStats,
    markerStats,
    allExamples: results.reduce((acc, fileResult) => {
      return acc.concat(fileResult.examples);
    }, []),
  };
}

function main() {
  const args = process.argv.slice(2);
  const inputDir = args[0] || 'temp/usfm-docs/markers';
  const outputDir = args[1] || 'format-examples/';
  const indexFile = args[2] || path.join(outputDir, 'index.json');

  console.log('🔍 USFM Documentation Example Extractor');
  console.log('========================================');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Index file: ${indexFile}`);

  // Check if input directory exists
  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Input directory not found: ${inputDir}`);
    console.error('Make sure you have the USFM documentation in temp/usfm-docs/');
    process.exit(1);
  }

  // Clean up and create output directory
  if (fs.existsSync(outputDir)) {
    console.log('🧹 Cleaning up existing examples...');
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('\n📁 Finding .adoc files...');
  const adocFiles = findAdocFiles(inputDir);
  console.log(`Found ${adocFiles.length} .adoc files\n`);

  if (adocFiles.length === 0) {
    console.log('No .adoc files found to process.');
    return;
  }

  // Process each file
  const results = [];
  let processedCount = 0;

  for (const filePath of adocFiles) {
    processedCount++;
    console.log(`\n[${processedCount}/${adocFiles.length}]`);

    const result = processFile(filePath, outputDir);
    results.push(result);
  }

  console.log('\n📊 Generating summary report...');
  const report = generateSummaryReport(results);

  // Add detailed file results to the report
  const fullReport = {
    ...report,
    files: results,
  };

  // Save the index file
  fs.writeFileSync(indexFile, JSON.stringify(fullReport, null, 2));

  console.log('\n✅ Processing Complete!');
  console.log('========================');
  console.log(`📁 Total files processed: ${report.summary.totalFiles}`);
  console.log(`📄 Files with any examples: ${report.summary.filesWithAnyExamples}`);
  console.log(`📄 Files with valid examples: ${report.summary.filesWithValidExamples}`);
  console.log(`🧪 Total examples found: ${report.summary.totalExamples}`);
  console.log(`✅ Valid examples saved: ${report.summary.totalValidExamples}`);
  console.log(`❌ Invalid examples skipped: ${report.summary.skippedExamples}`);
  console.log(`❌ Files with errors: ${report.summary.errorFiles}`);
  console.log(`📈 Success rate: ${report.summary.successRate}`);
  console.log(`📈 Valid content rate: ${report.summary.validContentRate}`);

  console.log('\n📊 Format Statistics (Valid Examples Only):');
  console.log(`   USFM examples: ${report.formatStats.usfm}`);
  console.log(`   USX examples:  ${report.formatStats.usx}`);
  console.log(`   USJ examples:  ${report.formatStats.usj}`);

  console.log('\n🏷️  Top Markers by Valid Example Count:');
  const topMarkers = Object.entries(report.markerStats)
    .sort(([, a], [, b]) => b.validExamples - a.validExamples)
    .slice(0, 10);

  topMarkers.forEach(([marker, stats]) => {
    const skippedForMarker = stats.totalExamples - stats.validExamples;
    const skippedNote = skippedForMarker > 0 ? ` (${skippedForMarker} skipped)` : '';
    console.log(
      `   ${marker}: ${stats.validExamples} valid examples${skippedNote} (${stats.filesWithValidExamples}/${stats.files} files)`
    );
  });

  console.log(`\n💾 Index saved to: ${indexFile}`);
  console.log(`📂 Examples saved to: ${outputDir}`);

  console.log('\n🎯 Next Steps:');
  console.log('   1. Review the index file for available examples');
  console.log('   2. Use examples for conversion testing');
  console.log('   3. Run: node scripts/example-conversion-test.js [output-dir]');

  if (report.summary.skippedExamples > 0) {
    console.log(
      `\n⚠️  Note: ${report.summary.skippedExamples} examples were skipped due to invalid/missing content`
    );
  }

  // Exit with error code if there were processing errors
  if (report.summary.errorFiles > 0) {
    console.log(`\n⚠️  Warning: ${report.summary.errorFiles} files had processing errors`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findAdocFiles,
  processFile,
  generateSummaryReport,
};
