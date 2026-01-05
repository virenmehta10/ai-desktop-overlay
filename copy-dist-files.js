const fs = require('fs');
const path = require('path');

// This script verifies the build folder exists before packaging

const sourceBuildDir = path.join(process.cwd(), 'build');

if (!fs.existsSync(sourceBuildDir)) {
  console.error('❌ Error: build folder not found. Run "npm run build:prod" first.');
  process.exit(1);
}

// Check that the built files exist
const indexHtml = path.join(sourceBuildDir, 'index.html');
const assetsDir = path.join(sourceBuildDir, 'assets');

if (!fs.existsSync(indexHtml)) {
  console.error('❌ Error: build/index.html not found. Build may have failed.');
  process.exit(1);
}

if (!fs.existsSync(assetsDir)) {
  console.warn('⚠️  Warning: build/assets folder not found. Assets may not load correctly.');
} else {
  console.log('✅ Found build/assets folder');
}

console.log('✅ build folder is ready for packaging');
console.log('   electron-packager will automatically include the build/ folder in the packaged app');
