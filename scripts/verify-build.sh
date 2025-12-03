#!/bin/bash
# Build Verification Script for Sanctions Check Electron App
# This script verifies that the Electron app builds and produces valid installers

set -e  # Exit on error

echo "======================================"
echo "Sanctions Check - Build Verification"
echo "======================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Run this script from the frontend directory.${NC}"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Step 1: Clean previous builds
echo -e "${YELLOW}Step 1: Cleaning previous builds...${NC}"
rm -rf build dist out release
echo -e "${GREEN}✓ Clean complete${NC}"
echo ""

# Step 2: Build React app
echo -e "${YELLOW}Step 2: Building React application...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ React build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ React build successful${NC}"
echo ""

# Step 3: Verify build directory
echo -e "${YELLOW}Step 3: Verifying build directory...${NC}"
if [ ! -d "build" ]; then
    echo -e "${RED}✗ Build directory not found${NC}"
    exit 1
fi

if [ ! -f "build/index.html" ]; then
    echo -e "${RED}✗ index.html not found in build directory${NC}"
    exit 1
fi

BUILD_SIZE=$(du -sh build | cut -f1)
echo -e "${GREEN}✓ Build directory exists (${BUILD_SIZE})${NC}"
echo ""

# Step 4: Build Electron installer
echo -e "${YELLOW}Step 4: Building Electron installer...${NC}"
npm run electron:build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Electron build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Electron build successful${NC}"
echo ""

# Step 5: Verify installer output
echo -e "${YELLOW}Step 5: Verifying installer output...${NC}"
INSTALLER_FOUND=false

# Check for Windows installer
if [ -f dist/*.exe ] || ls dist/*.exe 1> /dev/null 2>&1; then
    INSTALLER_FOUND=true
    INSTALLER_SIZE=$(du -sh dist/*.exe 2>/dev/null | cut -f1 | head -1)
    echo -e "${GREEN}✓ Windows installer found: ${INSTALLER_SIZE}${NC}"
fi

# Check for macOS installer
if [ -f dist/*.dmg ] || ls dist/*.dmg 1> /dev/null 2>&1; then
    INSTALLER_FOUND=true
    INSTALLER_SIZE=$(du -sh dist/*.dmg 2>/dev/null | cut -f1 | head -1)
    echo -e "${GREEN}✓ macOS installer found: ${INSTALLER_SIZE}${NC}"
fi

# Check for Linux installer
if [ -f dist/*.AppImage ] || ls dist/*.AppImage 1> /dev/null 2>&1; then
    INSTALLER_FOUND=true
    INSTALLER_SIZE=$(du -sh dist/*.AppImage 2>/dev/null | cut -f1 | head -1)
    echo -e "${GREEN}✓ Linux installer found: ${INSTALLER_SIZE}${NC}"
fi

if [ "$INSTALLER_FOUND" = false ]; then
    echo -e "${RED}✗ No installer found in dist/ directory${NC}"
    exit 1
fi
echo ""

# Step 6: List all generated files
echo -e "${YELLOW}Step 6: Generated files:${NC}"
if [ -d "dist" ]; then
    ls -lh dist/ | grep -E '\.(exe|dmg|AppImage|deb|rpm)$' || echo "No installer files found"
fi
echo ""

# Summary
echo "======================================"
echo -e "${GREEN}✓ Build verification complete!${NC}"
echo "======================================"
echo ""
echo "Deliverables:"
echo "1. React build: build/ directory"
echo "2. Electron installer(s): dist/ directory"
echo ""
echo "Next steps:"
echo "1. Test the installer by running it"
echo "2. Verify the app launches without errors"
echo "3. Test API connectivity in production mode"
echo ""

exit 0
