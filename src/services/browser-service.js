const { exec } = require('child_process');

class BrowserService {
  constructor() {
    this.supportedBrowsers = ['Google Chrome'];
  }

  async getCurrentTabs(browser = 'Google Chrome') {
    if (browser === 'Google Chrome') {
      return this.getChromeTabsAppleScript();
    }
    throw new Error('Unsupported browser');
  }

  async getChromeTabsAppleScript() {
    const script = `
      tell application "Google Chrome"
        set tabInfo to {}
        set windowList to every window
        repeat with theWindow in windowList
          try
            set tabList to every tab of theWindow
            repeat with theTab in tabList
              try
                set tabTitle to title of theTab
                set tabURL to URL of theTab
                set tabData to {title:tabTitle, url:tabURL, windowId:id of theWindow}
                set end of tabInfo to tabData
              on error tabError
                -- Skip problematic tabs
                log "Skipping tab due to error: " & tabError
              end try
            end repeat
          on error windowError
            -- Skip problematic windows
            log "Skipping window due to error: " & windowError
          end try
        end repeat
        return tabInfo
      end tell
    `;
    
    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('Error getting Chrome tabs:', error);
          // Return empty array instead of rejecting
          resolve([]);
          return;
        }
        try {
          // Parse the AppleScript output into a structured format
          const tabsData = [];
          const lines = stdout.trim().split(', ');
          let currentTab = {};
          
          for (const line of lines) {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value) {
              currentTab[key] = value;
              if (key === 'windowId') {
                // Add a simple ID for the tab
                currentTab.id = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                tabsData.push({...currentTab});
                currentTab = {};
              }
            }
          }
          
          resolve(tabsData);
        } catch (parseError) {
          console.error('Error parsing tab data:', parseError);
          // Return empty array instead of rejecting
          resolve([]);
        }
      });
    });
  }

  async suggestTabGroups(tabs) {
    // Group tabs based on their URLs and titles
    const groups = {};
    
    for (const tab of tabs) {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      // Common grouping patterns
      if (domain.includes('github.com')) {
        groups['Development'] = groups['Development'] || [];
        groups['Development'].push(tab);
      } else if (domain.includes('google.com') && url.pathname.includes('docs')) {
        groups['Documents'] = groups['Documents'] || [];
        groups['Documents'].push(tab);
      } else if (domain.includes('slack.com') || domain.includes('discord.com') || domain.includes('teams.microsoft.com')) {
        groups['Communication'] = groups['Communication'] || [];
        groups['Communication'].push(tab);
      } else if (domain.includes('youtube.com') || domain.includes('netflix.com') || domain.includes('spotify.com')) {
        groups['Entertainment'] = groups['Entertainment'] || [];
        groups['Entertainment'].push(tab);
      } else if (domain.includes('mail.google.com') || domain.includes('outlook.com')) {
        groups['Email'] = groups['Email'] || [];
        groups['Email'].push(tab);
      } else if (domain.includes('notion.so') || domain.includes('evernote.com') || domain.includes('onenote.com')) {
        groups['Notes'] = groups['Notes'] || [];
        groups['Notes'].push(tab);
      } else if (domain.includes('linkedin.com') || domain.includes('twitter.com') || domain.includes('facebook.com')) {
        groups['Social'] = groups['Social'] || [];
        groups['Social'].push(tab);
      } else {
        groups['Other'] = groups['Other'] || [];
        groups['Other'].push(tab);
      }
    }
    
    // Only return groups that have tabs
    return Object.fromEntries(
      Object.entries(groups).filter(([_, tabs]) => tabs.length > 0)
    );
  }

  async createTabGroup(browser, groupName, tabs) {
    if (browser === 'Google Chrome') {
      return this.createChromeTabGroup(groupName, tabs);
    }
    throw new Error('Unsupported browser');
  }

  async createChromeTabGroup(groupName, tabs) {
    if (!tabs || tabs.length === 0) return;

    // First, get the window ID and tab indices
    const windowId = tabs[0].windowId;
    const tabIds = tabs.map(tab => tab.id).join(',');
    
    const script = `
      tell application "Google Chrome"
        tell window id ${windowId}
          -- Create a new tab group
          execute javascript "
            (async () => {
              try {
                const tabs = [${tabIds}];
                const groupId = await chrome.tabs.group({tabIds: tabs});
                await chrome.tabGroups.update(groupId, {
                  collapsed: false,
                  title: '${groupName}'
                });
              } catch (e) {
                console.error('Error creating tab group:', e);
              }
            })();
          "
        end tell
      end tell
    `;
    
    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('Error creating Chrome tab group:', error);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  }

  async openGoogleSearchTab(topic) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(topic)}`;
    
    const script = `
      tell application "Google Chrome"
        activate
        delay 1
        tell application "System Events"
          keystroke "t" using command down
          delay 0.5
          keystroke "${searchUrl}"
          delay 0.5
          keystroke return
        end tell
      end tell
    `;
    
    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('Error opening Google search tab:', error);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  }

  async openGoogleSearchTabFallback(topic) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(topic)}`;
    
    return new Promise((resolve, reject) => {
      exec(`open "${searchUrl}"`, (error) => {
        if (error) {
          console.error('Error opening Google search with fallback method:', error);
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  }
}

module.exports = new BrowserService(); 