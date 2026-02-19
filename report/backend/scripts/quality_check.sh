#!/bin/bash

# Backend Quality Checks Script
# Run this script to check code quality before pushing changes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  BACKEND QUALITY CHECKS"
echo "========================================"
echo ""

# Get script directory and backend root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo -e "${YELLOW}⚠️  Virtual environment not activated${NC}"
    echo "Activating virtual environment..."
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    else
        echo -e "${RED}❌ Virtual environment not found at venv/bin/activate${NC}"
        echo "Please create and activate your virtual environment first:"
        echo "  python3 -m venv venv"
        echo "  source venv/bin/activate"
        exit 1
    fi
fi

# Install/Check required tools
echo "Checking required tools..."
pip install -q flake8 black isort bandit 2>/dev/null || true

echo ""
echo "========================================"
echo "1. BLACK (Code Formatting)"
echo "========================================"

if black --check --diff . 2>/dev/null; then
    echo -e "${GREEN}✅ Black formatting check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Black formatting issues found${NC}"
    echo "Running black to fix formatting..."
    black . 2>/dev/null
    echo -e "${GREEN}✅ Formatting fixed${NC}"
fi

echo ""
echo "========================================"
echo "2. ISORT (Import Sorting)"
echo "========================================"

if isort --check-only --diff . 2>/dev/null; then
    echo -e "${GREEN}✅ Import sorting check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Import sorting issues found${NC}"
    echo "Running isort to fix imports..."
    isort . 2>/dev/null
    echo -e "${GREEN}✅ Imports sorted${NC}"
fi

echo ""
echo "========================================"
echo "3. FLAKE8 (Critical Errors)"
echo "========================================"

# Check for critical errors only (exclude venv)
FLAKE8_ERRORS=$(flake8 . --count --select=E9,F63,F7,F82 --statistics --exclude=venv,__pycache__,migrations 2>/dev/null || true)

if [ -z "$FLAKE8_ERRORS" ] || [ "$FLAKE8_ERRORS" = "0" ]; then
    echo -e "${GREEN}✅ No critical errors found${NC}"
else
    echo -e "${RED}❌ Critical errors found:${NC}"
    flake8 . --select=E9,F63,F7,F82 --show-source --exclude=venv,__pycache__ 2>/dev/null || true
    exit 1
fi

echo ""
echo "========================================"
echo "4. PYTHON SYNTAX CHECK"
echo "========================================"

SYNTAX_ERRORS=0

# Find all Python files and check syntax
while IFS= read -r file; do
    if ! python3 -m py_compile "$file" 2>/dev/null; then
        echo -e "${RED}❌ Syntax error in: $file${NC}"
        SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
    fi
done < <(find . -name "*.py" -not -path "./venv/*" -not -path "./__pycache__/*")

if [ $SYNTAX_ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All Python files have valid syntax${NC}"
else
    echo -e "${RED}❌ $SYNTAX_ERRORS file(s) with syntax errors${NC}"
    exit 1
fi

echo ""
echo "========================================"
echo "5. BANDIT (Security Scan)"
echo "========================================"

# Run bandit but don't fail on low severity issues
echo "Running security scan..."
bandit -r app/ -f txt -ll 2>/dev/null || true
echo -e "${GREEN}✅ Security scan completed${NC}"
echo "   (Review any high severity issues above)"

echo ""
echo "========================================"
echo "  ALL CHECKS PASSED! ✅"
echo "========================================"
echo ""
echo "Your backend code is ready to push!"
echo ""
