# USFM-USJ Monorepo

A comprehensive monorepo containing tools and libraries for working with USFM (Unified Standard Format Markers) and USJ (Unified Scripture JSON) formats.

## 🏗️ Architecture

This monorepo is organized into two main tool ecosystems:

### @usfm-tools/* - USFM Ecosystem
- **@usfm-tools/parser** - USFM parsing and AST generation
- **@usfm-tools/adapters** - Convert USFM to other formats (USJ, USX, Text, HTML)
- **@usfm-tools/formatter** - USFM formatting and normalization
- **@usfm-tools/validator** - USFM validation and linting
- **@usfm-tools/cli** - Command-line tools for USFM

### @usj-tools/* - USJ Ecosystem  
- **@usj-tools/core** - USJ manipulation and utilities
- **@usj-tools/adapters** - Convert USJ to other formats (USFM, USX, Text, HTML)
- **@usj-tools/formatter** - USJ formatting and normalization
- **@usj-tools/validator** - USJ validation and schema checking
- **@usj-tools/cli** - Command-line tools for USJ

## 🚀 Quick Start

Uses **[Bun](https://bun.sh)** workspaces and **[Turborepo](https://turbo.build)** (see root `package.json` and `turbo.json`).

```bash
# Install dependencies
bun install

# Lint, typecheck, test, build (via turbo)
bun run lint
bun run check-types
bun run test
bun run build

# Development mode (watch) — packages that define a `dev` script
bun run dev
```

## 📦 Package Installation

```bash
# USFM tools
npm install @usfm-tools/parser @usfm-tools/adapters

# USJ tools
npm install @usj-tools/core @usj-tools/adapters

# CLI tools
npm install -g @usfm-tools/cli @usj-tools/cli
```

## 📖 Documentation

- [Project goal & CI contract](./docs/00-project-goal.md)
- [Getting Started Guide](./docs/guides/getting-started/README.md)
- [API Reference](./docs/api/README.md)
- [Examples](./examples/README.md)

## 🤝 Contributing

See [CONTRIBUTING.md](./docs/contributing/README.md) for development guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.
