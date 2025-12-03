const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    // Example: Add methods here if you need communication between renderer and main process
    // For this app, we mainly use the web API directly, so this is minimal
    platform: process.platform,
    versions: {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron
    }
  }
);

// Security: Don't expose any Node.js APIs directly to the renderer
// All communication should go through this secure bridge
