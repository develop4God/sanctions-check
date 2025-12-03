#!/usr/bin/env node
/**
 * Service Worker Environment Injector
 * Injects environment-specific configuration into service worker during build
 */

const fs = require('fs');
const path = require('path');

// Read service worker file from build directory
const buildSwPath = path.join(__dirname, '../frontend/build/service-worker.js');

// Check if build directory exists
if (!fs.existsSync(buildSwPath)) {
  console.error('[SW Injector] ERROR: Build service worker not found at:', buildSwPath);
  console.error('[SW Injector] Make sure to run this after copying service-worker.js to build/');
  process.exit(1);
}

const swContent = fs.readFileSync(buildSwPath, 'utf8');

// Get environment variables
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

console.log('[SW Injector] Injecting environment variables...');
console.log(`[SW Injector] API URL: ${apiUrl}`);

// Replace placeholders with actual values
let injectedContent = swContent.replace(
  /__REACT_APP_API_URL__/g,
  apiUrl
);

// Write back to build directory
fs.writeFileSync(buildSwPath, injectedContent);

console.log('[SW Injector] ✓ Service worker environment variables injected successfully');
