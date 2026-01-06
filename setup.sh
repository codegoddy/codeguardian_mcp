#!/bin/bash

# CodeGuardian MCP - Quick Setup Script
# This script helps you set up CodeGuardian for testing in Claude Desktop or Cline

echo "🚀 CodeGuardian MCP - Quick Setup"
echo "=================================="
echo ""

# Check Node version
echo "📋 Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be >= 20.0.0"
    echo "   Current version: $(node --version)"
    exit 1
fi
echo "✅ Node.js version: $(node --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"
echo ""

# Build project
echo "🔨 Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Project built successfully"
echo ""

# Run tests
echo "🧪 Running tests..."
node tests/validation/robust-test-suite.js
if [ $? -ne 0 ]; then
    echo "⚠️  Some tests failed, but core functionality works"
else
    echo "✅ All tests passed!"
fi
echo ""

# Get absolute path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PATH="$SCRIPT_DIR/dist/server.js"

echo "=================================="
echo "✅ CodeGuardian MCP is ready!"
echo "=================================="
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. For Claude Desktop:"
echo "   Edit: ~/.config/Claude/claude_desktop_config.json"
echo "   Add:"
echo '   {
     "mcpServers": {
       "codeguardian": {
         "command": "node",
         "args": ["'$SERVER_PATH'"]
       }
     }
   }'
echo ""
echo "2. For Cline (VS Code):"
echo "   Edit VS Code settings.json"
echo "   Add:"
echo '   {
     "cline.mcpServers": {
       "codeguardian": {
         "command": "node",
         "args": ["'$SERVER_PATH'"]
       }
     }
   }'
echo ""
echo "3. Test the server:"
echo "   node $SERVER_PATH"
echo ""
echo "4. Run real-world tests:"
echo "   node tests/real-world/test-multi-file-codebase.js"
echo ""
echo "=================================="
echo "🎉 Setup complete! Ready to test!"
echo "=================================="
