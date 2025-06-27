#!/bin/bash

echo "⚙️  Creating monorepo configuration files..."

# Root package.json
cat > package.json << 'EOF'
{
  "name": "usfm-usj-monorepo",
  "version": "0.0.1",
  "private": true,
  "description": "Monorepo for USFM and USJ tools and libraries",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "lerna run build",
    "test": "lerna run test",
    "test:integration": "jest tests/integration",
    "test:performance": "jest tests/performance",
    "lint": "lerna run lint",
    "lint:fix": "lerna run lint:fix",
    "clean": "lerna run clean",
    "dev": "lerna run dev --parallel",
    "bootstrap": "lerna bootstrap",
    "publish:usfm": "lerna publish --scope=\"@usfm-tools/*\"",
    "publish:usj": "lerna publish --scope=\"@usj-tools/*\"",
    "version": "lerna version",
    "release": "lerna version && lerna publish from-git",
    "format": "prettier --write \"**/*.{ts,js,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,js,json,md}\"",
    "typecheck": "lerna run typecheck"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "eslint": "^8.0.0",
    "eslint-config-prettier": "^9.0.0",
    "jest": "^29.5.0",
    "lerna": "^7.0.0",
    "prettier": "^3.0.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
EOF

# Lerna configuration
cat > lerna.json << 'EOF'
{
  "version": "independent",
  "npmClient": "npm",
  "command": {
    "publish": {
      "conventionalCommits": true,
      "message": "chore(release): publish packages",
      "registry": "https://registry.npmjs.org/"
    },
    "version": {
      "allowBranch": ["main", "develop", "release/*"],
      "conventionalCommits": true,
      "createRelease": "github"
    }
  },
  "packages": [
    "packages/*"
  ],
  "ignoreChanges": [
    "**/*.md",
    "**/tests/**",
    "**/docs/**"
  ]
}
EOF

# Root TypeScript configuration
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "incremental": true,
    "resolveJsonModule": true
  },
  "include": [
    "packages/*/src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.spec.ts"
  ],
  "references": [
    { "path": "./packages/shared-types" },
    { "path": "./packages/usfm-parser" },
    { "path": "./packages/usfm-adapters" },
    { "path": "./packages/usfm-formatter" },
    { "path": "./packages/usfm-validator" },
    { "path": "./packages/usfm-cli" },
    { "path": "./packages/usj-core" },
    { "path": "./packages/usj-adapters" },
    { "path": "./packages/usj-formatter" },
    { "path": "./packages/usj-validator" },
    { "path": "./packages/usj-cli" }
  ]
}
EOF

# Jest configuration
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    '<rootDir>/packages/*/jest.config.js',
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/tests/performance/**/*.test.ts'],
      testTimeout: 30000
    }
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
EOF

# ESLint configuration
cat > .eslintrc.json << 'EOF'
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/prefer-const": "error"
  },
  "ignorePatterns": ["dist/", "node_modules/", "*.js"]
}
EOF

# Prettier configuration
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
EOF

# Updated .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.tsbuildinfo

# Test outputs
coverage/
.nyc_output/
junit.xml

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Debug files (moved to tools/debug)
debug-*.js
debug-*.json
debug-*.usfm
test-*.js
test-*.cjs

# Temporary files
*.tmp
*.temp
.cache/

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Lerna
lerna-debug.log*
EOF

# Root README.md
cat > README.md << 'EOF'
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

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Development mode (watch)
npm run dev
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

- [Getting Started Guide](./docs/guides/getting-started/README.md)
- [API Reference](./docs/api/README.md)
- [Examples](./examples/README.md)

## 🤝 Contributing

See [CONTRIBUTING.md](./docs/contributing/README.md) for development guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.
EOF

echo "✅ Configuration files created!"
echo ""
echo "📄 Files created:"
echo "   - package.json (root with workspaces)"
echo "   - lerna.json (monorepo management)"
echo "   - tsconfig.json (TypeScript project references)"
echo "   - jest.config.js (testing configuration)"
echo "   - .eslintrc.json (linting rules)"
echo "   - .prettierrc (code formatting)"
echo "   - .gitignore (updated with monorepo patterns)"
echo "   - README.md (monorepo overview)" 