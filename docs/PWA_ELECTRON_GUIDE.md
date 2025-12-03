# PWA + Electron Dual Strategy - Complete Guide

## Architecture Overview

```
Sanctions Check
├── Web + PWA (Railway) → All users, instant updates, installable
│   ├── manifest.json - PWA configuration
│   ├── service-worker.js - Caching and offline support
│   └── InstallPWA component - Custom install prompt
└── Desktop (Electron) → Enterprise users, offline-first, native feel
    ├── .env.electron - Desktop-specific configuration
    ├── electron/main.js - Main process
    └── electron/preload.js - Security bridge
```

**Shared Foundation:** Both platforms use the same React codebase, ensuring feature parity and simplified maintenance.

## 1. Environment Configuration

### 1.1 Electron Environment (.env.electron)

**Location:** `frontend/.env.electron`

```env
REACT_APP_API_URL=https://your-backend.up.railway.app
REACT_APP_VERSION=1.0.0
REACT_APP_PLATFORM=desktop
```

**⚠️ IMPORTANT:** Update `REACT_APP_API_URL` with your actual Railway backend URL before building desktop installers.

### 1.2 Web/PWA Environment

**Development:** `frontend/.env.development`
```env
REACT_APP_API_URL=http://localhost:8000
```

**Production:** `frontend/.env.production`
```env
REACT_APP_API_URL=https://your-backend.up.railway.app
REACT_APP_VERSION=1.0.0
REACT_APP_PLATFORM=web
```

### 1.3 Environment Validation

The build verification script automatically checks that the Electron environment is configured:

```bash
cd frontend
../scripts/verify-build.sh
```

Will fail with error if `.env.electron` contains placeholder URL.

## 2. Platform Detection

### 2.1 Platform Utilities

**File:** `frontend/src/utils/platform.js`

```javascript
import { isElectron, isPWA, getPlatform } from './utils/platform';

// Check platform
if (isElectron()) {
  console.log('Running as Electron desktop app');
} else if (isPWA()) {
  console.log('Running as installed PWA');
} else {
  console.log('Running as web app');
}

// Get platform identifier
const platform = getPlatform(); // Returns: 'DESKTOP', 'PWA', or 'WEB'
```

### 2.2 Platform Badge

The header displays a platform badge showing the current runtime environment:
- **DESKTOP** - Running in Electron
- **PWA** - Installed as Progressive Web App
- **WEB** - Running in browser

### 2.3 Version Display

App version is displayed in the footer, sourced from `package.json` or environment variable.

## 3. PWA Implementation

### 3.1 Manifest Configuration

**File:** `frontend/public/manifest.json`

```json
{
  "short_name": "Sanctions Check",
  "name": "Sanctions Check - Professional Sanctions Screening",
  "icons": [
    {
      "src": "icon.png",
      "sizes": "256x256",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#16213e",
  "background_color": "#1a1a2e"
}
```

