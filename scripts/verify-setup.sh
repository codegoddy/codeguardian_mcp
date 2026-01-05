#!/bin/bash

# CodeGuardian MCP - Setup Verification Script
# Run this to verify the workspace is ready for development

echo "🔍 Verifying CodeGuardian MCP Workspace Setup..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/"
        return 1
    fi
}

errors=0

# Check core files
echo "📋 Checking Core Files..."
check_file "package.json" || ((errors++))
check_file "tsconfig.json" || ((errors++))
check_file "jest.config.js" || ((errors++))
check_file ".eslintrc.json" || ((errors++))
check_file ".gitignore" || ((errors++))
echo ""

# Check source structure
echo "📂 Checking Source Structure..."
check_dir "src" || ((errors++))
check_dir "src/tools" || ((errors++))
check_dir "src/analyzers" || ((errors++))
check_dir "src/resources" || ((errors++))
check_dir "src/prompts" || ((errors++))
check_dir "src/utils" || ((errors++))
check_file "src/server.ts" || ((errors++))
echo ""

# Check tool implementations
echo "🔧 Checking Tool Implementations..."
check_file "src/tools/preventHallucinations.ts" || ((errors++))
check_file "src/tools/analyzeCodeQuality.ts" || ((errors++))
check_file "src/tools/generateTests.ts" || ((errors++))
check_file "src/tools/runSecurityScan.ts" || ((errors++))
check_file "src/tools/checkProductionReadiness.ts" || ((errors++))
echo ""

# Check analyzers
echo "🔬 Checking Analyzer Modules..."
check_file "src/analyzers/symbolTable.ts" || ((errors++))
check_file "src/analyzers/referenceValidator.ts" || ((errors++))
check_file "src/analyzers/typeChecker.ts" || ((errors++))
check_file "src/analyzers/contradictionDetector.ts" || ((errors++))
check_file "src/analyzers/complexity.ts" || ((errors++))
check_file "src/analyzers/aiPatterns.ts" || ((errors++))
echo ""

# Check test structure
echo "🧪 Checking Test Structure..."
check_dir "tests/unit" || ((errors++))
check_dir "tests/integration" || ((errors++))
check_dir "tests/e2e" || ((errors++))
check_file "tests/unit/symbolTable.test.ts" || ((errors++))
check_file "tests/unit/referenceValidator.test.ts" || ((errors++))
echo ""

# Check documentation
echo "📚 Checking Documentation..."
check_file "README.md" || ((errors++))
check_file "README_IMPLEMENTATION.md" || ((errors++))
check_file "CONTRIBUTING.md" || ((errors++))
check_file "IMPLEMENTATION.md" || ((errors++))
check_dir "examples" || ((errors++))
check_file "examples/example-usage.md" || ((errors++))
check_file "examples/demo-scenarios.md" || ((errors++))
echo ""

# Check Node.js version
echo "🟢 Checking Node.js Version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"
    
    # Extract major version
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -ge 20 ]; then
        echo -e "  ${GREEN}✓${NC} Version >= 20 (required)"
    else
        echo -e "  ${RED}✗${NC} Version < 20 (required: >= 20)"
        ((errors++))
    fi
else
    echo -e "${RED}✗${NC} Node.js not found"
    ((errors++))
fi
echo ""

# Check npm
echo "📦 Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓${NC} npm $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm not found"
    ((errors++))
fi
echo ""

# Summary
echo "======================================"
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓ Workspace Setup Complete!${NC}"
    echo ""
    echo "🚀 Next Steps:"
    echo "  1. npm install          # Install dependencies"
    echo "  2. npm run build        # Build the project"
    echo "  3. npm test             # Run tests"
    echo "  4. npm start            # Start the MCP server"
    echo ""
    echo "📖 Read README_IMPLEMENTATION.md for detailed status"
    exit 0
else
    echo -e "${RED}✗ Setup Incomplete: $errors error(s) found${NC}"
    echo ""
    echo "Please ensure all files are in place before proceeding."
    exit 1
fi
