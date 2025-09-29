const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const isDev = process.env.NODE_ENV !== 'production';
const browserService = require('./src/services/browser-service');
const screenCaptureService = require('./src/services/screen-capture');
const speechRecognitionService = require('./src/services/speech-recognition');

let mainWindow;

function createWindow() {
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.setAlwaysOnTop(true, 'floating');

  mainWindow.loadURL(
    isDev ? 'http://localhost:5174' : `file://${path.join(__dirname, '../dist/index.html')}`
  );

  // Make the window click-through by default so the OS apps are interactive
  // We'll toggle this off when the cursor is over the sidebar
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

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

  // Clear prompt and output with Command+C
  globalShortcut.register('CommandOrControl+C', () => {
    if (mainWindow.isVisible()) {
      mainWindow.webContents.send('clear-prompt');
    }
  });

  // Quit with Command+Q
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });

  // Handle screen capture
  ipcMain.handle('CAPTURE_SCREEN', async () => {
    return screenCaptureService.getLastCapture();
  });

  // Toggle click-through from renderer
  ipcMain.on('SET_CLICK_THROUGH', (_event, ignore) => {
    try {
      mainWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
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
              delay 0.06
              click at {cx, cy + 60}
              delay 0.06
              click at {cx, cy + 120}
              delay 0.08
            on error
              click at {800, 500}
              delay 0.1
            end try
            -- nudge and paste
            keystroke space
            key code 51
            delay 0.06
            keystroke "v" using command down
            delay 0.3
            -- single paste only to avoid duplication
          end tell
        end tell
      `;
      
      await new Promise((resolve, reject) => {
        exec(`osascript -e '${focusAndPasteScript}'`, (error) => {
          if (error) {
            console.error('AppleScript focus/paste error:', error);
            reject(new Error(`Failed to focus Chrome and paste: ${error.message}`));
            return;
          }
          console.log('Chrome focused and content pasted successfully');
          resolve();
        });
      });
      
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFile);
        console.log('Temporary file cleaned up');
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }
      
      return { success: true, message: 'Research outline successfully pasted into Google Docs' };
      
    } catch (error) {
      console.error('Failed to paste to Google Docs:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle email response operations
  ipcMain.handle('DETECT_EMAIL_THREAD', async () => {
    try {
      console.log('Detecting email thread in current tab...');
      
      // Get current Chrome tab info
      const browserService = require('./src/services/browser-service');
      const tabs = await browserService.getCurrentTabs();
      
      if (!tabs || tabs.length === 0) {
        return { success: false, error: 'No browser tabs found' };
      }
      
      // Find the active tab (usually the first one)
      const activeTab = tabs[0];
      
      // Check if it's an email service
      const isEmailService = activeTab.url.includes('mail.google.com') || 
                           activeTab.url.includes('outlook.com') ||
                           activeTab.url.includes('mail.yahoo.com') ||
                           activeTab.url.includes('protonmail.com');
      
      if (!isEmailService) {
        return { success: false, error: 'Current tab is not an email service' };
      }
      
      return { 
        success: true, 
        emailService: activeTab.url.includes('mail.google.com') ? 'gmail' : 
                     activeTab.url.includes('outlook.com') ? 'outlook' : 'other',
        tabInfo: activeTab
      };
      
    } catch (error) {
      console.error('Failed to detect email thread:', error);
      return { success: false, error: error.message };
    }
  });

  // Generic automation functions
  ipcMain.handle('MOVE_MOUSE_TO', async (event, { x, y }) => {
    try {
      console.log(`Moving mouse to coordinates: ${x}, ${y}`);
      
      const moveScript = `
        tell application "System Events"
          set mouseLocation to {${x}, ${y}}
          set cursor position to mouseLocation
        end tell
      `;
      
      await new Promise((resolve, reject) => {
        exec(`osascript -e '${moveScript}'`, (error) => {
          if (error) {
            console.error('Mouse move failed:', error);
            reject(new Error(`Failed to move mouse: ${error.message}`));
            return;
          }
          console.log('Mouse moved successfully');
          resolve();
        });
      });
      
      return { success: true, message: `Mouse moved to ${x}, ${y}` };
      
    } catch (error) {
      console.error('Failed to move mouse:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('CLICK_AT', async (event, { x, y }) => {
    try {
      console.log(`Clicking at coordinates: ${x}, ${y}`);
      
      const clickScript = `
        tell application "System Events"
          set mouseLocation to {${x}, ${y}}
          set cursor position to mouseLocation
          delay 0.1
          click at mouseLocation
        end tell
      `;
      
      await new Promise((resolve, reject) => {
        exec(`osascript -e '${clickScript}'`, (error) => {
          if (error) {
            console.error('Click failed:', error);
            reject(new Error(`Failed to click: ${error.message}`));
            return;
          }
          console.log('Click successful');
          resolve();
        });
      });
      
      return { success: true, message: `Clicked at ${x}, ${y}` };
      
    } catch (error) {
      console.error('Failed to click:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('TYPE_TEXT', async (event, { text }) => {
    try {
      console.log(`Typing text: ${text}`);
      
      const typeScript = `
        tell application "System Events"
          keystroke "${text.replace(/"/g, '\\"')}"
        end tell
      `;
      
      await new Promise((resolve, reject) => {
        exec(`osascript -e '${typeScript}'`, (error) => {
          if (error) {
            console.error('Text typing failed:', error);
            reject(new Error(`Failed to type text: ${error.message}`));
            return;
          }
          console.log('Text typed successfully');
          resolve();
        });
      });
      
      return { success: true, message: `Typed: ${text}` };
      
    } catch (error) {
      console.error('Failed to type text:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('PASTE_FROM_CLIPBOARD', async (event) => {
    try {
      console.log('Pasting from clipboard');
      
      const pasteScript = `
        tell application "System Events"
          keystroke "v" using command down
        end tell
      `;
      
      await new Promise((resolve, reject) => {
        exec(`osascript -e '${pasteScript}'`, (error) => {
          if (error) {
            console.error('Paste failed:', error);
            reject(new Error(`Failed to paste: ${error.message}`));
            return;
          }
          console.log('Paste successful');
          resolve();
        });
      });
      
      return { success: true, message: 'Pasted from clipboard' };
      
    } catch (error) {
      console.error('Failed to paste:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('GENERATE_EMAIL_RESPONSE', async (event, { emailContent, context, tone }) => {
    try {
      console.log('Generating email response...');
      
      // This will be handled by the AI service, so we just return success
      // The actual generation happens in the server.js
      return { success: true, message: 'Email response generation initiated' };
      
    } catch (error) {
      console.error('Failed to initiate email response generation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('AUTOMATE_EMAIL_REPLY', async (event, { emailService, responseText }) => {
    try {
      console.log(`Automating email reply for ${emailService}...`);
      
      // Copy response to clipboard
      await new Promise((resolve, reject) => {
        exec(`echo "${responseText.replace(/"/g, '\\"')}" | pbcopy`, (error) => {
          if (error) {
            console.error('Failed to copy to clipboard:', error);
            reject(new Error(`Failed to copy to clipboard: ${error.message}`));
            return;
          }
          console.log('Email response copied to clipboard successfully');
          resolve();
        });
      });
      
      // Wait for clipboard to be populated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      let automationScript = '';
      
      if (emailService === 'gmail') {
        // Gmail automation: click reply button and paste
        automationScript = `
          tell application "Google Chrome"
            activate
            delay 0.5
          end tell
          
          tell application "System Events"
            delay 0.5
            -- Try multiple approaches to click reply
            -- First try keyboard shortcut 'r' for reply
            keystroke "r"
            delay 1.5
            -- Wait for reply field to open and focus
            delay 1
            -- Paste the response
            keystroke "v" using command down
            delay 0.5
          end tell
        `;
      } else if (emailService === 'outlook') {
        // Outlook automation: click reply button and paste
        automationScript = `
          tell application "Google Chrome"
            activate
            delay 0.5
          end tell
          
          tell application "System Events"
            delay 0.5
            -- Try keyboard shortcut 'r' for reply
            keystroke "r"
            delay 1.5
            -- Wait for reply field to open
            delay 1
            -- Paste the response
            keystroke "v" using command down
            delay 0.5
          end tell
        `;
      } else {
        // Generic email service automation
        automationScript = `
          tell application "Google Chrome"
            activate
            delay 0.5
          end tell
          
          tell application "System Events"
            delay 0.5
            -- Try common reply shortcuts
            keystroke "r"
            delay 1.5
            -- Wait for reply field to open
            delay 1
            -- Paste the response
            keystroke "v" using command down
            delay 0.5
          end tell
        `;
      }
      
      // Execute the automation script
      let automationSuccess = false;
      try {
        await new Promise((resolve, reject) => {
          exec(`osascript -e '${automationScript}'`, (error) => {
            if (error) {
              console.error('AppleScript automation error:', error);
              reject(new Error(`Failed to automate email reply: ${error.message}`));
              return;
            }
            console.log('Email reply automation completed successfully');
            automationSuccess = true;
            resolve();
          });
        });
      } catch (error) {
        console.log('Primary automation failed, trying fallback method...');
        
        // Fallback: try to find and click reply button by coordinates
        const fallbackScript = `
          tell application "Google Chrome"
            activate
            delay 0.5
          end tell
          
          tell application "System Events"
            delay 0.5
            -- Try to click common reply button locations
            -- Gmail reply button is usually in the bottom area
            -- Click around where reply buttons typically are
            tell process "Google Chrome"
              -- Try clicking in the bottom area where reply buttons usually are
              click at {100, 800}
              delay 1
              -- Try another common location
              click at {200, 800}
              delay 1
              -- Paste the response
              keystroke "v" using command down
              delay 0.5
            end tell
          end tell
        `;
        
        try {
          await new Promise((resolve, reject) => {
            exec(`osascript -e '${fallbackScript}'`, (error) => {
              if (error) {
                console.error('Fallback automation also failed:', error);
                reject(new Error(`Both automation methods failed: ${error.message}`));
                return;
              }
              console.log('Fallback automation completed successfully');
              automationSuccess = true;
              resolve();
            });
          });
        } catch (fallbackError) {
          console.error('All automation methods failed:', fallbackError);
          throw fallbackError;
        }
      }
      
      return { 
        success: true, 
        message: `Email response automatically pasted into ${emailService} reply field! Review and edit before sending.` 
      };
      
    } catch (error) {
      console.error('Failed to automate email reply:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle one-time screen capture
  ipcMain.handle('CAPTURE_SCREEN_ONCE', async () => {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.moveTop();
      mainWindow.focus();
    }
    const result = await screenCaptureService.captureOnce(false);
    console.log('CAPTURE_SCREEN_ONCE result:', {
      hasError: !!result.error,
      hasDataURL: !!result.dataURL,
      timestamp: result.timestamp,
      uniqueId: result.uniqueId,
      allProperties: Object.keys(result || {})
    });
    return result;
  });

  ipcMain.handle('FORCE_REFRESH_CAPTURE', async () => {
    return screenCaptureService.captureOnce(true);
  });

  ipcMain.handle('SET_WINDOW_VISIBILITY', async (_e, shouldShow) => {
    if (shouldShow) {
      mainWindow.show();
      mainWindow.moveTop();
      mainWindow.focus();
    } else {
      mainWindow.hide();
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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
