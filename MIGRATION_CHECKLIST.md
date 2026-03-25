# 🚀 USFM/USJ Monorepo Migration Checklist

## Overview
This checklist tracks the migration from the old structure to the new **Bun workspaces + Turborepo** monorepo with 11 packages.

**Migration Source:** `migration-backup-20250620-203644/src/`  
**Migration Target:** `packages/*/src/`

---

## ✅ Phase 1: Foundation (COMPLETED)

### Shared Types Package (`@usfm-tools/types`)
- [x] Package structure created
- [x] TypeScript configuration
- [x] USFM type definitions migrated
- [x] USJ type definitions migrated
- [x] Shared common types
- [x] Build system working
- [x] README documentation

---

## 🚧 Phase 2: USFM Parser (`@usfm-tools/parser`)

### Package Setup
- [x] Package structure created
- [x] TypeScript configuration
- [x] Bun workspace dependency on `@usfm-tools/types`
- [x] Build scripts configured (tsc)

### Constants Migration
- [x] **Step 2.1**: Copy `migration-backup-20250620-203644/src/grammar/constants/defaultMarkers.ts`  
  → `packages/usfm-parser/src/constants/markers.ts`
- [x] **Step 2.2**: Copy `migration-backup-20250620-203644/src/grammar/constants/USMMarkersRegistry.ts`  
  → `packages/usfm-parser/src/constants/registry.ts`
- [x] **Step 2.3**: Update imports in both files to use `@usfm-tools/types`
- [x] **Step 2.4**: Test build: `bun run do -- usfm-parser build`

### Node Classes Migration
- [x] **Step 2.5**: Copy `migration-backup-20250620-203644/src/grammar/nodes.ts`  
  → `packages/usfm-parser/src/nodes/index.ts`
- [ ] **Step 2.6**: Copy entire `migration-backup-20250620-203644/src/grammar/nodes/` directory  
  → `packages/usfm-parser/src/nodes/` (NOTE: Currently only .gitkeep file exists)
- [x] **Step 2.7**: Update imports in all node files
- [x] **Step 2.8**: Test build: `bun run do -- usfm-parser build`

### Core Parser Handlers Migration
- [x] **Step 2.9**: Copy core handlers from `migration-backup-20250620-203644/src/grammar/handlers/`:
  - [x] `MarkerHandler.ts` → `packages/usfm-parser/src/handlers/`
  - [x] `NodeFactory.ts` → `packages/usfm-parser/src/handlers/`
  - [x] `PositionTracker.ts` → `packages/usfm-parser/src/handlers/`
  - [x] `WhitespaceHandler.ts` → `packages/usfm-parser/src/handlers/`
  - [ ] **SKIP**: `USFMFormattingRules.ts` (goes to formatter package)
  - [ ] **SKIP**: `NormalizationRules.ts` (goes to formatter package)
- [x] **Step 2.10**: Update imports in all handler files
- [x] **Step 2.11**: Test build: `bun run do -- usfm-parser build`

### Main Parser Migration
- [x] **Step 2.12**: Copy `migration-backup-20250620-203644/src/grammar/index.ts`  
  → `packages/usfm-parser/src/parser/index.ts`
- [x] **Step 2.13**: Update imports in parser file
- [x] **Step 2.14**: Create `packages/usfm-parser/src/index.ts` (package entry point)
- [x] **Step 2.15**: Test build: `bun run do -- usfm-parser build`

### Core Parser Tests Migration
- [ ] **Step 2.16**: Copy core parser tests from `migration-backup-20250620-203644/src/grammar/__tests__/`:
  - [x] `parser.basic.test.ts` → `packages/usfm-parser/tests/` (already done)
  - [x] `parser.attributes.test.ts` → `packages/usfm-parser/tests/` (already done)
  - [x] `parser.fixtures.test.ts` → `packages/usfm-parser/tests/` (already done)
  - [x] `parser.performance.test.ts` → `packages/usfm-parser/tests/` (already done)
  - [x] `parser.test.ts` → `packages/usfm-parser/tests/` (already done)
  - [x] `USFMParser.normalize.test.ts` → `packages/usfm-parser/tests/`
  - [x] **SKIP**: All visitor tests (go to adapter packages)
  - [x] **SKIP**: `USFMFormattingRules.test.ts` (goes to formatter package)
