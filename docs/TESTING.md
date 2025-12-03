# Sanctions Check - Testing Guide

This document provides comprehensive testing procedures for the Sanctions Check Electron desktop application.

## Prerequisites

- Node.js 16+ and npm installed
- For Windows builds: Windows 10+ development machine
- Backend API running (local or Railway)
- Test data: Sample CSV file for bulk screening

## 1. Development Mode Testing

### Setup
```bash
cd frontend
npm install
```

### Test Development Mode
```bash
npm run electron:dev
```

**Expected Results:**
- React dev server starts on http://localhost:3000
- Electron window opens automatically
- DevTools are enabled
- Window shows "Sanctions Check" title
- Health check indicator shows green (if backend is running)

**Test Cases:**
- [ ] Window opens with correct size (1400x900)
- [ ] Window can be resized (minimum 800x600)
- [ ] Window has correct background color (#1a1a2e)
- [ ] Menu bar is hidden
- [ ] DevTools are accessible
- [ ] Hot reload works when editing React components

**API Connectivity Testing:**
- [ ] Verify connection to http://localhost:8000 backend
- [ ] Health check passes
- [ ] Individual screening works
- [ ] Bulk CSV screening works
- [ ] Results download (CSV, JSON, HTML)

## 2. Production Build Testing

### Build the Installer

**Linux:**
```bash
cd frontend
npm run electron:build:linux
```

**Windows (on Windows machine):**
```bash
cd frontend
npm run electron:build:win
```

**macOS (on Mac):**
```bash
cd frontend
npm run electron:build:mac
```

### Expected Outputs

**Linux:**
- `dist/Sanctions Check-1.0.0.AppImage` (~136MB)
- Executable permission set automatically

**Windows:**
- `dist/Sanctions Check Setup 1.0.0.exe` (NSIS installer)
- User can choose installation directory
- Creates desktop and start menu shortcuts

**macOS:**
- `dist/Sanctions Check-1.0.0.dmg`
- Drag-and-drop installer

## 3. Installer Testing

### Windows Installer (.exe)

**Installation Testing:**
1. Run the installer
   - [ ] Installer launches without errors
   - [ ] License agreement displays (if configured)
   - [ ] User can choose installation directory
   - [ ] Installation progress shows correctly
   - [ ] Completes without errors

2. Post-Installation Checks
   - [ ] Desktop shortcut created
   - [ ] Start Menu entry created
   - [ ] Application files in Program Files
   - [ ] Registry entries created (if applicable)

3. Application Launch
   - [ ] Launch from desktop shortcut
   - [ ] Launch from Start Menu
   - [ ] Application window opens
   - [ ] No console window visible (production build)

**Functional Testing:**
- [ ] Health check connects to Railway backend
- [ ] Individual screening works
- [ ] Bulk CSV upload works
- [ ] Results download correctly
- [ ] Reports generate properly (HTML, CSV, JSON)
- [ ] Window state persists (size, position)

**Uninstaller Testing:**
1. Run uninstaller from Control Panel or Start Menu
   - [ ] Uninstaller launches
   - [ ] All files removed
   - [ ] Shortcuts removed
   - [ ] Registry entries cleaned (if applicable)
   - [ ] User data preserved (if configured)

### Linux AppImage

**Installation Testing:**
1. Make executable: `chmod +x "Sanctions Check-1.0.0.AppImage"`
2. Run: `./Sanctions\ Check-1.0.0.AppImage`
   - [ ] Application launches without errors
   - [ ] Window opens correctly
   - [ ] Icon displays in taskbar

**Functional Testing:**
- [ ] All features work as expected
- [ ] Railway backend connection works
- [ ] File system access works (CSV upload/download)

### macOS DMG

**Installation Testing:**
1. Open DMG file
2. Drag app to Applications folder
3. Launch from Applications
   - [ ] Application launches
   - [ ] Gatekeeper warning (unsigned app)
   - [ ] Can be opened after security approval

**Functional Testing:**
- [ ] All features work as expected
- [ ] Railway backend connection works

## 4. Automated Testing

### Build Verification Script

```bash
cd frontend
../scripts/verify-build.sh
```

**Expected Output:**
```
======================================
Sanctions Check - Build Verification
======================================

Step 1: Cleaning previous builds...
✓ Clean complete

Step 2: Building React application...
✓ React build successful

Step 3: Verifying build directory...
✓ Build directory exists (1.1M)

Step 4: Building Electron installer...
✓ Electron build successful

Step 5: Verifying installer output...
✓ Linux installer found: 136M

Step 6: Generated files:
[list of generated files]

======================================
✓ Build verification complete!
======================================
```

## 5. Security Testing

### Security Configuration Checks

**Electron Security Settings:**
- [ ] `contextIsolation: true` ✓
- [ ] `nodeIntegration: false` ✓
- [ ] Preload script used ✓
- [ ] No remote module enabled ✓
- [ ] Navigation blocked to external URLs ✓
- [ ] New window creation blocked ✓

### Manual Security Tests

1. **Navigation Protection:**
   - Try navigating to external URL
   - Expected: Navigation blocked, logged to console

2. **New Window Protection:**
   - Try opening new window (target="_blank")
   - Expected: Window creation denied

3. **API Security:**
   - Verify HTTPS used for Railway API
   - Check CORS configuration
   - Verify no sensitive data in logs

## 6. Performance Testing

### Load Testing
- [ ] Upload large CSV (1000+ rows)
- [ ] Measure processing time
- [ ] Check memory usage
- [ ] Verify no memory leaks

### Stress Testing
- [ ] Multiple bulk screenings in succession
- [ ] Concurrent operations
- [ ] Application remains responsive

## 7. Cross-Platform Testing

### Windows
- [ ] Windows 10 (64-bit)
- [ ] Windows 11 (64-bit)

### Linux
- [ ] Ubuntu 20.04+
- [ ] Fedora
- [ ] Debian

### macOS
- [ ] macOS 11 (Big Sur)+
- [ ] Apple Silicon (M1/M2)
- [ ] Intel processors

## 8. User Acceptance Testing

### User Scenarios

**Scenario 1: Individual Screening**
1. Launch application
2. Navigate to Individual tab
3. Enter person details
4. Submit screening
5. Review results
6. Download report

**Scenario 2: Bulk Screening**
1. Launch application
2. Navigate to Bulk tab
3. Download CSV template
4. Fill template with data
5. Upload CSV
6. Wait for processing
7. Review results
8. Download full report

## 9. Known Issues and Limitations

### Current Limitations:
- Icon is placeholder (needs professional design)
- macOS builds require Apple Developer certificate for notarization
- Windows builds are unsigned (users will see SmartScreen warning)

### Workarounds:
- Users can bypass SmartScreen by clicking "More info" → "Run anyway"
- macOS users: Right-click → Open (first launch only)

## 10. Regression Testing Checklist

Before each release, verify:
- [ ] All build targets compile successfully
- [ ] Installers generate correctly
- [ ] Application launches on all platforms
- [ ] API connectivity works (dev and production)
- [ ] All core features functional
- [ ] No console errors
- [ ] Reports generate correctly
- [ ] CSV upload/download works
- [ ] Window sizing and state persistence works

## 11. Test Data

### Sample CSV for Bulk Screening
```csv
nombre,cedula,pais,fecha_nacimiento,nacionalidad
Juan Pérez,8-888-8888,PA,1985-03-15,PA
María López,9-999-9999,CO,1990-07-22,VE
```

### Test API Endpoints
- Development: http://localhost:8000
- Production: https://your-backend.up.railway.app

## Test Reporting

Document test results in this format:

**Date:** [Date]
**Tester:** [Name]
**Platform:** [Windows/Linux/macOS]
**Version:** 1.0.0
**Backend:** [Local/Railway]

**Results:**
- Pass: [count]
- Fail: [count]
- Blocked: [count]

**Failed Tests:**
1. [Test name] - [Description of failure]

**Notes:**
[Any additional observations]

---

For issues or questions, refer to the main README.md or create an issue on GitHub.
