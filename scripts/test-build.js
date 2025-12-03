const fs = require('fs');
const path = require('path');

console.log('=================================');
console.log('Testing build output...');
console.log('=================================\n');

const checks = [
  { file: 'build/index.html', name: 'HTML entry point' },
  { file: 'build/manifest.json', name: 'PWA manifest' },
  { file: 'build/service-worker.js', name: 'Service Worker' },
  { file: 'build/static/js', name: 'JavaScript bundle', isDir: true },
  { file: 'build/static/css', name: 'CSS bundle', isDir: true }
];

let failed = false;

checks.forEach(check => {
  const fullPath = path.join(__dirname, '..', 'frontend', check.file);
  
  let exists = false;
  if (check.isDir) {
    exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  } else {
    exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
  }
  
  if (exists) {
    console.log(`✓ ${check.name}`);
  } else {
    console.error(`✗ ${check.name} - MISSING!`);
    failed = true;
  }
});

console.log('\n=================================');
if (failed) {
  console.error('✗ Build validation FAILED');
  console.log('=================================\n');
  process.exit(1);
} else {
  console.log('✓ Build validation PASSED');
  console.log('=================================\n');
  process.exit(0);
}
