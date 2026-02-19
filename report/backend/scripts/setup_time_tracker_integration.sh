#!/bin/bash

# Setup script for Time Tracker Integration
# This script helps set up the database and environment for time tracker integrations

set -e

echo "=========================================="
echo "Time Tracker Integration Setup"
echo "=========================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "alembic.ini" ]; then
    echo "Error: Please run this script from the backend directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "IMPORTANT: Please edit .env and add your configuration values"
    echo ""
fi

# Check if ENCRYPTION_KEY is set
if ! grep -q "^ENCRYPTION_KEY=" .env || grep -q "^ENCRYPTION_KEY=your-fernet-encryption-key-here" .env; then
    echo "Generating encryption key..."
    ENCRYPTION_KEY=$(python scripts/generate_encryption_key.py | grep "ENCRYPTION_KEY=" | cut -d'=' -f2)
    
    # Update .env file
    if grep -q "^ENCRYPTION_KEY=" .env; then
        # Replace existing key
        sed -i.bak "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" .env
    else
        # Add new key
        echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
    fi
    
    echo "✓ Encryption key generated and added to .env"
    echo ""
else
    echo "✓ Encryption key already configured"
    echo ""
fi

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt
echo "✓ Dependencies installed"
echo ""

# Run migrations
echo "Running database migrations..."
alembic upgrade head
echo "✓ Migrations completed"
echo ""

echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Start your backend server: uvicorn app.main:app --reload"
echo "2. Navigate to /integrations in your frontend"
echo "3. Connect your Toggl or Harvest account"
echo "4. Create a no-code project and link it to a time tracker project"
echo ""
echo "For more information, see MIGRATION_GUIDE.md"
echo ""
