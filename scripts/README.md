# Example Extraction and Testing Scripts

This directory contains scripts for extracting code examples from USFM documentation and using them for conversion testing.

## Scripts Overview

### 1. `extract-examples.js`

Extracts USFM, USX, and USJ code examples from AsciiDoc documentation files.

**Usage:**

```bash
node scripts/extract-examples.js [input-file] [output-directory]
```

**Default values:**

- Input directory: `temp/usfm-docs/markers`
- Output directory: `format-examples`
- Index file: `format-examples/examples-index.json`

**What it does:**

- Searches for `[tabs]` sections in AsciiDoc files
- Extracts code blocks for USFM, USX, and USJ formats
- Saves examples with format-agnostic naming (`example.usfm`, `example.usx`, `example.usj`)
- Creates metadata files with descriptions and format availability
- **Cleans up existing examples** before starting extraction (ensures fresh results)

### 2. `example-conversion-test.js`

Comprehensive test framework demonstrating bidirectional conversion testing.

**Usage:**

```bash
node scripts/example-conversion-test.js [examples-directory]
```

**Features:**

- Tests all possible conversion combinations (USFM↔USX↔USJ)
- Provides detailed failure analysis
- Mock converter functions ready to be replaced with real implementations
- Comprehensive test reporting

### 3. `simple-test-example.js`

Simple example showing how to write individual tests using extracted examples.

**Usage:**

```bash
node scripts/simple-test-example.js
```

**Features:**

- Shows basic test structure
- Includes Jest test examples
- Demonstrates how to load and compare examples

## File Structure

After running the extraction script, you'll get this structure:

```
format-examples/
├── index.json    # Comprehensive index of all examples
├── cat-cat/
│   ├── cat-example-1/
│   │   ├── example.usfm       # USFM format
│   │   ├── example.usx        # USX format  
│   │   ├── example.usj        # USJ format
│   │   └── metadata.json      # Descriptions and format info
│   └── cat-example-2/
│       ├── example.usfm
│       ├── example.usx
│       ├── example.usj
│       └── metadata.json
├── char-jmp/
│   ├── jmp-example-1/
│   │   ├── example.usfm
│   │   ├── example.usx
│   │   ├── example.usj
│   │   └── metadata.json
│   └── ... (more jmp examples)
└── ... (other marker categories)
```

## Format-Agnostic Naming

The naming convention uses `example.{format}` instead of `input.usfm` and `expected.{format}` because:

- **Bidirectional Testing**: Any format can be input or expected output
- **Flexible Test Design**: Same data supports multiple conversion directions
- **Clear Intent**: Format is obvious from extension

## Testing Patterns

### Pattern 1: Individual Unit Tests

```javascript
// Load specific example
const usfmInput = loadExample('format-examples/cat-cat/cat-example-1', 'usfm');
const expectedUSJ = loadExample('format-examples/cat-cat/cat-example-1', 'usj');

// Test conversion
const result = myConverter(usfmInput);
expect(result).toEqual(expectedUSJ);
```

### Pattern 2: Parameterized Tests

```javascript
describe.each([
  'format-examples/cat-cat/cat-example-1',
  'format-examples/cat-cat/cat-example-2'
])('USFM to USJ conversion for %s', (examplePath) => {
  test('should convert correctly', () => {
    const usfmInput = loadExample(examplePath, 'usfm');
    const expectedUSJ = loadExample(examplePath, 'usj');
    
    const result = convertUSFMToUSJ(usfmInput);
    expect(result).toEqual(expectedUSJ);
  });
});
```

### Pattern 3: Round-trip Testing

```javascript
test('USFM → USJ → USFM round-trip', () => {
  const originalUSFM = loadExample(examplePath, 'usfm');
  
  const usj = convertUSFMToUSJ(originalUSFM);
  const backToUSFM = convertUSJToUSFM(usj);
  
  expect(normalizeUSFM(backToUSFM)).toBe(normalizeUSFM(originalUSFM));
});
```

## Converter Function Signatures

Your converter functions should match these signatures:

```javascript
// String input/output
function convertUSFMToUSX(usfmString) { return usxString; }
function convertUSXToUSFM(usxString) { return usfmString; }

// Object input/output  
function convertUSFMToUSJ(usfmString) { return usjObject; }
function convertUSJToUSFM(usjObject) { return usfmString; }
function convertUSJToUSX(usjObject) { return usxString; }
function convertUSXToUSJ(usxString) { return usjObject; }
```

## Integration with Test Frameworks

### Jest Integration

```javascript
// jest.config.js
module.exports = {
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.js']
};

// test-setup.js
const { loadExample } = require('./scripts/simple-test-example');
global.loadExample = loadExample;
```

### Mocha Integration

```javascript
// test/conversion.test.js
const { expect } = require('chai');
const { loadExample } = require('../scripts/simple-test-example');

describe('Conversion Tests', () => {
  it('should convert USFM to USJ', () => {
    const usfm = loadExample('format-examples/cat-cat/cat-example-1', 'usfm');
    const expected = loadExample('format-examples/cat-cat/cat-example-1', 'usj');
    
    const result = myConverter(usfm);
    expect(result).to.deep.equal(expected);
  });
});
```

## Next Steps

1. **Extract More Examples**: Run the extraction script on other documentation files
2. **Implement Converters**: Replace mock functions with real conversion logic
3. **Add Normalization**: Handle whitespace and formatting differences
4. **Performance Testing**: Use examples for benchmarking conversion speed
5. **Edge Case Detection**: Identify examples that expose conversion issues

## Example Commands

```bash
# Extract examples from a single file (original script)
node scripts/extract-examples.js temp/usfm-docs/markers/cat/cat.adoc

# Extract examples from ALL marker files (recommended)
node scripts/extract-all-examples.js

# Run comprehensive test suite
node scripts/example-conversion-test.js format-examples

# Run simple individual tests
node scripts/simple-test-example.js

# Search and find specific examples
node scripts/find-examples.js summary
node scripts/find-examples.js find char jmp
```

This approach provides a solid foundation for test-driven development of format conversion functionality.