- [ ] **Step 2.17**: Copy test fixtures and utilities:
  - [x] `fixtures/` → `packages/usfm-parser/tests/fixtures/` (already done)
  - [x] `utils/` → `packages/usfm-parser/tests/utils/` (already done)
  - [x] `__snapshots__/` → `packages/usfm-parser/tests/__snapshots__/` (already done)
  - [x] `PerformanceMonitor.ts` → `packages/usfm-parser/tests/`
- [x] **Step 2.18**: Update test imports and fix any issues
  - ✅ Removed HTMLVisitor, USXVisitor, USJVisitor imports from parser performance tests
  - ✅ Kept only parser performance tests in @usfm-tools/parser
  - ✅ Created comprehensive visitor performance tests in @usfm-tools/adapters
  - ✅ All three visitors (HTML, USX, USJ) now tested in usfm-adapters package
- [ ] **Step 2.19**: Test: `bun run do -- usfm-parser test`

### Documentation
- [ ] **Step 2.20**: Create `packages/usfm-parser/README.md`
- [ ] **Step 2.21**: Update root tsconfig.json to include usfm-parser reference

---

## ✅ Phase 3: USFM Formatter (`@usfm-tools/formatter`) - COMPLETED

### Package Setup
- [x] **Step 3.1**: Create TypeScript configuration
- [x] **Step 3.2**: Update package.json dependencies (`@usfm-tools/types`, `@usfm-tools/parser`)
- [x] **Step 3.3**: Add to root tsconfig.json references

### Formatting Rules Migration & Enhancement
- [x] **Step 3.4**: ~~Copy USFMFormattingRules.ts~~ → **REDESIGNED**: Created new comprehensive rules system
- [x] **Step 3.5**: Copy `migration-backup-20250620-203644/src/grammar/handlers/NormalizationRules.ts`  
  → `packages/usfm-formatter/src/rules/NormalizationRules.ts`
- [x] **Step 3.6**: Update imports to use monorepo packages
- [x] **Step 3.7**: Test build: `bun run do -- usfm-formatter build`

### ✨ Enhanced Features Implemented
- [x] **Context-aware rules** with previousMarker, nextMarker, ancestorMarkers, isDocumentStart
- [x] **Pattern-based rules** using RegExp for multiple marker matching  
- [x] **Simplified whitespace format** (string-based instead of complex objects)
- [x] **FormattingFunction interface** for dynamic formatting
- [x] **Enhanced rule matcher** with priority system and context evaluation
- [x] **Comprehensive examples** with real-world rule sets

### Formatter Tests Migration & Enhancement  
- [x] **Step 3.8**: Copy `migration-backup-20250620-203644/src/grammar/__tests__/USFMFormattingRules.test.ts`  
  → `packages/usfm-formatter/tests/USFMFormattingRules.test.ts`
- [x] **Step 3.9**: Copy normalization tests from `migration-backup-20250620-203644/src/__tests__/`:
  - [x] `normalize.test.ts` → `packages/usfm-formatter/tests/`
  - [x] `normalize.examples.test.ts` → `packages/usfm-formatter/tests/`
  - [x] `normalize.integration.test.ts` → `packages/usfm-formatter/tests/`
- [x] **Step 3.10**: Update test imports
- [x] **Step 3.11**: Test: `bun run do -- usfm-formatter test` ✅ All 61 tests passing

### Documentation Updates
- [x] **Updated README.md** with new API and context features
- [x] **Updated simple-usage.md** with new examples and API
- [x] **Created advanced-features.md** comprehensive guide for new features

---

