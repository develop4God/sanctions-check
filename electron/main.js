const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window with security settings
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
    icon: path.join(__dirname, '../frontend/public/icon.png')
  });

  // Load the app
  if (isDev) {
    // Development mode - load from React dev server
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load from build folder
    mainWindow.loadFile(path.join(__dirname, '../frontend/build/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle navigation attempts
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow navigation within the app
    if (isDev && parsedUrl.origin === 'http://localhost:3000') {
      return;
    }
    
    // Prevent navigation to external URLs (security)
    event.preventDefault();
    console.log('Navigation blocked to:', navigationUrl);
  });

  // Handle new window requests
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Block opening new windows (security)
    console.log('Blocked new window to:', url);
    return { action: 'deny' };
  });
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
