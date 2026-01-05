const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
// Check if we're in development mode
// In packaged apps, app.isPackaged will be true
// In dev mode, we're running from source and app.isPackaged will be false
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const browserService = require('./src/services/browser-service');
const screenCaptureService = require('./src/services/screen-capture');
const speechRecognitionService = require('./src/services/speech-recognition');

let mainWindow = null;
let serverProcess = null;
let ipcHandlersRegistered = false;
let isCreatingWindow = false;
let windowCreated = false;
let activateHandlerRegistered = false;
let appInitialized = false; // Prevent multiple initializations

// Register all IPC handlers once
function registerIpcHandlers() {
  if (ipcHandlersRegistered) {
    return; // Already registered
  }
  
  // Handle screen capture
  ipcMain.handle('CAPTURE_SCREEN', async () => {
    return screenCaptureService.getLastCapture();
  });

  // Toggle click-through from renderer
  ipcMain.on('SET_CLICK_THROUGH', (_event, ignore) => {
    try {
      if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
      }
    } catch (e) {
      console.error('Failed to set click-through:', e);
    }
  });

  // User activity hint (pause/resume background capture)
  ipcMain.handle('SET_USER_ACTIVE', async (_e, active) => {
    try {
      screenCaptureService.setUserActive(!!active);
      return true;
    } catch (e) {
      console.error('Failed to set user active:', e);
      return false;
    }
  });

  // Handle getting browser tabs
  ipcMain.handle('GET_CURRENT_TABS', async () => {
    try {
      const browserService = require('./src/services/browser-service');
      const tabs = await browserService.getCurrentTabs();
      return tabs;
    } catch (error) {
      console.error('Error getting tabs:', error);
      return [];
    }
  });

  // Handle suggesting tab groups
  ipcMain.handle('SUGGEST_TAB_GROUPS', async (event, tabs) => {
    try {
      const browserService = require('./src/services/browser-service');
      const groups = await browserService.suggestTabGroups(tabs);
      return groups;
    } catch (error) {
      console.error('Error suggesting tab groups:', error);
      throw error;
    }
  });

  // Handle creating tab groups
  ipcMain.handle('CREATE_TAB_GROUP', async (event, browser, groupName, tabs) => {
    try {
      const browserService = require('./src/services/browser-service');
      await browserService.createTabGroup(browser, groupName, tabs);
      return { success: true };
    } catch (error) {
      console.error('Error creating tab group:', error);
      throw error;
    }
  });

  // Handle quitting the app
  ipcMain.on('APP_QUIT', () => {
    app.quit();
  });

  // Handle pasting text to Google Docs (focus editor reliably)
  ipcMain.handle('PASTE_TO_GOOGLE_DOC', async (event, outline) => {
    try {
      console.log('Attempting to paste research outline to Google Docs...');
      
      // Create a temporary file with the outline content
      const tempFile = path.join(os.tmpdir(), `research-outline-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, outline);
      
      // Copy content to clipboard first
      await new Promise((resolve, reject) => {
        exec(`pbcopy < "${tempFile}"`, (error) => {
          if (error) {
            console.error('Failed to copy to clipboard:', error);
            reject(new Error(`Failed to copy to clipboard: ${error.message}`));
            return;
          }
          console.log('Content copied to clipboard successfully');
          resolve();
        });
      });
      
      // Wait a moment to ensure clipboard is populated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Focus Chrome, try to focus Docs editor via JS, then click center and paste via Cmd+V
      const focusAndPasteScript = `
        set foundDoc to false
        set targetWindowIndex to 1
        tell application "Google Chrome"
          activate
          delay 0.6
          try
            set winList to every window
            set idx to 1
            repeat with w in winList
              try
                set tabList to every tab of w
                repeat with t in tabList
                  if (URL of t contains "docs.google.com/document") then
                    set active tab of w to t
                    set index of w to 1
                    set foundDoc to true
                    set targetWindowIndex to 1
                    exit repeat
                  end if
                end repeat
                if foundDoc then exit repeat
              end try
              set idx to idx + 1
            end repeat
          end try
        end tell

        tell application "System Events"
          delay 0.25
          tell process "Google Chrome"
            set frontmost to true
            try
              set win to front window
              set {wx, wy} to position of win
              set {ww, wh} to size of win
              set cx to wx + (ww / 2)
              set cy to wy + (wh / 2)
              -- click into the canvas to ensure caret is in editor
              click at {cx, cy}
              delay 0.2
              -- paste via Cmd+V
              keystroke "v" using {command down}
            end try
          end tell
        end tell
      `;
      
      exec(`osascript -e '${focusAndPasteScript}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('Failed to paste to Google Docs:', error);
          console.error('stderr:', stderr);
        } else {
          console.log('Successfully pasted to Google Docs');
        }
      });
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error pasting to Google Docs:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle detecting email thread
  ipcMain.handle('DETECT_EMAIL_THREAD', async () => {
    try {
      const emailService = require('./src/services/email-service');
      const thread = await emailService.detectEmailThread();
      return { success: true, thread };
    } catch (error) {
      console.error('Failed to detect email thread:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle mouse movement
  ipcMain.handle('MOVE_MOUSE_TO', async (event, { x, y }) => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve, reject) => {
        exec(`osascript -e 'tell application "System Events" to set position of mouse to {${x}, ${y}}'`, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (error) {
      console.error('Failed to move mouse:', error);
      throw error;
    }
  });

  // Handle clicking at coordinates
  ipcMain.handle('CLICK_AT', async (event, { x, y }) => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve, reject) => {
        exec(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (error) {
      console.error('Failed to click:', error);
      throw error;
    }
  });

  // Handle typing text
  ipcMain.handle('TYPE_TEXT', async (event, { text }) => {
    try {
      const { exec } = require('child_process');
      // Escape special characters for AppleScript
      const escapedText = text.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
      return new Promise((resolve, reject) => {
        exec(`osascript -e 'tell application "System Events" to keystroke "${escapedText}"'`, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (error) {
      console.error('Failed to type text:', error);
      throw error;
    }
  });

  // Handle pasting from clipboard
  ipcMain.handle('PASTE_FROM_CLIPBOARD', async (event) => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve, reject) => {
        exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
      throw error;
    }
  });

  // Handle generating email response
  ipcMain.handle('GENERATE_EMAIL_RESPONSE', async (event, { emailContent, context, tone }) => {
    try {
      const emailService = require('./src/services/email-service');
      const response = await emailService.generateResponse(emailContent, context, tone);
      return { success: true, response };
    } catch (error) {
      console.error('Failed to generate email response:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle automating email reply
  ipcMain.handle('AUTOMATE_EMAIL_REPLY', async (event, { emailService, responseText }) => {
    try {
      const emailAutomationService = require('./src/services/email-automation-service');
      const result = await emailAutomationService.automateReply(emailService, responseText);
      return { success: true, result };
    } catch (error) {
      console.error('Failed to automate email reply:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle one-time screen capture
  // Use Electron's desktopCapturer - the overlay is transparent so content behind is visible
  ipcMain.handle('CAPTURE_SCREEN_ONCE', async () => {
    try {
      console.log('CAPTURE_SCREEN_ONCE: Starting screen capture...');
      
      // Use Electron's desktopCapturer to capture the screen
      // The overlay window is transparent, so content behind it will be visible
      const result = await screenCaptureService.captureOnce(false);
      
      console.log('CAPTURE_SCREEN_ONCE result:', {
        hasError: !!result.error,
        hasDataURL: !!result.dataURL,
        timestamp: result.timestamp,
        uniqueId: result.uniqueId,
        dataURLLength: result.dataURL?.length || 0
      });
      
      return result;
    } catch (error) {
      console.error('Screen capture error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('FORCE_REFRESH_CAPTURE', async () => {
    // Use Electron's desktopCapturer for consistency
    try {
      console.log('FORCE_REFRESH_CAPTURE: Starting screen capture...');
      const result = await screenCaptureService.captureOnce(true);
      return result;
    } catch (error) {
      console.error('Force refresh capture error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('SET_WINDOW_VISIBILITY', async (_e, shouldShow) => {
    if (mainWindow) {
      if (shouldShow) {
        mainWindow.show();
        mainWindow.moveTop();
        mainWindow.focus();
      } else {
        mainWindow.hide();
      }
    }
  });

  // Google Forms automation handlers
  ipcMain.handle('ANALYZE_GOOGLE_FORM', async () => {
    try {
      const googleFormsService = require('./src/services/google-forms-service');
      const formData = await googleFormsService.analyzeGoogleForm();
      return { success: true, data: formData };
    } catch (error) {
      console.error('Failed to analyze Google Form:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('GENERATE_FORM_RESPONSES', async () => {
    try {
      const googleFormsService = require('./src/services/google-forms-service');
      const responses = await googleFormsService.generateFormResponses();
      return { success: true, data: responses };
    } catch (error) {
      console.error('Failed to generate form responses:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('FILL_OUT_GOOGLE_FORM', async (event, responses) => {
    try {
      const googleFormsService = require('./src/services/google-forms-service');
      const result = await googleFormsService.fillOutForm(responses);
      return { success: true, data: result };
    } catch (error) {
      console.error('Failed to fill out Google Form:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('AUTO_FILL_GOOGLE_FORM', async () => {
    try {
      const googleFormsService = require('./src/services/google-forms-service');
      
      // Step 1: Analyze the form
      const formData = await googleFormsService.analyzeGoogleForm();
      
      // Step 2: Generate responses
      const responses = await googleFormsService.generateFormResponses();
      
      // Step 3: Fill out the form
      const result = await googleFormsService.fillOutForm(responses);
      
      return { 
        success: true, 
        data: { 
          formData, 
          responses, 
          result 
        } 
      };
    } catch (error) {
      console.error('Failed to auto-fill Google Form:', error);
      return { success: false, error: error.message };
    }
  });

  ipcHandlersRegistered = true;
}

function createWindow() {
  // Prevent multiple window creations
  if (isCreatingWindow) {
    console.log('Window creation already in progress, skipping...');
    return;
  }
  
  // If window already exists and is valid, just show it
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('Window already exists, showing it...');
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  
  // If we've already created a window once, don't create another
  if (windowCreated && !mainWindow) {
    console.log('Window was created before but no longer exists. Not recreating to prevent loop.');
    return;
  }
  
  isCreatingWindow = true;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workArea || primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    show: true,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    backgroundColor: '#00000000',
    hasShadow: false, // No shadow for true transparency
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Set click-through IMMEDIATELY after window creation
  // This makes the overlay transparent to mouse events by default
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.setAlwaysOnTop(true, 'floating');

  // In production, we need to load from the app's Resources directory
  // In packaged apps, __dirname points to app/Contents/Resources/app/
  // The build folder should be in app/Contents/Resources/app/build/
  let distPath;
  if (isDev) {
    distPath = 'http://localhost:5174';
  } else {
    // Production mode - load from file system
    // Try multiple locations in order of likelihood
    const possiblePaths = [
      // Primary location: build folder in app directory (vite output)
      path.join(__dirname, 'build', 'index.html'),
      // Fallback: using app.getAppPath() which is more reliable in packaged apps
      path.join(app.getAppPath(), 'build', 'index.html'),
      // macOS packaged app location
      path.join(process.resourcesPath || __dirname, 'app', 'build', 'index.html'),
      // Legacy locations (dist folder)
      path.join(__dirname, 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
      // Last resort: index.html in root
      path.join(__dirname, 'index.html'),
      path.join(app.getAppPath(), 'index.html'),
    ];
    
    let foundPath = null;
    console.log('🔍 Production mode - searching for index.html...');
    console.log('__dirname:', __dirname);
    console.log('app.getAppPath():', app.getAppPath());
    console.log('process.resourcesPath:', process.resourcesPath);
    
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        foundPath = testPath;
        console.log('✅ Found index.html at:', testPath);
        break;
      }
    }
    
    if (foundPath) {
      // Use pathToFileURL for proper file:// URL formatting
      distPath = pathToFileURL(foundPath).href;
      console.log('✅ Loading from:', distPath);
    } else {
      console.error('❌ Could not find index.html in any location');
      console.error('Searched paths:');
      possiblePaths.forEach(p => console.error('  -', p));
      try {
        console.error('Files in __dirname:', fs.readdirSync(__dirname).join(', '));
        if (app.getAppPath() !== __dirname) {
          console.error('Files in app.getAppPath():', fs.readdirSync(app.getAppPath()).join(', '));
        }
      } catch (e) {
        console.error('Could not read directories:', e.message);
      }
      // Still try to load from primary location, even if it doesn't exist (will show error)
      distPath = pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href;
    }
  }
  
  // Load the URL and ensure window is visible
  mainWindow.loadURL(distPath).then(() => {
    console.log('✅ Successfully loaded URL:', distPath);
    // Force window to be visible
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    
    // Make the window click-through AFTER content loads so the OS apps are interactive
    // We'll toggle this off when the cursor is over the sidebar
    console.log('✅ Setting click-through mode');
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }).catch(err => {
    console.error('❌ Failed to load URL:', err);
    console.error('Path attempted:', distPath);
    // Show error but keep window visible
    mainWindow.loadURL(`data:text/html,<h1>Error loading app</h1><p>${err.message}</p><p>Path: ${distPath}</p><p>__dirname: ${__dirname}</p>`).then(() => {
      mainWindow.show();
      mainWindow.focus();
      // Still enable click-through even on error
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    });
  });
  
  // Mark window as created and reset the flag
  windowCreated = true;
  isCreatingWindow = false;
  
  // Force window to be visible immediately
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  
  // Prevent window from being closed - this is a persistent overlay
  mainWindow.on('close', (event) => {
    console.log('Window close attempted - preventing to maintain overlay');
    event.preventDefault();
    mainWindow.hide();
  });
  
  // Handle window destruction
  mainWindow.on('closed', () => {
    console.log('Window was closed');
    mainWindow = null;
  });

  // Ensure the window stays at full-screen size and anchored
  mainWindow.on('will-resize', (e) => e.preventDefault());
  mainWindow.on('moved', () => {
    mainWindow.setBounds({ x: 0, y: 0, width, height });
  });

  // Keep window visible and focused
  mainWindow.on('blur', () => {
    if (mainWindow.isVisible()) {
      mainWindow.moveTop();
    }
  });

  mainWindow.on('hide', () => {
    console.log('Window hide event detected');
  });

  // Start screen capture when window is created
  screenCaptureService.startCapturing();

  // Prewarm microphone selection for faster speech recognition
  speechRecognitionService.prewarmMicrophoneSelection().catch(error => {
    console.error('Failed to prewarm microphone selection:', error);
  });

  // Removed Command+/ toggle per UX request

  // Clear prompt and output with Command+E
  globalShortcut.register('CommandOrControl+E', () => {
    if (mainWindow.isVisible()) {
      mainWindow.webContents.send('clear-prompt');
    }
  });

  // Quit with Command+Q
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
}

// Start the backend server in production
function startServer() {
  if (isDev) {
    console.log('Development mode: server should be started separately');
    return;
  }

  console.log('Starting backend server...');
  const serverPath = path.join(__dirname, 'server.js');
  console.log('Server path:', serverPath);
  
  // Start server as a child process
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000'
    },
    stdio: 'inherit'
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  // Give server a moment to start
  setTimeout(() => {
    console.log('Server should be running on port 3000');
  }, 2000);
}

// Track if app is ready to prevent multiple initializations
let appReady = false;
let initializationStarted = false;

// Prevent multiple app initializations using Electron's built-in single instance lock
// This MUST be called before any other app initialization
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one IMMEDIATELY
  console.log('❌ Another instance is already running, quitting immediately...');
  app.quit();
  process.exit(0);
}

// Register second-instance handler BEFORE whenReady to catch any duplicate launches
app.on('second-instance', () => {
  console.log('⚠️ Second instance detected - focusing existing window instead');
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  } else {
    console.log('⚠️ Main window not available, ignoring second instance');
  }
  // DO NOT create a new window or initialize anything
});

// This is the first (and only) instance
app.whenReady().then(() => {
  // Multiple guards to prevent ANY possibility of duplicate initialization
  if (appReady || initializationStarted) {
    console.log('🚫 BLOCKED: App already initialized, preventing duplicate');
    return;
  }
  
  initializationStarted = true;
  appReady = true;
  
  console.log('✅ App is ready, initializing ONCE...');
  
  // Register IPC handlers once before creating window
  registerIpcHandlers();
  
  // Start server first in production
  if (!isDev) {
    startServer();
  }
  
  // Wait a bit for server to start, then create window ONCE
  // Multiple guards to prevent any possibility of multiple creations
  if (!windowCreated && !isCreatingWindow && mainWindow === null) {
    setTimeout(() => {
      // Final triple-check before creating
      if (!windowCreated && !isCreatingWindow && mainWindow === null && appReady) {
        console.log('✅ Creating window (single time only)...');
        createWindow();
      } else {
        console.log('🚫 BLOCKED: Window already exists or creation in progress');
      }
    }, isDev ? 0 : 3000);
  } else {
    console.log('🚫 BLOCKED: Window creation prevented - already exists or in progress');
  }
});

app.on('window-all-closed', function () {
  console.log('All windows closed event');
  // On macOS, don't quit when all windows are closed - keep app running
  // This is normal macOS behavior for apps that should stay in the dock
  // Kill server process when app closes
  if (serverProcess) {
    serverProcess.kill();
  }
  // Only quit on non-macOS platforms
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // On macOS, the app stays running and can be reactivated via dock icon
});

app.on('before-quit', () => {
  // Clean up server process
  if (serverProcess) {
    serverProcess.kill();
  }
});
