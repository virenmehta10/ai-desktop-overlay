const { contextBridge, ipcRenderer, clipboard } = require('electron');

// Validate screen capture result
function validateScreenCapture(result) {
  if (!result) return { error: 'No result from screen capture' };
  if (result.error) return result;
  if (!result.dataURL) return { error: 'No image data in screen capture' };
  return result;
}

contextBridge.exposeInMainWorld('electron', {
  // Screen capture APIs
  captureScreen: async () => validateScreenCapture(await ipcRenderer.invoke('CAPTURE_SCREEN')),
  captureScreenOnce: async () => validateScreenCapture(await ipcRenderer.invoke('CAPTURE_SCREEN_ONCE')),
  forceRefreshCapture: async () => validateScreenCapture(await ipcRenderer.invoke('FORCE_REFRESH_CAPTURE')),

  // Window visibility
  setVisibility: async (shouldShow) => ipcRenderer.invoke('SET_WINDOW_VISIBILITY', shouldShow),

  // Click-through toggle
  setClickThrough: (ignore) => ipcRenderer.send('SET_CLICK_THROUGH', ignore),

  // Tabs / research helpers
  getCurrentTabs: () => ipcRenderer.invoke('GET_CURRENT_TABS'),
  suggestTabGroups: (tabs) => ipcRenderer.invoke('SUGGEST_TAB_GROUPS', tabs),
  createTabGroup: (browser, groupName, tabs) => ipcRenderer.invoke('CREATE_TAB_GROUP', browser, groupName, tabs),
  pasteToGoogleDoc: (outline) => ipcRenderer.invoke('PASTE_TO_GOOGLE_DOC', outline),

  // Email automation helpers
  detectEmailThread: () => ipcRenderer.invoke('DETECT_EMAIL_THREAD'),
  generateEmailResponse: (emailContent, context, tone) => ipcRenderer.invoke('GENERATE_EMAIL_RESPONSE', { emailContent, context, tone }),
  automateEmailReply: (emailService, responseText) => ipcRenderer.invoke('AUTOMATE_EMAIL_REPLY', { emailService, responseText }),

  // Google Forms automation helpers
  analyzeGoogleForm: () => ipcRenderer.invoke('ANALYZE_GOOGLE_FORM'),
  generateFormResponses: () => ipcRenderer.invoke('GENERATE_FORM_RESPONSES'),
  fillOutGoogleForm: (responses) => ipcRenderer.invoke('FILL_OUT_GOOGLE_FORM', responses),
  autoFillGoogleForm: () => ipcRenderer.invoke('AUTO_FILL_GOOGLE_FORM'),

  // Generic automation helpers
  moveMouseTo: (x, y) => ipcRenderer.invoke('MOVE_MOUSE_TO', { x, y }),
  clickAt: (x, y) => ipcRenderer.invoke('CLICK_AT', { x, y }),
  typeText: (text) => ipcRenderer.invoke('TYPE_TEXT', { text }),
  pasteFromClipboard: () => ipcRenderer.invoke('PASTE_FROM_CLIPBOARD'),

  // Activity hints
  setUserActive: (active) => ipcRenderer.invoke('SET_USER_ACTIVE', active),

  // Events
  onClearPrompt: (cb) => ipcRenderer.on('clear-prompt', cb),
  onExplainText: (cb) => ipcRenderer.on('EXPLAIN_TEXT', cb),

  // Utilities
  quitApp: () => ipcRenderer.send('APP_QUIT'),
  getSelectedText: async () => {
    try {
      return clipboard.readText();
    } catch (e) {
      return '';
    }
  }
});
