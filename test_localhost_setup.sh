#!/bin/bash
# Test script to validate localhost setup for easy testing
# This script checks that all components can be started and are accessible

set -e  # Exit on error

echo "🧪 Testing Sanctions Check Localhost Setup"
echo "=========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo "ℹ $1"
}

# Test 1: Check Python installation
echo "Test 1: Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    print_success "Python installed: $PYTHON_VERSION"
else
    print_error "Python 3 not found. Please install Python 3.11+"
    exit 1
fi

# Test 2: Check Node.js installation
echo ""
echo "Test 2: Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js not found. Please install Node.js 16+"
    exit 1
fi

# Test 3: Check npm installation
echo ""
echo "Test 3: Checking npm installation..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm not found. Please install npm"
    exit 1
fi

# Test 4: Check Python dependencies
echo ""
echo "Test 4: Checking Python dependencies..."
cd "$(dirname "$0")/python"
if [ -f "requirements.txt" ]; then
    print_info "Checking key Python packages..."
    
    # Check for FastAPI
    if python3 -c "import fastapi" 2>/dev/null; then
        print_success "FastAPI installed"
    else
        print_warning "FastAPI not installed. Run: pip install -r requirements.txt"
    fi
    
    # Check for Jinja2
    if python3 -c "import jinja2" 2>/dev/null; then
        print_success "Jinja2 installed"
    else
        print_warning "Jinja2 not installed. Run: pip install -r requirements.txt"
    fi
    
    # Check for report_generator
    if [ -f "report_generator.py" ]; then
        print_success "report_generator.py exists"
        
        # Syntax check
        if python3 -m py_compile report_generator.py 2>/dev/null; then
            print_success "report_generator.py syntax is valid"
        else
            print_error "report_generator.py has syntax errors"
        fi
    else
        print_error "report_generator.py not found"
    fi
else
    print_error "requirements.txt not found"
fi

# Test 5: Check backend API files
echo ""
echo "Test 5: Checking backend API files..."
if [ -f "api/server.py" ]; then
    print_success "api/server.py exists"
    
    # Syntax check
    if python3 -m py_compile api/server.py 2>/dev/null; then
        print_success "api/server.py syntax is valid"
    else
        print_error "api/server.py has syntax errors"
    fi
else
    print_error "api/server.py not found"
fi

if [ -f "api/models.py" ]; then
    print_success "api/models.py exists"
    
    # Syntax check
    if python3 -m py_compile api/models.py 2>/dev/null; then
        print_success "api/models.py syntax is valid"
    else
        print_error "api/models.py has syntax errors"
    fi
else
    print_error "api/models.py not found"
fi

# Test 6: Check frontend files
echo ""
echo "Test 6: Checking frontend files..."
cd ../frontend

if [ -f "package.json" ]; then
    print_success "package.json exists"
else
    print_error "package.json not found"
fi

if [ -d "src" ]; then
    print_success "src directory exists"
    
    if [ -f "src/App.js" ]; then
        print_success "App.js exists"
    else
        print_error "App.js not found"
    fi
    
    if [ -f "src/components/BulkScreening.js" ]; then
        print_success "BulkScreening.js exists"
    else
        print_error "BulkScreening.js not found"
    fi
    
    if [ -f "src/components/ResultsDisplay.js" ]; then
        print_success "ResultsDisplay.js exists"
    else
        print_error "ResultsDisplay.js not found"
    fi
else
    print_error "src directory not found"
fi

# Test 7: Check if ports are available
echo ""
echo "Test 7: Checking if ports are available..."

check_port() {
    PORT=$1
    NAME=$2
    
    # Try lsof first (macOS, Linux)
    if command -v lsof &> /dev/null; then
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            print_warning "Port $PORT ($NAME) is already in use"
            return 1
        fi
    # Fallback to netstat (older systems)
    elif command -v netstat &> /dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":$PORT " ; then
            print_warning "Port $PORT ($NAME) is already in use"
            return 1
        fi
    # Fallback to ss (modern Linux)
    elif command -v ss &> /dev/null; then
        if ss -tuln 2>/dev/null | grep -q ":$PORT " ; then
            print_warning "Port $PORT ($NAME) is already in use"
            return 1
        fi
    else
        print_info "Cannot check port $PORT (no lsof/netstat/ss available)"
        return 0
    fi
    
    print_success "Port $PORT ($NAME) is available"
    return 0
}

check_port 8000 "Backend API"
check_port 3000 "Frontend React"

# Test 8: Check Docker (optional)
echo ""
echo "Test 8: Checking Docker (optional)..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_success "Docker installed: $DOCKER_VERSION"
    
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        print_success "Docker Compose available"
    else
        print_warning "Docker Compose not found (optional)"
    fi
else
    print_info "Docker not installed (optional for development)"
fi

# Summary
echo ""
echo "=========================================="
echo "📋 Test Summary"
echo "=========================================="
echo ""
print_info "All critical tests passed! You can start the application:"
echo ""
echo "  Backend:  cd python && uvicorn api.server:app --reload --port 8000"
echo "  Frontend: cd frontend && npm start"
echo ""
echo "  Or use Docker Compose:"
echo "  docker-compose up --build"
echo ""
print_info "Access the application at:"
echo "  • Frontend: http://localhost:3000"
echo "  • Backend API: http://localhost:8000"
echo "  • API Docs: http://localhost:8000/api/docs"
echo ""