## 🔄 Phase 4: USJ Core (`@usj-tools/core`)

### Package Setup
- [ ] **Step 4.1**: Create TypeScript configuration
- [ ] **Step 4.2**: Update package.json dependencies (`@usfm-tools/types`)
- [ ] **Step 4.3**: Add to root tsconfig.json references

### Core Logic Migration
- [ ] **Step 4.4**: Identify USJ-specific utilities from backup (if any)
- [ ] **Step 4.5**: Create USJ manipulation utilities
- [ ] **Step 4.6**: Test build: `bun run do -- usj-core build`

---

## 📦 Phase 5: Adapters (Format Conversion)

### USFM Adapters (`@usfm-tools/adapters`)
- [ ] **Step 5.1**: Package setup (tsconfig, dependencies)
- [ ] **Step 5.2**: Migrate USFM visitors from `migration-backup-20250620-203644/src/grammar/visitors/`:
  - [ ] `USFM/USFMVisitor.ts` → `packages/usfm-adapters/src/usfm/`
  - [ ] `USFM/index.ts` → `packages/usfm-adapters/src/usfm/`
  - [ ] `TextVisitor.ts` → `packages/usfm-adapters/src/text/`
  - [ ] `HTMLVisitor.ts` → `packages/usfm-adapters/src/html/`
  - [ ] `USX/index.ts` → `packages/usfm-adapters/src/usx/` (USFM→USX)
- [ ] **Step 5.3**: Migrate USFM visitor tests:
  - [ ] `USFMVisitor.normalize.test.ts` → `packages/usfm-adapters/tests/`
  - [ ] `USXVisitor.test.ts` → `packages/usfm-adapters/tests/`
  - [ ] `parser.visitors.test.ts` → `packages/usfm-adapters/tests/` (relevant parts)
- [ ] **Step 5.4**: Update imports
- [ ] **Step 5.5**: Test build: `bun run do -- usfm-adapters build`

### USJ Adapters (`@usj-tools/adapters`)
- [ ] **Step 5.6**: Package setup
- [ ] **Step 5.7**: Migrate USJ converters:
  - [ ] `migration-backup-20250620-203644/src/converters/USJToUSFM.ts` → `packages/usj-adapters/src/usfm/`
  - [ ] `migration-backup-20250620-203644/src/grammar/visitors/USJ/index.ts` → `packages/usj-adapters/src/shared/` (USJ visitor utilities)
- [ ] **Step 5.8**: Migrate USJ converter tests:
  - [ ] All files from `migration-backup-20250620-203644/src/converters/__tests__/` → `packages/usj-adapters/tests/`
  - [ ] `USJVisitor.test.ts` → `packages/usj-adapters/tests/`
  - [ ] `USJVisitor.complex.test.ts` → `packages/usj-adapters/tests/`
  - [ ] `USJVisitor.incremental.test.ts` → `packages/usj-adapters/tests/`
- [ ] **Step 5.9**: Update imports
- [ ] **Step 5.10**: Test build: `bun run do -- usj-adapters build`

---

## 🔧 Phase 6: Formatters

### USJ Formatter (`@usj-tools/formatter`)
- [ ] **Step 6.1**: Package setup
- [ ] **Step 6.2**: Create USJ formatting logic (if needed)
- [ ] **Step 6.3**: Test build: `bun run do -- usj-formatter build`

---

## ✅ Phase 7: Validators

### USFM Validator (`@usfm-tools/validator`)
- [ ] **Step 7.1**: Package setup
- [ ] **Step 7.2**: Create validation logic
- [ ] **Step 7.3**: Test build: `bun run do -- usfm-validator build`

### USJ Validator (`@usj-tools/validator`)
- [ ] **Step 7.4**: Package setup
- [ ] **Step 7.5**: Create USJ validation logic
- [ ] **Step 7.6**: Test build: `bun run do -- usj-validator build`

---

## 🖥️ Phase 8: CLI Tools

