const fs = require('fs');
const path = require('path');

// Check if .env exists
if (!fs.existsSync('.env')) {
  console.error('❌ Error: .env file not found in project root');
  console.error('   Please create a .env file with your OPENAI_API_KEY before packaging');
  process.exit(1);
}

// Check if build folder exists (built files)
if (!fs.existsSync('build/index.html')) {
  console.error('❌ Error: build folder not found. Run "npm run build:prod" first.');
  process.exit(1);
}

// Copy .env file to packaged app directories
// electron-packager includes the dist/ folder automatically, so we just need to copy .env
const platforms = ['darwin-x64', 'win32-x64'];

platforms.forEach(platform => {
  const distDir = path.join('dist', `ai-overlay-${platform}`);
  
  if (fs.existsSync(distDir)) {
    if (platform === 'darwin-x64') {
      // macOS: .app/Contents/Resources/app/
      const appResourcesDir = path.join(distDir, 'ai-overlay.app', 'Contents', 'Resources', 'app');
      
      if (fs.existsSync(appResourcesDir)) {
        fs.copyFileSync('.env', path.join(appResourcesDir, '.env'));
        console.log(`✅ Copied .env to macOS app at: ${appResourcesDir}`);
        
        // Verify build folder exists (electron-packager should have included it)
        const buildPath = path.join(appResourcesDir, 'build', 'index.html');
        if (fs.existsSync(buildPath)) {
          console.log(`✅ Verified build folder exists in packaged app`);
        } else {
          console.warn(`⚠️  Warning: build folder not found in packaged app at: ${path.join(appResourcesDir, 'build')}`);
          console.warn(`   This might cause the UI not to load. Check that electron-packager is including the build folder.`);
        }
      } else {
        console.error(`❌ Error: Could not find app resources directory: ${appResourcesDir}`);
      }
    } else if (platform === 'win32-x64') {
      // Windows: resources/app/
      const appDir = path.join(distDir, 'resources', 'app');
      
      if (fs.existsSync(appDir)) {
        fs.copyFileSync('.env', path.join(appDir, '.env'));
        console.log(`✅ Copied .env to Windows app at: ${appDir}`);
        
        // Verify build folder exists
        const buildPath = path.join(appDir, 'build', 'index.html');
        if (fs.existsSync(buildPath)) {
          console.log(`✅ Verified build folder exists in packaged app`);
        } else {
          console.warn(`⚠️  Warning: build folder not found in packaged app at: ${path.join(appDir, 'build')}`);
          console.warn(`   This might cause the UI not to load. Check that electron-packager is including the build folder.`);
        }
      } else {
        console.error(`❌ Error: Could not find app directory: ${appDir}`);
      }
    }
  } else {
    console.log(`⚠️  Skipping ${platform} - directory not found: ${distDir}`);
  }
});

console.log('✅ File copying complete!');
