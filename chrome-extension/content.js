// Content script to bridge communication between injected scripts and background
(function() {
  // Listen for messages from injected scripts
  window.addEventListener('message', (event) => {
    // Only accept messages from the same origin
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'TAB_GROUP_EXTENSION_REQUEST') {
      // Forward to background script
      chrome.runtime.sendMessage(event.data.payload, (response) => {
        // Send response back to injected script
        window.postMessage({
          type: 'TAB_GROUP_EXTENSION_RESPONSE',
          requestId: event.data.requestId,
          response: response
        }, '*');
      });
    }
  });
})();




