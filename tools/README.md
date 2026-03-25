# USFM Example Manager

A CLI tool to create and manage USFM format examples in the `examples/usfm-markers` directory.

## Installation

The CLI tool is already set up with the required dependencies. You can run it using:

```bash
# Using Bun (recommended)
bun run examples [command]

# Or directly with node
node tools/example-manager.js [command]
```

## Commands

### 1. `create <marker> <example>`
Create a new format example with the specified marker and example name.

```bash
# Create a new character marker example
bun run examples create char-add add-example-3

# Create with custom description
bun run examples create char-add add-example-3 --description "Advanced add marker usage"

# Create and immediately open in editor
bun run examples create char-add add-example-3 --edit
```

**Options:**
- `--description <desc>` - Custom description for the example
- `--edit` - Open the created USFM file in your editor
- `--dir <directory>` - Use a different examples directory

### 2. `list`
List all existing examples with their status.

```bash
bun run examples list
```

**Status indicators:**
- ✅ - Example has both USFM and USJ files
- 📝 - Example has USFM but missing USJ file
- ❌ - Example has issues or missing files

### 3. `check`
Check for missing USJ files and show coverage statistics.

```bash
bun run examples check
```

This command uses the `check-missing-usj.sh` script to analyze which examples need USJ files.

### 4. `generate`
Generate USJ files from existing USFM files using your parser.

```bash
# Generate all missing USJ files
bun run examples generate

# Generate with detailed error messages
bun run examples generate --verbose
```

This command:
- Finds all examples with USFM files but missing USJ files
- Uses your USFM parser to convert USFM to USJ format
- Saves the generated USJ files
- Reports success/failure statistics

**Options:**
- `--verbose` - Show detailed error messages for failed conversions
- `--dir <directory>` - Use a different examples directory

### 5. `create-usj`
Create empty USJ template files for existing USFM files.

```bash
bun run examples create-usj
```

This command:
- Finds all examples with USFM files but missing USJ files
- Creates empty USJ template files with basic structure
- Templates include placeholder content that you can edit

Use this when you want to manually create USJ files or when the parser can't handle specific examples.

### 6. `templates`
Show available marker templates and their descriptions.

```bash
bun run examples templates
```

Displays information about the built-in templates for different marker categories.

## Quick Scripts

Use these shortcuts from the project root:

```bash
# Access the CLI
bun run examples

# Check missing USJ files
bun run examples:check

# Generate USJ files from USFM
bun run examples:generate

# Create empty USJ templates
bun run examples:create-usj
```

## Workflow for Missing USJ Files

1. **Check what's missing:**
   ```bash
   bun run examples:check
   ```

2. **Choose your approach:**
   
   **Option A: Auto-generate with parser**
   ```bash
   bun run examples:generate
   ```
   
   **Option B: Create templates for manual editing**
   ```bash
   bun run examples:create-usj
   ```

3. **Verify results:**
   ```bash
   bun run examples list
   bun run examples:check
   ```

## Example Structure

Each example follows this structure:

```
examples/usfm-markers/
├── char-add/
│   └── add-example-1/
│       ├── example.usfm     # USFM source content
│       ├── example.usj      # Generated USJ output
│       ├── example.usx      # Optional USX output  
│       └── metadata.json    # Example metadata
```

## Marker Categories

The CLI recognizes these marker categories and provides appropriate templates:

- **char** - Character markers (inline formatting)
- **para** - Paragraph markers (block-level)
- **cv** - Chapter and verse markers
- **note** - Note markers (footnotes, cross-references)
- **ms** - Milestone markers
- **fig** - Figure markers
- **cat** - Category markers
- **sbar** - Sidebar markers
- **periph** - Peripheral markers
- **doc** - Document markers

## Templates

The CLI automatically generates appropriate USFM templates based on the marker category:

### Character Markers (char-*)
```usfm
\id GEN
\c 1
\p
\v 1 In the beginning God created the \add heavens\add* and the earth.
```

### Paragraph Markers (para-*)
```usfm
\id GEN
\c 1
\p Paragraph content goes here.
\p
\v 1 Verse content follows.
```

### Chapter/Verse Markers (cv-*)
```usfm
\id GEN
\c 1
\v 1
\p
\v 1 Verse content.
```

### Note Markers (note-*)
```usfm
\id GEN
\c 1
\p
\v 1 Text with \f + Note content.\f* continues.
```

## Workflow

1. **Create Example**: Use `bun run examples create` to generate the structure
2. **Edit USFM**: Modify the `example.usfm` file with your actual content
3. **Generate USJ**: Use your parser to convert USFM to USJ format
4. **Verify**: Use `bun run examples check` to ensure USJ was generated correctly

## Examples

```bash
# Create a new example for the \add character marker
bun run examples create char-add add-example-3

# List all examples to see coverage
bun run examples list

# Check which examples are missing USJ files
bun run examples check

# See available templates
bun run examples templates

# Create example in a different directory
bun run examples create char-bold bold-example-1 --dir format-examples-new
```

## Integration

The CLI integrates with:
- **check-missing-usj.sh** - For comprehensive USJ coverage analysis
- **Format examples test suite** - All created examples are automatically included in tests
- **USFM Parser** - Examples are used to validate parser functionality

## Tips

- Use descriptive example names that indicate the specific use case
- Include meaningful descriptions in metadata for documentation
- Follow the existing naming conventions (marker-example-N)
- Always verify your examples work with the parser before committing
- Use the `--edit` flag to immediately start editing after creation
