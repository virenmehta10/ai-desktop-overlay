const { desktopCapturer, screen } = require('electron');

class ScreenCaptureService {
  constructor() {
    this.lastCapture = null;
    this.captureInterval = null;
    this.isCapturing = false;
    this.isUserActive = false; // Track if user is actively using the app
    this.userCaptureCache = null; // Separate cache for user captures
  }

  validateCapture(capture) {
    if (!capture) return { error: 'No capture data available' };
    if (!capture.thumbnail) return { error: 'No thumbnail in capture' };
    
    try {
      const dataURL = capture.thumbnail.toDataURL();
      if (!dataURL) return { error: 'Failed to convert thumbnail to data URL' };
      
      return {
        dataURL,
        timestamp: Date.now(),
        name: capture.name || 'screen',
        id: capture.id || 'main'
      };
    } catch (error) {
      console.error('Error validating capture:', error);
      return { error: error.message || 'Failed to validate capture' };
    }
  }

  // Set user activity state - when user is active, stop background captures
  setUserActive(active) {
    console.log('Setting user active state to:', active);
    this.isUserActive = active;
    if (active) {
      // Stop background captures when user is active
      console.log('User is active - stopping background captures');
      this.stopCapturing();
      // Clear user capture cache when user becomes active
      this.userCaptureCache = null;
    } else {
      // Resume background captures when user is not active
      console.log('User is inactive - resuming background captures');
      this.startCapturing();
    }
  }

  async startCapturing(interval = 1000) {
    if (this.isCapturing) {
      console.log('Already capturing, skipping start');
      return;
    }
    
    if (this.isUserActive) {
      console.log('User is active, not starting background captures');
      return;
    }
    
    console.log('Starting background captures');
    this.isCapturing = true;
    
    // Only do background captures when user is not active
    this.captureInterval = setInterval(() => {
      // Double-check user is still inactive before capturing
      if (!this.isUserActive) {
        this.captureOnce(true);
      } else {
        console.log('Skipping background capture - user is active');
        // If user became active, stop the interval
        this.stopCapturing();
      }
    }, interval);
  }

  stopCapturing() {
    if (this.captureInterval) {
      console.log('Stopping background captures');
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    this.isCapturing = false;
  }

  getLastCapture() {
    return this.lastCapture || { error: 'No capture available' };
  }

  async forceRefreshCapture() {
    try {
      console.log('Forcing complete refresh of desktop capturer...');
      
      // Stop current capturing to clear any cached state
      this.stopCapturing();
      
      // Wait a moment for any cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clear all caches to force a completely fresh start
      this.lastCapture = null;
      this.userCaptureCache = null;
      
      // Only restart capturing if user is not active
      if (!this.isUserActive) {
        this.startCapturing();
      }
      
      // Wait a moment for the new capture to be ready
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('Desktop capturer refresh completed');
    } catch (error) {
      console.error('Error forcing refresh:', error);
    }
  }

  // Helper method to get a simple hash of the dataURL for comparison
  getDataURLHash(dataURL) {
    let hash = 0;
    for (let i = 0; i < dataURL.length; i++) {
      const char = dataURL.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  async captureOnce(isBackgroundCapture = false) {
    try {
      console.log('captureOnce called, isBackgroundCapture:', isBackgroundCapture);
      
      // If this is a background capture and user is active, skip it completely
      if (isBackgroundCapture && this.isUserActive) {
        console.log('Skipping background capture - user is active');
        return this.lastCapture;
      }
      
      // For user captures, always get a completely fresh capture
      if (!isBackgroundCapture) {
        console.log('User capture requested - forcing completely fresh capture');
        // Clear any cached state for user captures
        this.userCaptureCache = null;
        this.lastCapture = null;
        
        // Wait a moment to ensure any previous captures are cleared
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const primaryDisplay = screen.getPrimaryDisplay();
      
      // Get screen sources (overlay should be hidden by main.js before this is called)
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: primaryDisplay.size.width,
          height: primaryDisplay.size.height
        },
        fetchWindowIcons: false,
      });

      // Find the primary screen source
      const primarySource = sources.find(
        (source) => source.display_id && parseInt(source.display_id, 10) === primaryDisplay.id
      );

      if (!primarySource) {
        throw new Error('Primary screen source not found.');
      }

      // Get the thumbnail data
      const dataURL = primarySource.thumbnail.toDataURL();
      
      if (!dataURL) {
        throw new Error('Failed to convert thumbnail to data URL');
      }
      
      console.log('Screen capture successful, dataURL length:', dataURL.length);

      // Create capture object with all properties
      const capture = {
        dataURL,
        timestamp: Date.now(),
        name: primarySource.name || 'screen',
        id: primarySource.id || 'main',
        uniqueId: `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        displayId: primarySource.display_id,
        sourceId: primarySource.id
      };
      
      // Update appropriate cache based on capture type
      if (isBackgroundCapture) {
        this.lastCapture = capture;
      } else {
        // For user captures, use separate cache and don't update background cache
        this.userCaptureCache = capture;
      }
      
      console.log('Fresh capture created, timestamp:', capture.timestamp, 'uniqueId:', capture.uniqueId, 'isBackground:', isBackgroundCapture);
      
      return capture;
    } catch (error) {
      console.error('One-time screen capture failed:', error);
      return { error: error.message || 'Screen capture failed' };
    }
  }
}

module.exports = new ScreenCaptureService(); 