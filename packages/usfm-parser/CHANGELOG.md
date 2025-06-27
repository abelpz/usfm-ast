# Changelog

All notable changes to `@usfm-tools/parser` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enhanced paragraph marker normalization rules
- Improved verse marker positioning logic
- Context-aware whitespace handling for different marker types
- New `peekNextMarkerAfterCurrent` method for better parsing context

### Changed
- Updated whitespace normalization to handle paragraph-to-content relationships
- Improved verse marker newline handling
- Enhanced test coverage for normalization rules

### Fixed
- Fixed whitespace handling between paragraph markers and subsequent content
- Improved line ending normalization consistency

## [0.1.0] - 2024-12-20

### Added
- Initial release of USFM parser
- Complete USFM 3.1+ marker support
- AST generation with typed nodes
- Whitespace normalization functionality
- Custom marker support
- Error reporting and logging system
- Position tracking for debugging
- Visitor pattern support for AST traversal
- Performance monitoring capabilities
- TypeScript definitions

### Features
- **Core Parser**: `USFMParser` class with fluent API
- **Node Types**: Paragraph, Character, Text, Note, and Milestone nodes
- **Markers Supported**:
  - Identification markers (`\id`, `\h`, `\toc1-3`)
  - Paragraph markers (`\p`, `\m`, `\q1-4`, `\li1-4`)
  - Character markers (`\bd`, `\it`, `\sc`, `\w`, `\wj`)
  - Verse and chapter markers (`\v`, `\c`, `\ca`, `\cp`)
  - Note markers (`\f`, `\fe`, `\x`, footnote content markers)
  - Milestone markers (`\qt-s/e`, `\ts-s/e`, `\k-s/e`)
  - Table markers (`\tr`, `\th1-5`, `\tc1-5`)
- **Normalization Rules**:
  - Line ending standardization (CRLF/CR → LF)
  - Whitespace cleanup and standardization
  - Paragraph and verse spacing optimization
  - Character marker spacing normalization
- **Error Handling**: Detailed warnings and error messages with context
- **Performance**: Optimized parsing for large scripture texts
- **Extensibility**: Custom marker registration system

### Technical Details
- Written in TypeScript with full type definitions
- Comprehensive test suite with 90%+ coverage
- Performance benchmarking and monitoring
- Memory-efficient AST generation
- Position tracking for infinite loop detection
- Visitor pattern implementation for AST traversal

### Development
- Jest testing framework
- TypeScript compilation
- ESLint code quality
- Performance testing suite
- Comprehensive documentation

---

## Development Guidelines

### Version Bumping
- **Major** (x.0.0): Breaking API changes, major feature overhauls
- **Minor** (0.x.0): New features, backward-compatible changes
- **Patch** (0.0.x): Bug fixes, documentation updates, minor improvements

### Change Categories
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

### Commit Message Format
```
type(scope): description

body (optional)

footer (optional)
```

**Types**: feat, fix, docs, style, refactor, test, chore
**Scopes**: parser, normalizer, types, tests, docs
