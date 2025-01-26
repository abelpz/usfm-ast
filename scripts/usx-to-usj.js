#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { usxStringToUsj } from '@biblionexus-foundation/scripture-utilities';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_INPUT_DIR = path.join(__dirname, '../src/grammar/__tests__/fixtures/usx');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '../src/grammar/__tests__/fixtures/usj');

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options] [filename]')
    .option('all', {
        alias: 'a',
        describe: 'Convert all files in the input directory',
        type: 'boolean',
        default: false
    })
    .help('h')
    .alias('h', 'help')
    .example('$0 tit', 'Convert tit.xml from input directory')
    .example('$0 --all', 'Convert all XML files from input directory')
    .argv;

// Create output directory if it doesn't exist
if (!fs.existsSync(DEFAULT_OUTPUT_DIR)) {
    fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
}

function convertFile(filename) {
    const inputPath = path.join(DEFAULT_INPUT_DIR, `${filename}.xml`);
    const outputPath = path.join(DEFAULT_OUTPUT_DIR, `${filename}.json`);

    if (!fs.existsSync(inputPath)) {
        console.error(`File not found: ${filename}.xml`);
        process.exit(1);
    }

    const usxContent = fs.readFileSync(inputPath, 'utf-8');
    const usjData = usxStringToUsj(usxContent);
    fs.writeFileSync(outputPath, JSON.stringify(usjData, null, 2));
    console.log(`Converted ${filename}.xml to ${filename}.json`);
}

if (argv.all) {
    // Process all USX files in the directory
    fs.readdirSync(DEFAULT_INPUT_DIR)
        .filter(file => file.endsWith('.xml'))
        .forEach(file => {
            const filename = path.basename(file, '.xml');
            convertFile(filename);
        });
} else {
    const filename = argv._[0];
    if (!filename) {
        console.error('Please provide a filename or use --all flag');
        yargs.showHelp();
        process.exit(1);
    }
    convertFile(filename);
}
