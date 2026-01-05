// Background service worker for tab grouping
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAllTabs') {
    // Get all tabs with their IDs, URLs, titles, and window IDs
    chrome.tabs.query({}, (tabs) => {
      const tabData = tabs.map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        windowId: tab.windowId,
        index: tab.index
      }));
      sendResponse({ success: true, tabs: tabData });
    });
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'createTabGroup') {
    const { tabIds, groupName } = request;
    
    chrome.tabs.group({ tabIds: tabIds })
      .then((groupId) => {
        return chrome.tabGroups.update(groupId, {
          title: groupName,
          collapsed: false
        });
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Will respond asynchronously
  }
});

