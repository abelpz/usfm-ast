#!/bin/bash

echo "📦 Backing up current files to temporary folder..."

# Create backup directory with timestamp
BACKUP_DIR="migration-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 Created backup directory: $BACKUP_DIR"

# Files and directories to preserve (move to backup)
echo "🔄 Moving current files to backup..."

# Move source code
if [ -d "src" ]; then
  mv src "$BACKUP_DIR/"
  echo "   ✓ Moved src/ directory"
fi

# Move existing documentation  
if [ -d "docs" ]; then
  mv docs "$BACKUP_DIR/"
  echo "   ✓ Moved docs/ directory"
fi

# Move existing examples
if [ -d "examples" ]; then
  mv examples "$BACKUP_DIR/"
  echo "   ✓ Moved examples/ directory"
fi

# Move scripts
if [ -d "scripts" ]; then
  mv scripts "$BACKUP_DIR/"
  echo "   ✓ Moved scripts/ directory"
fi

# Move types
if [ -d "types" ]; then
  mv types "$BACKUP_DIR/"
  echo "   ✓ Moved types/ directory"
fi

# Move build output (to preserve for reference)
if [ -d "dist" ]; then
  mv dist "$BACKUP_DIR/"
  echo "   ✓ Moved dist/ directory"
fi

# Move configuration files
echo "🔧 Moving configuration files..."
for file in tsconfig.json jest.config.ts tsup.config.ts; do
  if [ -f "$file" ]; then
    mv "$file" "$BACKUP_DIR/"
    echo "   ✓ Moved $file"
  fi
done

# Move debug and test files from root
echo "🧹 Moving debug and test files..."
for pattern in "debug-*" "test-*"; do
  for file in $pattern; do
    if [ -f "$file" ]; then
      mv "$file" "$BACKUP_DIR/"
      echo "   ✓ Moved $file"
    fi
  done
done

# Move large debug output files
for pattern in "*.usfm" "debug-*.json"; do
  for file in $pattern; do
    if [ -f "$file" ] && [ "$file" != "package.json" ]; then
      mv "$file" "$BACKUP_DIR/"
      echo "   ✓ Moved $file"
    fi
  done
done

# Keep important root files (don't move these)
echo "📋 Keeping essential root files:"
for file in package.json package-lock.json README.md LICENSE .gitignore .prettierrc .eslintrc.json; do
  if [ -f "$file" ]; then
    echo "   ✓ Keeping $file"
  fi
done

# Keep hidden directories
echo "📁 Keeping hidden directories:"
for dir in .git .vscode node_modules; do
  if [ -d "$dir" ]; then
    echo "   ✓ Keeping $dir/"
  fi
done

echo ""
echo "✅ Backup completed!"
echo ""
echo "📊 Backup summary:"
echo "   📁 Backup location: $BACKUP_DIR/"
echo "   📄 Files moved: $(find "$BACKUP_DIR" -type f | wc -l)"
echo "   📂 Directories moved: $(find "$BACKUP_DIR" -type d | wc -l)"
echo ""
echo "🔍 Current directory contents:"
ls -la
echo ""
echo "🚀 Ready for monorepo setup!"
echo "   Next: Run ./setup-monorepo.sh to create the new structure" 