#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Utility script to search and find specific examples from the extracted examples
 */

function loadIndex(indexPath = 'temp/all-extracted-examples/examples-index.json') {
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ Index file not found: ${indexPath}`);
    console.error('Run: node scripts/extract-all-examples.js first');
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function searchExamples(index, criteria) {
  let results = [...index.allExamples];

  // Filter by marker type
  if (criteria.marker) {
    const targetMarker = criteria.marker.toLowerCase();
    results = results.filter((example) => example.id.toLowerCase().startsWith(targetMarker + '-'));
  }

  // Filter by required formats
  if (criteria.formats) {
    const requiredFormats = Array.isArray(criteria.formats) ? criteria.formats : [criteria.formats];
    results = results.filter((example) =>
      requiredFormats.every((format) => example.formats[format] === true)
    );
  }

  // Filter by description keywords
  if (criteria.keywords) {
    const keywords = Array.isArray(criteria.keywords) ? criteria.keywords : [criteria.keywords];
    results = results.filter((example) =>
      keywords.some((keyword) => example.description.toLowerCase().includes(keyword.toLowerCase()))
    );
  }

  // Filter by specific marker name
  if (criteria.markerName) {
    const targetName = criteria.markerName.toLowerCase();
    results = results.filter((example) => {
      const parts = example.id.split('-');
      return parts.length >= 2 && parts[1].toLowerCase() === targetName;
    });
  }

  return results;
}

function displayExample(example, index = null) {
  console.log(`\n📝 ${example.id}`);
  console.log(`   Description: ${example.description}`);
  console.log(`   Directory: ${example.directory}`);

  const formats = Object.entries(example.formats)
    .filter(([, available]) => available)
    .map(([format]) => format.toUpperCase())
    .join(', ');
  console.log(`   Formats: ${formats}`);

  if (index) {
    // Show marker statistics
    const markerType = example.id.split('-')[0];
    const markerStats = index.markerStats[markerType];
    if (markerStats) {
      console.log(
        `   Marker Stats: ${markerStats.examples} examples in ${markerStats.filesWithExamples} files`
      );
    }
  }
}

function displaySummary(index) {
  console.log('📊 Examples Summary');
  console.log('==================');
  console.log(`Total Examples: ${index.summary.totalExamples}`);
  console.log(`Files Processed: ${index.summary.totalFiles}`);
  console.log(`Success Rate: ${index.summary.successRate}`);
  console.log(`Processing Date: ${new Date(index.summary.processingDate).toLocaleString()}`);

  console.log('\n📋 Format Coverage:');
  console.log(`   USFM: ${index.formatStats.usfm} examples`);
  console.log(`   USX:  ${index.formatStats.usx} examples`);
  console.log(`   USJ:  ${index.formatStats.usj} examples`);

  console.log('\n🏷️  Marker Types:');
  const sortedMarkers = Object.entries(index.markerStats).sort(
    ([, a], [, b]) => b.examples - a.examples
  );

  sortedMarkers.forEach(([marker, stats]) => {
    console.log(`   ${marker.padEnd(6)}: ${stats.examples.toString().padStart(3)} examples`);
  });
}

function listMarkers(index) {
  console.log('\n🏷️  Available Markers:');
  console.log('=====================');

  Object.entries(index.markerStats).forEach(([marker, stats]) => {
    console.log(`\n${marker.toUpperCase()} (${stats.examples} examples)`);

    // Find all unique marker names within this category
    const markerExamples = index.allExamples.filter((ex) => ex.id.startsWith(marker + '-'));
    const markerNames = [...new Set(markerExamples.map((ex) => ex.id.split('-')[1]))];

    console.log(`   Markers: ${markerNames.join(', ')}`);
  });
}

function findBestExamples(index, criteria = {}) {
  const minFormats = criteria.minFormats || 3; // Require all 3 formats by default

  const complete = index.allExamples.filter(
    (example) => Object.values(example.formats).filter(Boolean).length >= minFormats
  );

  const diverse = complete.filter(
    (example) => example.description && !example.description.toLowerCase().includes('missing')
  );

  // Group by marker type
  const byMarker = {};
  diverse.forEach((example) => {
    const markerType = example.id.split('-')[0];
    if (!byMarker[markerType]) {
      byMarker[markerType] = [];
    }
    byMarker[markerType].push(example);
  });

  console.log('\n🌟 Best Examples for Testing:');
  console.log('============================');
  console.log(`Found ${diverse.length} examples with ${minFormats}+ formats and descriptions\n`);

  Object.entries(byMarker).forEach(([markerType, examples]) => {
    console.log(`${markerType.toUpperCase()}: ${examples.length} examples`);
    examples.slice(0, 3).forEach((example) => {
      // Show top 3 per category
      console.log(`   • ${example.id}: ${example.description}`);
    });
    if (examples.length > 3) {
      console.log(`   ... and ${examples.length - 3} more`);
    }
    console.log('');
  });

  return diverse;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'help') {
    console.log('🔍 Example Finder Utility');
    console.log('=========================');
    console.log('');
    console.log('Commands:');
    console.log('  summary                     - Show overall statistics');
    console.log('  list                        - List all available markers');
    console.log('  search <marker>             - Find examples for specific marker type');
    console.log('  find <marker> <name>        - Find examples for specific marker name');
    console.log('  formats <format1,format2>   - Find examples with specific formats');
    console.log('  keywords <keyword>          - Search by description keywords');
    console.log('  best                        - Find best examples for testing');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/find-examples.js summary');
    console.log('  node scripts/find-examples.js search char');
    console.log('  node scripts/find-examples.js find char jmp');
    console.log('  node scripts/find-examples.js formats usfm,usx,usj');
    console.log('  node scripts/find-examples.js keywords matthew');
    console.log('  node scripts/find-examples.js best');
    return;
  }

  const index = loadIndex();

  switch (command) {
    case 'summary':
      displaySummary(index);
      break;

    case 'list':
      listMarkers(index);
      break;

    case 'search':
      const markerType = args[1];
      if (!markerType) {
        console.error('Please specify a marker type (e.g., char, para, cv)');
        return;
      }

      const markerResults = searchExamples(index, { marker: markerType });
      console.log(
        `\n🔍 Found ${markerResults.length} examples for marker type: ${markerType.toUpperCase()}`
      );
      markerResults.forEach((example) => displayExample(example, index));
      break;

    case 'find':
      const findMarkerType = args[1];
      const markerName = args[2];

      if (!findMarkerType || !markerName) {
        console.error('Please specify both marker type and name (e.g., char jmp)');
        return;
      }

      const findResults = searchExamples(index, {
        marker: findMarkerType,
        markerName: markerName,
      });

      console.log(`\n🔍 Found ${findResults.length} examples for: ${findMarkerType}/${markerName}`);
      findResults.forEach((example) => displayExample(example, index));
      break;

    case 'formats':
      const formatList = args[1];
      if (!formatList) {
        console.error('Please specify formats (e.g., usfm,usx or usj)');
        return;
      }

      const requiredFormats = formatList.split(',').map((f) => f.trim().toLowerCase());
      const formatResults = searchExamples(index, { formats: requiredFormats });

      console.log(
        `\n🔍 Found ${formatResults.length} examples with formats: ${requiredFormats.join(', ')}`
      );
      formatResults.slice(0, 20).forEach((example) => displayExample(example)); // Limit to 20

      if (formatResults.length > 20) {
        console.log(`\n... and ${formatResults.length - 20} more examples`);
      }
      break;

    case 'keywords':
      const keyword = args.slice(1).join(' ');
      if (!keyword) {
        console.error('Please specify search keywords');
        return;
      }

      const keywordResults = searchExamples(index, { keywords: [keyword] });
      console.log(`\n🔍 Found ${keywordResults.length} examples matching: "${keyword}"`);
      keywordResults.forEach((example) => displayExample(example, index));
      break;

    case 'best':
      findBestExamples(index);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run: node scripts/find-examples.js help');
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadIndex,
  searchExamples,
  displayExample,
  findBestExamples,
};
