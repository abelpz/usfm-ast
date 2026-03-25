#!/bin/bash
#
# LEGACY — kept for historical reference only.
# This repository uses Bun workspaces + Turborepo (root package.json, turbo.json, bun.lock).
# Do not run this script unless you are intentionally reproducing an old pnpm layout.

echo "🔧 Converting to PNPM Workspaces configuration..."

# Create pnpm-workspace.yaml
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
EOF

# Update root package.json for PNPM workspaces
cat > package.json << 'EOF'
{
  "name": "usfm-usj-monorepo",
  "version": "0.0.1",
  "private": true,
  "description": "Monorepo for USFM and USJ tools and libraries",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "test:integration": "jest tests/integration",
    "test:performance": "jest tests/performance",
    "lint": "pnpm -r run lint",
    "lint:fix": "pnpm -r run lint:fix",
    "clean": "pnpm -r run clean",
    "dev": "pnpm -r --parallel run dev",
    "typecheck": "pnpm -r run typecheck",
    "format": "prettier --write \"**/*.{ts,js,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,js,json,md}\"",
    "publish:usfm": "pnpm -r --filter=\"@usfm-tools/*\" publish",
    "publish:usj": "pnpm -r --filter=\"@usj-tools/*\" publish",
    "publish:all": "pnpm -r publish",
    "version:patch": "pnpm -r exec -- npm version patch",
    "version:minor": "pnpm -r exec -- npm version minor",
    "version:major": "pnpm -r exec -- npm version major",
    "deps:update": "pnpm -r update",
    "deps:check": "pnpm -r outdated"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "eslint": "^8.0.0",
    "eslint-config-prettier": "^9.0.0",
    "jest": "^29.5.0",
    "prettier": "^3.0.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.15.0"
}
EOF

# Create .npmrc for PNPM configuration
cat > .npmrc << 'EOF'
# Use PNPM for package management
auto-install-peers=true
strict-peer-dependencies=false
save-exact=true

# Workspace configuration
link-workspace-packages=true
prefer-workspace-packages=true

# Publishing configuration
publish-branch=main
access=public

# Performance
prefer-frozen-lockfile=true
EOF

# Update .gitignore for PNPM
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# PNPM
.pnpm-store/
pnpm-lock.yaml

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
EOF

# Remove lerna.json since we're using PNPM
if [ -f "lerna.json" ]; then
  rm lerna.json
  echo "   ✓ Removed lerna.json"
fi

# Create package.json templates for each package
echo "📦 Creating package.json templates..."

# USFM Tools package templates
packages=(
  "usfm-parser:@usfm-tools/parser:USFM parsing and AST generation"
  "usfm-adapters:@usfm-tools/adapters:Convert USFM to other formats"
  "usfm-formatter:@usfm-tools/formatter:USFM formatting and normalization"
  "usfm-validator:@usfm-tools/validator:USFM validation and linting"
  "usfm-cli:@usfm-tools/cli:Command-line tools for USFM"
  "usj-core:@usj-tools/core:USJ manipulation and utilities"
  "usj-adapters:@usj-tools/adapters:Convert USJ to other formats"
  "usj-formatter:@usj-tools/formatter:USJ formatting and normalization"
  "usj-validator:@usj-tools/validator:USJ validation and schema checking"
  "usj-cli:@usj-tools/cli:Command-line tools for USJ"
  "shared-types:@usfm-tools/types:Shared TypeScript types"
)

for package_info in "${packages[@]}"; do
  IFS=':' read -r dir_name package_name description <<< "$package_info"
  
  cat > packages/$dir_name/package.json << EOF
{
  "name": "$package_name",
  "version": "0.1.0",
  "description": "$description",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "usfm",
    "usj",
    "scripture",
    "bible",
    "parser"
  ],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/abelpz/usfm-ast.git",
    "directory": "packages/$dir_name"
  },
  "publishConfig": {
    "access": "public"
  }
}
EOF

  echo "   ✓ Created packages/$dir_name/package.json"
done

echo ""
echo "✅ PNPM Workspace configuration complete!"
echo ""
echo "📄 Files created/updated:"
echo "   - pnpm-workspace.yaml (workspace definition)"
echo "   - package.json (updated for PNPM)"
echo "   - .npmrc (PNPM configuration)"
echo "   - .gitignore (updated for PNPM)"
echo "   - 11 package.json files in packages/"
echo ""
echo "🚀 Next steps:"
echo "   1. Install PNPM: npm install -g pnpm"
echo "   2. Install dependencies: pnpm install"
echo "   3. Build all packages: pnpm run build"
echo "   4. Run tests: pnpm run test" 