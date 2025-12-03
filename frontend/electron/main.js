const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const windowStateKeeper = require('electron-window-state');
const isDev = process.env.NODE_ENV === 'development';

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  try {
    // Load window state (position and size)
    let mainWindowState = windowStateKeeper({
      defaultWidth: 1400,
      defaultHeight: 900
    });

    // Create the browser window with saved state
    mainWindow = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#1a1a2e',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload.js')
      },
      // Modern window style
      autoHideMenuBar: true,
      icon: path.join(__dirname, '../public/icon.png')
    });

    // Let windowStateKeeper manage the window state
    mainWindowState.manage(mainWindow);

  // Load the app
  if (isDev) {
    // Development mode - load from React dev server
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load from build folder
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle navigation attempts with whitelist
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Whitelist allowed origins
    const allowedOrigins = [
      'http://localhost:3000',  // Dev server
      process.env.REACT_APP_API_URL || 'https://your-backend.up.railway.app'
    ].filter(Boolean);
    
    // Allow file:// protocol in production (for loading app resources)
    if (!isDev && parsedUrl.protocol === 'file:') {
      return;
    }
    
    // Allow navigation within dev server
    if (isDev && parsedUrl.origin === 'http://localhost:3000') {
      return;
    }
    
    // Check if origin is in whitelist
    const isAllowed = allowedOrigins.some(origin => {
      try {
        const allowedUrl = new URL(origin);
        return parsedUrl.origin === allowedUrl.origin;
      } catch {
        return false;
      }
    });
    
    if (!isAllowed) {
      event.preventDefault();
      console.warn('[Security] Blocked navigation to:', navigationUrl);
    }
  });

  // Handle new window requests
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Block opening new windows (security)
    console.log('Blocked new window to:', url);
    return { action: 'deny' };
  });
  } catch (error) {
    console.error('[Electron] Failed to create window:', error);
    
    // Show error dialog to user
    dialog.showErrorBox(
      'Application Error',
      `Failed to start Sanctions Check:\n\n${error.message}\n\nThe application will now close.`
    );
    
    // Clean up and exit
    mainWindow = null;
    app.quit();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, applications stay active until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked and no windows are open
  if (mainWindow === null) {
    createWindow();
  }
});

// Security: Disable GPU acceleration if needed
// app.disableHardwareAcceleration();

// Log any unhandled errors
process.on('uncaughtException', (error) => {
  console.error('Unhandled exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
