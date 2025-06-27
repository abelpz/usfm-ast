# Monorepo Tools Comparison

## Overview

This document compares three popular monorepo management tools for our USFM/USJ toolkit project.

## 📊 Feature Comparison

| Feature | PNPM Workspaces | Lerna | Nx |
|---------|-----------------|-------|-----|
| **Performance** | ⭐⭐⭐⭐⭐ Fast | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Fast |
| **Setup Complexity** | ⭐⭐⭐⭐⭐ Simple | ⭐⭐⭐⭐ Simple | ⭐⭐ Complex |
| **Dependency Management** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐ Good | ⭐⭐⭐⭐ Good |
| **Publishing** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐ Good |
| **Build System** | ⭐⭐⭐ Basic | ⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced |
| **Library Focus** | ⭐⭐⭐⭐⭐ Perfect | ⭐⭐⭐⭐⭐ Perfect | ⭐⭐ App-focused |
| **Learning Curve** | ⭐⭐⭐⭐ Easy | ⭐⭐⭐⭐⭐ Easy | ⭐⭐ Steep |
| **Maintenance** | ⭐⭐⭐⭐⭐ Active | ⭐⭐ Declining | ⭐⭐⭐⭐⭐ Active |

## 🔧 PNPM Workspaces (Recommended)

### ✅ Pros
- **Ultra-fast installs**: Content-addressable storage and hard links
- **Disk space efficient**: Shared dependencies across projects
- **Phantom dependency prevention**: Strict dependency resolution
- **Simple configuration**: Just `pnpm-workspace.yaml`
- **Built-in workspace support**: No additional tools needed
- **Modern approach**: Industry is moving toward PNPM
- **Great for libraries**: Perfect for publishing multiple packages

### ❌ Cons
- **Newer ecosystem**: Less mature than npm/yarn (but rapidly growing)
- **CI setup**: May need specific configuration in some CI environments
- **Command differences**: Different from npm (but similar)

### 📝 Configuration Files
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// package.json
{
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "publish:usfm": "pnpm -r --filter=\"@usfm-tools/*\" publish"
  }
}
```

### 🚀 Common Commands
```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm -r run build

# Test specific package
pnpm --filter @usfm-tools/parser test

# Publish USFM tools only
pnpm -r --filter="@usfm-tools/*" publish
```

## 📦 Lerna (Traditional)

### ✅ Pros
- **Mature ecosystem**: Well-established, lots of documentation
- **Publishing focus**: Excellent for npm package publishing
- **Version management**: Good semantic versioning support
- **Simple mental model**: Easy to understand

### ❌ Cons
- **Performance**: Slower than modern alternatives
- **Maintenance mode**: Less active development since 2022
- **Dependency duplication**: Larger node_modules
- **Limited features**: Fewer modern conveniences

### 📝 Configuration Files
```json
// lerna.json
{
  "version": "0.0.0",
  "npmClient": "npm",
  "command": {
    "publish": {
      "conventionalCommits": true
    }
  }
}
```

### 🚀 Common Commands
```bash
# Bootstrap packages
lerna bootstrap

# Build all packages
lerna run build

# Publish all packages
lerna publish
```

## 🏗️ Nx (Enterprise)

### ✅ Pros
- **Advanced build system**: Sophisticated caching and task orchestration
- **Dependency graph**: Visual project relationships
- **Code generation**: Powerful scaffolding tools
- **Affected builds**: Only build what changed
- **Enterprise features**: Great for large teams and complex applications

### ❌ Cons
- **Overkill for libraries**: Designed more for applications
- **Complex setup**: Heavy configuration and learning curve
- **Opinionated**: Enforces specific patterns and structure
- **Build-focused**: May be too much for simple library packages

### 📝 Configuration Files
```json
// nx.json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "@nrwl/workspace/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "lint", "test"]
      }
    }
  }
}
```

### 🚀 Common Commands
```bash
# Build all packages
nx run-many --target=build --all

# Test affected packages
nx affected:test

# Generate new library
nx generate @nrwl/node:library my-lib
```

## 🎯 Recommendation for USFM/USJ Toolkit

### **Winner: PNPM Workspaces** 🏆

**Why PNPM is the best choice for our project:**

1. **Library-focused**: We're building publishable packages, not applications
2. **Performance**: Fast development cycle with quick installs and builds
3. **Modern tooling**: Industry standard for new projects
4. **Simple but powerful**: Easy to set up, but with advanced features when needed
5. **Great publishing**: Excellent support for multi-package publishing
6. **Future-proof**: Active development and growing adoption

### **Use Cases for Each Tool:**

- **PNPM Workspaces**: ✅ Library packages, modern projects, performance-focused
- **Lerna**: 📚 Legacy projects, simple publishing needs, traditional setups
- **Nx**: 🏢 Large applications, complex build requirements, enterprise teams

## 🚀 Migration Path

If you want to switch to PNPM Workspaces:

1. **Run the setup script**: `./create-pnpm-config.sh`
2. **Install PNPM**: `npm install -g pnpm`
3. **Install dependencies**: `pnpm install`
4. **Build and test**: `pnpm run build && pnpm run test`

The migration preserves all existing functionality while providing better performance and modern tooling.

## 📚 Resources

- [PNPM Workspaces Documentation](https://pnpm.io/workspaces)
- [Lerna Documentation](https://lerna.js.org/)
- [Nx Documentation](https://nx.dev/)
- [Monorepo Tools Comparison](https://monorepo.tools/) 