### USFM CLI (`@usfm-tools/cli`)
- [ ] **Step 8.1**: Package setup
- [ ] **Step 8.2**: Create CLI commands
- [ ] **Step 8.3**: Test build: `bun run do -- usfm-cli build`

### USJ CLI (`@usj-tools/cli`)
- [ ] **Step 8.4**: Package setup
- [ ] **Step 8.5**: Create CLI commands
- [ ] **Step 8.6**: Test build: `bun run do -- usj-cli build`

---

## 🧪 Phase 9: Integration & Testing

### Root Level Integration
- [ ] **Step 9.1**: Migrate root entry point `migration-backup-20250620-203644/src/index.ts` to root or create new unified exports
- [ ] **Step 9.2**: Create integration tests in `tests/integration/`
- [ ] **Step 9.3**: Test full pipeline: USFM → USJ → USFM

### Cross-Package Testing
- [ ] **Step 9.4**: All packages build successfully
- [ ] **Step 9.5**: All packages pass individual tests
- [ ] **Step 9.6**: Cross-package dependencies work correctly

### Performance Testing
- [ ] **Step 9.7**: Copy `performance-results.json` to appropriate location
- [ ] **Step 9.8**: Create performance benchmarks in `tests/performance/`

---

## 📚 Phase 10: Documentation & Cleanup

### Documentation
- [ ] **Step 10.1**: Update root README.md
- [ ] **Step 10.2**: Create package documentation
- [ ] **Step 10.3**: Update API documentation

### Cleanup
- [ ] **Step 10.4**: Remove old package-lock.json
- [ ] **Step 10.5**: Clean up root directory
- [ ] **Step 10.6**: Update .gitignore
- [ ] **Step 10.7**: Remove migration backup (after verification)

---

## 🚀 Phase 11: Publishing & Release

### Pre-release
- [ ] **Step 11.1**: Version all packages
- [ ] **Step 11.2**: Generate changelogs
- [ ] **Step 11.3**: Test publishing to npm (dry run)

### Release
- [ ] **Step 11.4**: Publish all packages
- [ ] **Step 11.5**: Create GitHub release
- [ ] **Step 11.6**: Update documentation

---

## 📊 Progress Summary

- **Completed**: 2/11 packages (18%) - ✅ Shared Types, ✅ USFM Formatter
- **In Progress**: 1/11 packages (USFM Parser - ~90% complete)
- **Remaining**: 8/11 packages

### Current Status: Phase 2 (USFM Parser)
**Next Steps**: 
1. Complete Step 2.16-2.19 (core parser tests)
2. Move to Phase 4 (USJ Core) or Phase 5 (Adapters)

---

## 🆘 Need Help?

When you encounter issues, mention:
- [ ] Which step you're on
- [ ] What error you're seeing
- [ ] What files you've modified

**Common Commands:**
```bash
# Build one package (see packages/ folder names)
bun run do -- usfm-parser build

# Test one package
bun run do -- usfm-parser test

# Build all packages (Turborepo)
bun run build

# Install dependencies
bun install
```

To target a package by npm scope instead, you can use Turborepo filters, for example:

`bunx turbo run build --filter=@usfm-tools/parser`

---

## 📝 Migration Notes

### Key Architectural Decisions:
1. **USFMFormattingRules** → `@usfm-tools/formatter` (not parser)
2. **Visitors** → `@*-tools/adapters` packages (not parser)
3. **Core parsing** stays in `@usfm-tools/parser`
4. **Normalization tests** → `@usfm-tools/formatter`
5. **Converter tests** → `@usj-tools/adapters`

### Files That Don't Need Migration:
- `migration-backup-20250620-203644/src/grammar/nodes/` (only contains .gitkeep)
- `migration-backup-20250620-203644/src/grammar/handlers/NormalizationRules.ts` (1 byte file)

---

**Last Updated**: 2024-12-20  
**Current Phase**: Phase 2 - USFM Parser (90% complete)  
**Next Step**: Step 2.16 - Complete core parser tests migration
