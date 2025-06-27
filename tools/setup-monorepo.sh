#!/bin/bash

echo "🏗️  Setting up USFM-USJ Monorepo Structure..."

# Create root directories
mkdir -p {docs,examples,tests,tools,scripts}

# Create packages directory structure
mkdir -p packages/{usfm-parser,usfm-adapters,usfm-formatter,usfm-validator,usfm-cli}
mkdir -p packages/{usj-core,usj-adapters,usj-formatter,usj-validator,usj-cli}
mkdir -p packages/shared-types

# USFM Parser package structure
mkdir -p packages/usfm-parser/{src,tests,docs}
mkdir -p packages/usfm-parser/src/{parser,nodes,constants,handlers,interfaces,utils}

# USFM Adapters package structure  
mkdir -p packages/usfm-adapters/{src,tests,docs}
mkdir -p packages/usfm-adapters/src/{text,html,usfm,usj,usx,shared}

# USFM Formatter package structure
mkdir -p packages/usfm-formatter/{src,tests,docs}
mkdir -p packages/usfm-formatter/src/{formatters,rules,presets,utils}

# USFM Validator package structure
mkdir -p packages/usfm-validator/{src,tests,docs}
mkdir -p packages/usfm-validator/src/{validators,rules,schemas,utils}

# USFM CLI package structure
mkdir -p packages/usfm-cli/{src,tests,docs,bin}
mkdir -p packages/usfm-cli/src/{commands,utils}

# USJ Core package structure
mkdir -p packages/usj-core/{src,tests,docs}
mkdir -p packages/usj-core/src/{types,utils,builders,validators}

# USJ Adapters package structure
mkdir -p packages/usj-adapters/{src,tests,docs}
mkdir -p packages/usj-adapters/src/{usfm,usx,text,html,markdown,shared}

# USJ Formatter package structure
mkdir -p packages/usj-formatter/{src,tests,docs}
mkdir -p packages/usj-formatter/src/{formatters,rules,presets,utils}

# USJ Validator package structure
mkdir -p packages/usj-validator/{src,tests,docs}
mkdir -p packages/usj-validator/src/{validators,schemas,rules,utils}

# USJ CLI package structure
mkdir -p packages/usj-cli/{src,tests,docs,bin}
mkdir -p packages/usj-cli/src/{commands,utils}

# Shared Types package structure
mkdir -p packages/shared-types/{src,tests,docs}
mkdir -p packages/shared-types/src/{usfm,usj,usx,shared}

# Documentation structure
mkdir -p docs/{api,guides,specifications,contributing}
mkdir -p docs/api/{usfm-tools,usj-tools,shared}
mkdir -p docs/guides/{getting-started,tutorials,best-practices}
mkdir -p docs/specifications/{usfm,usj,usx}

# Examples structure
mkdir -p examples/{usfm,usj,conversion,cli,integration}
mkdir -p examples/usfm/{parsing,formatting,validation}
mkdir -p examples/usj/{manipulation,building,validation}
mkdir -p examples/conversion/{usfm-to-usj,usj-to-usfm,batch-processing}

# Tests structure  
mkdir -p tests/{integration,performance,fixtures}
mkdir -p tests/fixtures/{usfm,usj,usx}
mkdir -p tests/integration/{cross-format,end-to-end}

# Tools structure
mkdir -p tools/{debug,benchmark,generators,migration}

# Scripts structure
mkdir -p scripts/{build,dev,release,utils}

echo "📁 Folder structure created!"

# Create placeholder files to preserve structure
echo "🗂️  Creating placeholder files..."

# Root package.json files for each package
packages=(
  "usfm-parser" "usfm-adapters" "usfm-formatter" "usfm-validator" "usfm-cli"
  "usj-core" "usj-adapters" "usj-formatter" "usj-validator" "usj-cli"
  "shared-types"
)

for package in "${packages[@]}"; do
  touch packages/$package/package.json
  touch packages/$package/README.md
  touch packages/$package/CHANGELOG.md
  touch packages/$package/src/index.ts
  touch packages/$package/tests/index.test.ts
done

# Create main index files for key directories
touch docs/README.md
touch examples/README.md
touch tests/README.md
touch tools/README.md

# Create gitkeep files for empty directories that might be needed
find . -type d -empty -exec touch {}/.gitkeep \;

echo "✅ Monorepo structure setup complete!"
echo ""
echo "📊 Structure summary:"
echo "   📦 11 packages created"
echo "   📁 $(find packages -type d | wc -l) package directories"
echo "   📄 $(find packages -name "*.json" -o -name "*.md" -o -name "*.ts" | wc -l) placeholder files"
echo ""
echo "🚀 Next steps:"
echo "   1. Run this script: chmod +x setup-monorepo.sh && ./setup-monorepo.sh"
echo "   2. Create root package.json with workspaces"
echo "   3. Set up lerna.json configuration"
echo "   4. Begin migrating existing code" 