**Key Settings:**
- `display: "standalone"` - Hides browser UI when installed
- `theme_color` - Matches app design (#16213e)
- `start_url: "."` - Relative path for flexibility

### 3.2 Service Worker Strategy

**File:** `frontend/public/service-worker.js`

**Caching Strategy:**

1. **Network First for API Calls:**
   - Always tries network first
   - Falls back to cache if offline
   - Ensures fresh data when online

2. **Cache First for Static Assets:**
   - Serves from cache immediately
   - Updates cache in background
   - Fast loading, always up-to-date

**Cache Version:** `sanctions-check-v1.0.0`

When updating the app, increment this version to invalidate old caches.

### 3.3 Install Prompt Component

**File:** `frontend/src/components/InstallPWA.js`

**Features:**
- Listens for `beforeinstallprompt` event
- Custom styled banner (not browser default)
- Install and Dismiss buttons
- Auto-hides if already installed or dismissed
- Session-based dismissal (shows again on new session)

**Browser Support:**
- ✅ Chrome Desktop - Full support
- ✅ Chrome Android - Full support
- ✅ Edge Desktop - Full support
- ⚠️ Safari iOS - No install prompt (manual install only)
- ⚠️ Firefox - Limited support

### 3.4 Service Worker Registration

**File:** `frontend/src/index.js`

Service worker is registered on app load and checks for updates every 60 seconds.

```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60000);
      });
  });
}
```

## 4. Build System

### 4.1 Web/PWA Build

```bash
cd frontend
npm run build
```

**Output:**
- `build/` directory with optimized React app
- `build/service-worker.js` - Copied automatically
- `build/manifest.json` - Included in build
- Total size: ~1.1MB (gzipped)

### 4.2 Electron Build

```bash
cd frontend

# Build for current platform
npm run electron:build

# Build for specific platforms
npm run electron:build:win    # Windows NSIS installer
npm run electron:build:mac    # macOS DMG
npm run electron:build:linux  # Linux AppImage
```

**Process:**
1. Loads environment from `.env.electron`
2. Builds React app with Electron-specific config
3. Copies service worker to build
4. Packages with Electron Builder
5. Generates platform-specific installer

**Output:**
- Windows: `dist/Sanctions Check Setup 1.0.0.exe` (~136MB)
- macOS: `dist/Sanctions Check-1.0.0.dmg`
- Linux: `dist/Sanctions Check-1.0.0.AppImage` (136MB)

### 4.3 Build Verification

```bash
cd frontend
../scripts/verify-build.sh
```

**Checks:**
1. ✅ Clean previous builds
2. ✅ Build React app
3. ✅ **Validate Electron environment** (new)
4. ✅ Verify build directory
5. ✅ Build Electron installer
6. ✅ Verify installer output
7. ✅ Report file sizes

## 5. User Installation Flows

### 5.1 PWA Installation - Chrome/Edge Desktop

1. User visits https://your-app.up.railway.app
2. Banner appears: "Install Sanctions Check"
3. User clicks "Install"
4. App installs, icon appears in taskbar/dock
5. Launches in standalone window (no browser UI)

**Alternative:** Browser address bar shows ⊕ install icon

### 5.2 PWA Installation - Chrome Android

1. User visits app on mobile
2. Bottom banner: "Add Sanctions Check to Home screen"
3. User taps banner
4. Icon appears on home screen
5. Launches like native app

### 5.3 PWA Installation - Safari iOS

1. User visits app
2. Tap Share button (⬆️)
3. Select "Add to Home Screen"
4. App appears on springboard
5. Launches in standalone mode

**Note:** No automatic install prompt on iOS (manual only)

### 5.4 Electron Installation - Windows

1. Download `Sanctions Check Setup 1.0.0.exe`
2. Run installer
3. Choose installation directory (optional)
4. Creates desktop and start menu shortcuts
5. Launch from shortcut

**SmartScreen Warning:** Expected for unsigned apps
- Click "More info" → "Run anyway"

### 5.5 Electron Installation - Linux

```bash
# Make executable
chmod +x "Sanctions Check-1.0.0.AppImage"

# Run
./Sanctions\ Check-1.0.0.AppImage
```

**No installation required** - AppImage is self-contained

### 5.6 Electron Installation - macOS

1. Open `Sanctions Check-1.0.0.dmg`
2. Drag app to Applications folder
3. Launch from Applications
4. **Gatekeeper warning:** Right-click → Open (first launch only)

## 6. Offline Behavior

### 6.1 PWA Offline Mode

**First Visit (Online):**
1. App loads from server
2. Service worker installs
3. Static assets cached
4. User performs screening

**Subsequent Visit (Offline):**
1. App shell loads from cache (instant)
2. Static content displays
3. API calls fail gracefully with "No connection" message
4. Previous results visible (if cached)

**Reconnection:**
- Automatic detection when network restored
- API calls resume without app restart

### 6.2 Electron Offline Behavior

**Electron apps have full access to local storage:**
- Can implement local database (future enhancement)
- Currently requires network for API calls
- Same graceful error handling as PWA

## 7. Update Strategies

### 7.1 PWA Updates

**Process:**
1. New version deployed to Railway
2. User opens app
3. Service worker detects new files
4. Downloads in background
5. **Next app restart:** New version loads

**Update Prompt (Optional):**
```javascript
// Listen for service worker updates
registration.addEventListener('updatefound', () => {
  // Show "Update available" banner
  // Prompt user to restart app
});
```

**Force Update:**
- User can hard refresh (Ctrl+Shift+R)
- Or unregister service worker in DevTools

### 7.2 Electron Updates

**Current (Manual):**
1. Download new `.exe`/`.AppImage`/`.dmg`
2. Uninstall old version
3. Install new version

**Future Enhancement:**
- Implement `electron-updater` for auto-updates
- Check for updates on app launch
- Download and install in background
- Prompt user to restart

## 8. Performance Metrics

### 8.1 Size Comparison

| Artifact | Size | Notes |
|----------|------|-------|
| PWA (first load) | ~2MB | Includes React bundle + assets |
| PWA (cached) | ~50KB | Only HTML reload |
| PWA (offline) | 0KB | Instant from cache |
| Electron AppImage | 136MB | Includes Chromium runtime |
| Electron Windows | ~136MB | NSIS installer |

### 8.2 Load Time Targets

**PWA:**
- First visit: < 3s (3G network)
- Cached visit: < 500ms
- Offline visit: < 100ms (instant)

**Electron:**
- Cold launch: < 2s
- Warm launch: < 1s

### 8.3 Lighthouse Scores (PWA)

**Target scores:**
- Performance: 90+
- Accessibility: 95+
- Best Practices: 90+
- SEO: 90+
- PWA: 100 ✅

**To test:**
```bash
npm install -g lighthouse
lighthouse https://your-app.up.railway.app --view
```

## 9. Testing Procedures

### 9.1 PWA Testing - Installation

**Chrome Desktop:**
1. Deploy to Railway (HTTPS required)
2. Visit site
3. Check for install banner
4. Click "Install"
5. Verify app opens in standalone window
6. Check taskbar icon appears
7. Close and relaunch - should remember state

**Chrome Android:**
1. Visit on mobile
2. Check for "Add to Home screen" banner
3. Install
4. Verify home screen icon
5. Launch - should be fullscreen
6. Test navigation (no browser back button)

**Safari iOS:**
1. Visit on iPhone
2. Tap Share → "Add to Home Screen"
3. Verify icon on springboard
4. Launch - should be standalone
5. Test touch interactions

### 9.2 PWA Testing - Offline Mode

**Test Sequence:**
1. Visit site online
2. Perform screening (ensures API cached if possible)
3. Open DevTools → Network → Offline checkbox
4. Reload app
5. ✅ App shell loads
6. ✅ UI displays correctly
7. Try screening → ❌ Shows "No connection" error
8. Disable Offline mode
9. ✅ API calls work immediately (no restart needed)

### 9.3 PWA Testing - Service Worker

**Chrome DevTools:**
1. F12 → Application tab → Service Workers
2. Verify "sanctions-check" worker is registered
3. Check "activated and running" status
4. Test "Update on reload" checkbox
5. Click "Unregister" to clear cache (for testing)

**Cache Inspection:**
1. Application → Cache Storage
2. Verify `sanctions-check-v1.0.0-static` exists
3. Check cached files (HTML, CSS, JS, images)
4. Verify `sanctions-check-v1.0.0-api` for API responses

### 9.4 Electron Testing

**Development Mode:**
```bash
cd frontend
npm run electron:dev
```

1. ✅ Window opens 1400x900
2. ✅ Platform badge shows "DESKTOP"
3. ✅ DevTools available (F12)
4. ✅ Hot reload works
5. ✅ API calls work
6. ✅ All features functional

**Production Build:**
```bash
npm run electron:build:linux
cd dist
./Sanctions\ Check-1.0.0.AppImage
```

1. ✅ Installs/launches without errors
2. ✅ Platform badge shows "DESKTOP"
3. ✅ No DevTools
4. ✅ Connects to Railway API
5. ✅ All features work
6. ✅ Window state persists

### 9.5 Cross-Platform Testing

**Priority Matrix:**

| Platform | Priority | Install Type | Testing Status |
|----------|----------|--------------|----------------|
| Chrome Desktop | P0 | PWA + Electron | ✅ Required |
| Chrome Android | P1 | PWA | ✅ Required |
| Windows 10/11 | P0 | Electron | ⏳ Windows build |
| Linux | P1 | Electron | ✅ Tested (AppImage) |
| macOS | P2 | Electron | ⏳ Requires Mac |
| Safari iOS | P2 | PWA (manual) | ⏳ iOS device |
| Edge Desktop | P2 | PWA | ✅ Chrome-based |

## 10. Deployment Checklist

### 10.1 Railway Deployment (PWA)

**Prerequisites:**
- [ ] Railway account connected to GitHub
- [ ] Backend deployed and URL known
- [ ] HTTPS enabled (automatic on Railway)

**Configuration:**
1. [ ] Update `frontend/.env.production` with Railway backend URL
2. [ ] Set Railway env var: `REACT_APP_API_URL=https://backend.up.railway.app`
3. [ ] Deploy frontend service
4. [ ] Generate domain for frontend

**Verification:**
1. [ ] Visit `https://your-app.up.railway.app`
2. [ ] Open DevTools → Application
3. [ ] Verify manifest.json loads (no errors)
4. [ ] Check Service Worker registers
5. [ ] Test install prompt appears
6. [ ] Perform test screening
7. [ ] Check Network tab - API calls succeed
8. [ ] Test offline mode (DevTools → Offline)

### 10.2 Electron Deployment (Desktop)

**Prerequisites:**
- [ ] Backend deployed to Railway with known URL
- [ ] Build machine ready (Windows for .exe, Linux for AppImage, Mac for .dmg)

**Configuration:**
1. [ ] Update `frontend/.env.electron` with Railway backend URL
2. [ ] Verify URL is NOT placeholder
3. [ ] Run `verify-build.sh` to validate

**Build:**
```bash
cd frontend

# Windows (on Windows machine)
npm run electron:build:win

# Linux (on Linux machine)
npm run electron:build:linux

# macOS (on Mac)
npm run electron:build:mac
```

**Testing:**
1. [ ] Install on clean test machine
2. [ ] Launch application
3. [ ] Verify platform badge shows "DESKTOP"
4. [ ] Test API connection to Railway
5. [ ] Perform screening tests
6. [ ] Check all features work
7. [ ] Test uninstaller

**Distribution:**
1. [ ] Upload installer to GitHub Releases
2. [ ] Document system requirements
3. [ ] Provide installation instructions
4. [ ] Link to Railway backend status page

## 11. Version Synchronization

### 11.1 Version Management

**Single Source of Truth:** `frontend/package.json`

```json
{
  "version": "1.0.0"
}
```

**Propagation:**
1. Update `package.json` version
2. Update `CACHE_NAME` in `service-worker.js`:
   ```javascript
   const CACHE_VERSION = 'sanctions-check-v1.0.0';
   ```
3. Update `.env.electron`:
   ```env
   REACT_APP_VERSION=1.0.0
   ```

### 11.2 Version Display

**Location:** Footer of app

**Source:**
- Environment variable: `process.env.REACT_APP_VERSION`
- Fallback: `1.0.0`

**Displays as:** "Verificación OFAC & ONU | v1.0.0"

### 11.3 Release Process

1. **Increment version** in `package.json`
2. **Update cache version** in `service-worker.js`
3. **Update .env files** if needed
4. **Build PWA:**
   ```bash
   npm run build
   # Deploy to Railway
   ```
5. **Build Electron:**
   ```bash
   npm run electron:build:win
   npm run electron:build:mac
   npm run electron:build:linux
   # Distribute installers
   ```
6. **Tag release** in Git:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## 12. Troubleshooting

### 12.1 PWA Issues

**Problem:** Install prompt not showing

**Solutions:**
- ✅ Verify HTTPS (required for PWA)
- ✅ Check manifest.json has no errors (DevTools → Application)
- ✅ Ensure not already installed
- ✅ iOS: No prompt available (manual install only)
- ✅ Try different browser

**Problem:** Service worker not updating

**Solutions:**
- Hard refresh: Ctrl+Shift+R
- DevTools → Application → Service Workers → "Unregister"
- Clear all site data
- Increment `CACHE_VERSION` in service-worker.js

**Problem:** App not working offline

**Solutions:**
- Check service worker registered (DevTools → Application)
- Verify cache populated (DevTools → Cache Storage)
- Check console for errors
- Ensure static assets in cache list

### 12.2 Electron Issues

**Problem:** Build fails

**Solutions:**
- Delete `node_modules` and reinstall
- Verify `.env.electron` exists
- Check disk space (500MB+ needed)
- Review error messages

**Problem:** App won't launch

**Solutions:**
- Check SmartScreen (Windows): "More info" → "Run anyway"
- Verify Gatekeeper (macOS): Right-click → Open
- Check permissions (Linux): `chmod +x *.AppImage`
- Review console logs

**Problem:** API connection fails

**Solutions:**
- Verify Railway backend is running
- Check `.env.electron` has correct URL
- Test URL in browser
- Check CORS settings on backend

### 12.3 Platform Detection Issues

**Problem:** Platform badge shows wrong platform

**Solutions:**
- PWA: Check if `display-mode: standalone` media query matches
- Electron: Verify `window.electron` is exposed in preload.js
- Clear browser cache
- Check DevTools console for errors

## 13. Future Enhancements

### 13.1 PWA Enhancements
- [ ] Background sync for offline submissions
- [ ] Push notifications for updates
- [ ] Share API integration
- [ ] Install prompt A/B testing
- [ ] Advanced caching strategies

### 13.2 Electron Enhancements
- [ ] Auto-updater (`electron-updater`)
- [ ] Local database (SQLite)
- [ ] Native notifications
- [ ] System tray integration
- [ ] Deep linking support

### 13.3 Shared Enhancements
- [ ] Analytics tracking by platform
- [ ] Feature flags per platform
- [ ] Platform-specific optimizations
- [ ] A/B testing framework
- [ ] Performance monitoring

## 14. Best Practices

### 14.1 Development
- ✅ Test in multiple browsers
- ✅ Use platform detection judiciously
- ✅ Keep service worker simple
- ✅ Version all caches
- ✅ Log platform in analytics

### 14.2 Deployment
- ✅ Always test on clean machines
- ✅ Validate environment before building
- ✅ Keep Electron and PWA in sync
- ✅ Document platform differences
- ✅ Monitor both platforms separately

### 14.3 Maintenance
- ✅ Update service worker cache version with each release
- ✅ Test both platforms before releasing
- ✅ Keep dependencies updated
- ✅ Monitor analytics for platform usage
- ✅ Gather feedback from both user types

---

## Quick Reference

### Build Commands
```bash
# PWA (Web)
npm run build

# Electron Desktop
npm run electron:build        # Current platform
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux

# Development
npm start                      # React dev server
npm run electron:dev           # Electron dev mode
```

### File Locations
- PWA Manifest: `frontend/public/manifest.json`
- Service Worker: `frontend/public/service-worker.js`
- Platform Utils: `frontend/src/utils/platform.js`
- Install Component: `frontend/src/components/InstallPWA.js`
- Electron Config: `frontend/.env.electron`

### Key URLs
- PWA: `https://your-app.up.railway.app`
- Backend API: `https://backend.up.railway.app`
- GitHub Releases: For Electron installers

---

**Version:** 1.0.0
**Last Updated:** December 3, 2024
**Maintained By:** Sanctions Check Team
