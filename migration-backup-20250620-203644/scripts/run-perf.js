#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('important', {
    alias: 'i',
    type: 'boolean',
    description: 'Mark results as important'
  })
  .option('version', {
    alias: 'v',
    type: 'string',
    description: 'Version identifier for the test run'
  })
  .option('description', {
    alias: 'd',
    type: 'string',
    description: 'Description for the test run'
  })
  .option('watch', {
    alias: 'w',
    type: 'boolean',
    description: 'Run in watch mode'
  })
  .option('prune', {
    alias: 'p',
    type: 'boolean',
    description: 'Prune non-important results'
  })
  .option('remove-version', {
    alias: 'r',
    type: 'string',
    description: 'Remove all results for a specific version'
  })
  .help()
  .parse();

const resultsPath = path.join(__dirname, '../src/grammar/__tests__/performance-results.json');

// Function to load and parse results
function loadResults() {
  try {
    if (fs.existsSync(resultsPath)) {
      console.log(`Loading existing results from: ${resultsPath}`);
      const data = fs.readFileSync(resultsPath, 'utf8');
      const results = JSON.parse(data);
      console.log(`Found ${results.length} existing results`);
      return results;
    } else {
      console.log(`No existing results file found at: ${resultsPath}`);
      console.log('Starting with fresh results');
    }
  } catch (error) {
    console.error('Error loading results:', error);
    console.log('Starting with fresh results due to error');
  }
  return [];
}

// Function to save results
function saveResults(results) {
  try {
    const action = fs.existsSync(resultsPath) ? 'Updated' : 'Created new';
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`${action} results file with ${results.length} entries`);
  } catch (error) {
    console.error('Error saving results:', error);
  }
}

// Handle pruning
if (argv.prune) {
  const results = loadResults();
  const importantResults = results.filter(r => r.isImportant);
  console.log(`Pruning non-important results...`);
  console.log(`Before: ${results.length} results`);
  console.log(`After: ${importantResults.length} results (only important ones kept)`);
  saveResults(importantResults);
  process.exit(0);
}

// Handle removing specific version
if (argv.removeVersion) {
  const results = loadResults();
  const filteredResults = results.filter(r => r.version !== argv.removeVersion);
  if (results.length === filteredResults.length) {
    console.log(`No results found for version: ${argv.removeVersion}`);
  } else {
    console.log(`Removing results for version: ${argv.removeVersion}`);
    console.log(`Removed ${results.length - filteredResults.length} results`);
    saveResults(filteredResults);
  }
  process.exit(0);
}

// Build the command for running tests
const cmd = [
  'cross-env',
  argv.important ? 'PERF_IMPORTANT=true' : '',
  argv.version ? `PERF_VERSION=${argv.version}` : '',
  argv.description ? `PERF_DESC="${argv.description}"` : '',
  'jest',
  'src/grammar/__tests__/parser.performance.test.ts',
  '--verbose',
  argv.watch ? '--watch' : ''
].filter(Boolean).join(' ');

// Log the command being executed
console.log('\nExecuting performance test command:');
console.log(cmd);
console.log();

// Execute the command
try {
  execSync(cmd, { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status);
} 