const { exec } = require('child_process');
const OpenAI = require('openai');

class BrowserService {
  constructor() {
    this.supportedBrowsers = ['Google Chrome'];
    this._openai = null;
  }

  get openai() {
    if (!this._openai && process.env.OPENAI_API_KEY) {
      this._openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this._openai;
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
            set windowId to id of theWindow
            set tabList to every tab of theWindow
            set tabIndex to 0
            repeat with theTab in tabList
              try
                set tabTitle to title of theTab
                set tabURL to URL of theTab
                set tabData to {title:tabTitle, url:tabURL, windowId:windowId, index:tabIndex}
                set end of tabInfo to tabData
                set tabIndex to tabIndex + 1
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
              currentTab[key] = isNaN(value) ? value : parseInt(value);
              if (key === 'index') {
                // Add a unique ID for the tab (using windowId and index)
                currentTab.id = `${currentTab.windowId}_${currentTab.index}`;
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
    if (!tabs || tabs.length === 0) {
      return {};
    }

    // Use AI to intelligently categorize tabs if OpenAI is available
    if (this.openai) {
      try {
        return await this.suggestTabGroupsWithAI(tabs);
      } catch (error) {
        console.error('[BROWSER SERVICE] AI categorization failed, falling back to rule-based:', error);
        // Fall through to rule-based grouping
      }
    }

    // Fallback to rule-based grouping
    return this.suggestTabGroupsRuleBased(tabs);
  }

  async suggestTabGroupsWithAI(tabs) {
    // Prepare tab data for AI analysis
    const tabData = tabs.map((tab, index) => {
      try {
        const url = new URL(tab.url);
        return {
          index,
          title: tab.title,
          domain: url.hostname,
          path: url.pathname,
          url: tab.url
        };
      } catch (e) {
        return {
          index,
          title: tab.title,
          domain: 'unknown',
          path: '',
          url: tab.url || ''
        };
      }
    });

    const systemPrompt = `You are an expert at organizing browser tabs into logical categories. Analyze the provided tabs and group them into meaningful categories based on their content, purpose, and domain.

Return ONLY a valid JSON object where:
- Each key is a category name (be specific and descriptive, e.g., "Work - Research", "Development - GitHub", "Entertainment - Videos")
- Each value is an array of tab indices (0-based) that belong to that category
- Group tabs intelligently based on:
  * Domain and website type
  * Page content and purpose (inferred from title and URL)
  * Work vs personal context
  * Task or project relationships
  * Similar functionality or purpose

Guidelines:
- Create 3-8 categories (avoid too many or too few)
- Each category should have a clear, descriptive name
- Tabs should be grouped logically (e.g., all GitHub repos together, all Google Docs together, all research articles together)
- Don't create a category with just 1 tab unless it's truly unique
- Consider project-based grouping when multiple tabs relate to the same topic

Return format:
{
  "Category Name 1": [0, 2, 5],
  "Category Name 2": [1, 3, 4],
  ...
}`;

    const userPrompt = `Analyze these ${tabs.length} tabs and group them into logical categories:\n\n${tabData.map((tab, i) => `${i}. ${tab.title} (${tab.domain}${tab.path})`).join('\n')}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    let categories;
    
    try {
      // Clean and parse JSON
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      categories = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[BROWSER SERVICE] Failed to parse AI response:', parseError);
      throw new Error('Failed to parse AI categorization response');
    }

    // Convert indices back to tab objects
    const groups = {};
    for (const [categoryName, indices] of Object.entries(categories)) {
      if (Array.isArray(indices) && indices.length > 0) {
        groups[categoryName] = indices
          .filter(idx => idx >= 0 && idx < tabs.length)
          .map(idx => tabs[idx]);
      }
    }

    // Only return groups that have tabs
    return Object.fromEntries(
      Object.entries(groups).filter(([_, groupTabs]) => groupTabs.length > 0)
    );
  }

  suggestTabGroupsRuleBased(tabs) {
    // Fallback rule-based grouping
    const groups = {};
    
    for (const tab of tabs) {
      try {
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
      } catch (e) {
        // Invalid URL, put in Other
        groups['Other'] = groups['Other'] || [];
        groups['Other'].push(tab);
      }
    }
    
    // Only return groups that have tabs
    return Object.fromEntries(
      Object.entries(groups).filter(([_, groupTabs]) => groupTabs.length > 0)
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

    try {
      // First, get all Chrome tabs with their actual IDs via the extension
      const allChromeTabs = await this.getChromeTabsWithIds();
      
      if (!allChromeTabs || allChromeTabs.length === 0) {
        throw new Error('Could not retrieve Chrome tabs. Make sure the Chrome extension is installed and Chrome is running.');
      }

      // Match tabs by URL (most reliable) to get Chrome tab IDs
      const chromeTabIds = [];
      const tabsByWindow = {};
      
      for (const tab of tabs) {
        // Find matching Chrome tab by URL
        const matchingChromeTab = allChromeTabs.find(ct => {
          try {
            // Normalize URLs for comparison (remove trailing slashes, etc.)
            const tabUrl = new URL(tab.url).href.replace(/\/$/, '');
            const chromeTabUrl = new URL(ct.url).href.replace(/\/$/, '');
            return tabUrl === chromeTabUrl;
          } catch (e) {
            // Fallback to string comparison if URL parsing fails
            return tab.url === ct.url;
          }
        });

        if (matchingChromeTab) {
          const windowId = matchingChromeTab.windowId;
          if (!tabsByWindow[windowId]) {
            tabsByWindow[windowId] = [];
          }
          tabsByWindow[windowId].push(matchingChromeTab.id);
        } else {
          console.warn(`[BROWSER SERVICE] Could not find Chrome tab for URL: ${tab.url}`);
        }
      }

      // Create groups for each window
      for (const [windowId, tabIds] of Object.entries(tabsByWindow)) {
        if (tabIds.length === 0) continue;
        
        // Use the Chrome extension to create the group
        await this.createTabGroupViaExtension(tabIds, groupName);
      }
    } catch (error) {
      console.error('[BROWSER SERVICE] Error creating tab group via extension:', error);
      throw new Error(`Failed to create tab group: ${error.message}`);
    }
  }

  async getChromeTabsWithIds() {
    // Inject JavaScript into Chrome to communicate with the extension via content script
    const requestId = `req_${Date.now()}_${Math.random()}`;
    const script = `
      tell application "Google Chrome"
        activate
        delay 0.5
        try
          -- Get the first window and its first tab
          set firstWindow to window 1
          set firstTab to tab 1 of firstWindow
          
          -- Execute JavaScript to get all tabs via extension
          set jsCode to "
            (async () => {
              return new Promise((resolve) => {
                const requestId = '${requestId}';
                const timeout = setTimeout(() => {
                  resolve('[]');
                }, 5000);
                
                const handler = (event) => {
                  if (event.data && event.data.type === 'TAB_GROUP_EXTENSION_RESPONSE' && 
                      event.data.requestId === requestId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    if (event.data.response && event.data.response.success) {
                      resolve(JSON.stringify(event.data.response.tabs));
                    } else {
                      resolve('[]');
                    }
                  }
                };
                
                window.addEventListener('message', handler);
                
                // Send request to content script
                window.postMessage({
                  type: 'TAB_GROUP_EXTENSION_REQUEST',
                  requestId: requestId,
                  payload: { action: 'getAllTabs' }
                }, '*');
              });
            })()
          "
          
          set tabData to execute javascript jsCode in firstTab
          return tabData
        on error errMsg
          log "Error getting Chrome tabs: " & errMsg
          return "[]"
        end try
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('[BROWSER SERVICE] Error getting Chrome tabs with IDs:', error);
          reject(new Error(`Failed to get Chrome tabs: ${error.message}`));
          return;
        }

        try {
          const tabDataStr = stdout.trim();
          if (!tabDataStr || tabDataStr === '[]') {
            resolve([]);
            return;
          }

          const tabs = JSON.parse(tabDataStr);
          resolve(tabs);
        } catch (parseError) {
          console.error('[BROWSER SERVICE] Error parsing tab data:', parseError);
          reject(new Error('Failed to parse Chrome tab data'));
        }
      });
    });
  }

  async createTabGroupViaExtension(tabIds, groupName) {
    // Inject JavaScript into Chrome to send message to extension via content script
    const escapedGroupName = groupName.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const tabIdsStr = JSON.stringify(tabIds);
    const requestId = `req_${Date.now()}_${Math.random()}`;
    
    const script = `
      tell application "Google Chrome"
        activate
        delay 0.5
        try
          set firstWindow to window 1
          set firstTab to tab 1 of firstWindow
          
          set jsCode to "
            (async () => {
              return new Promise((resolve) => {
                const requestId = '${requestId}';
                const timeout = setTimeout(() => {
                  resolve('error: Timeout waiting for response');
                }, 10000);
                
                const handler = (event) => {
                  if (event.data && event.data.type === 'TAB_GROUP_EXTENSION_RESPONSE' && 
                      event.data.requestId === requestId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    if (event.data.response && event.data.response.success) {
                      resolve('success');
                    } else {
                      resolve('error: ' + (event.data.response?.error || 'Unknown error'));
                    }
                  }
                };
                
                window.addEventListener('message', handler);
                
                // Send request to content script
                window.postMessage({
                  type: 'TAB_GROUP_EXTENSION_REQUEST',
                  requestId: requestId,
                  payload: {
                    action: 'createTabGroup',
                    tabIds: ${tabIdsStr},
                    groupName: '${escapedGroupName.replace(/'/g, "\\'")}'
                  }
                }, '*');
              });
            })()
          "
          
          set result to execute javascript jsCode in firstTab
          return result
        on error errMsg
          log "Error creating tab group: " & errMsg
          return "error: " & errMsg
        end try
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('[BROWSER SERVICE] Error creating tab group:', error);
          reject(new Error(`Failed to create tab group: ${error.message}`));
          return;
        }

        const result = stdout.trim();
        if (result.startsWith('error:')) {
          reject(new Error(result));
        } else {
          console.log('[BROWSER SERVICE] Tab group created successfully');
          resolve(true);
        }
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