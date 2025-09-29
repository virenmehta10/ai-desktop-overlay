import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import LearningOverlay from './LearningOverlay';
import InteractiveTutoringOverlay from './InteractiveTutoringOverlay';

import TabGrouping from './TabGrouping';
import CollapsibleCards from './CollapsibleCards';
import AssistantErrorBoundary from './AssistantErrorBoundary';
import ModeToggle from './ModeToggle';
import MemoryDisplay from './MemoryDisplay';
import LearningPersonaDisplay from './LearningPersonaDisplay';
import CollapsibleTutoringSteps from './CollapsibleTutoringSteps';

export default function CommandBar() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [screenCapture, setScreenCapture] = useState(null);
  const [showTabGrouping, setShowTabGrouping] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const [isLearningMode, setIsLearningMode] = useState(false);
  const [learningContent, setLearningContent] = useState(null);
  const [isActiveMode, setIsActiveMode] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [clearKey, setClearKey] = useState(0);
  const [showMemory, setShowMemory] = useState(false);
  const [showLearningPersona, setShowLearningPersona] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  
  // Interactive tutoring state
  const [isInteractiveTutoring, setIsInteractiveTutoring] = useState(false);
  const [tutoringContent, setTutoringContent] = useState(null);
  const [tutoringSessionId, setTutoringSessionId] = useState(null);

  // Add resize listener
  useEffect(() => {
    const handleResize = () => {
      const newX = Math.max(0, Math.min(window.innerWidth - 900, position.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, position.y));
      setPosition({ x: newX, y: newY });
    };

    window.addEventListener('resize', handleResize);

    // Add clear prompt listener
    const clearPromptUnsubscribe = window.electron?.onClearPrompt?.(() => {
      clearConversation();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      clearPromptUnsubscribe?.();
    };
  }, [position]);

  // Add text selection listener
  useEffect(() => {
    const handleTextSelection = () => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      if (selectedText && selectedText.length > 0) {
        setSelectedText(selectedText);
        console.log('Text selected:', selectedText);
      }
    };

    // Listen for text selection events
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keyup', handleTextSelection);

    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
      document.removeEventListener('keyup', handleTextSelection);
    };
  }, []);

  // Screen capture effect
  useEffect(() => {
    let isMounted = true;

    const captureScreen = async () => {
      if (!window.electron?.captureScreen) {
        console.error('Screen capture API not available');
        return;
      }

      try {
        const result = await window.electron.captureScreen();
        if (!isMounted) return;

        if (result.error) {
          console.error('Screen capture error:', result.error);
          setError(result.error);
          setScreenCapture(null);
          return;
        }

        if (!result.dataURL) {
          console.error('No image data in screen capture result');
          setScreenCapture(null);
          return;
        }

        setScreenCapture(result.dataURL);
        setError(null);
      } catch (err) {
        console.error('Screen capture failed:', err);
        if (isMounted) {
          setError('Failed to capture screen');
          setScreenCapture(null);
        }
      }
    };

    captureScreen();
    captureIntervalRef.current = setInterval(captureScreen, 1000);

    return () => {
      isMounted = false;
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, []);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setResponse('');

    try {
      // Set user as active to prevent background captures from interfering
      if (window.electron?.setUserActive) {
        console.log('Setting user as active before query...');
        await window.electron.setUserActive(true);
        console.log('User active state set successfully');
        
        // Wait a moment to ensure background captures are stopped
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.warn('setUserActive method not available');
      }

      // Always get a completely fresh screen capture for each query
      let currentScreenCapture = null;
      
      if (window.electron?.captureScreenOnce) {
        console.log('Getting completely fresh screen capture for user query...');
        
        // Force a refresh of the capture system first
        if (window.electron?.forceRefreshCapture) {
          await window.electron.forceRefreshCapture();
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const result = await window.electron.captureScreenOnce();
        
        if (result.error) {
          console.error('Screen capture error:', result.error);
          setError('Failed to capture screen. Please try again.');
          setIsLoading(false);
          return;
        }
        
        console.log('Raw capture result received:', {
          hasError: !!result.error,
          hasDataURL: !!result.dataURL,
          timestamp: result.timestamp,
          uniqueId: result.uniqueId,
          allProperties: Object.keys(result)
        });
        
        // Ensure we have all the required properties
        currentScreenCapture = {
          dataURL: result.dataURL,
          timestamp: result.timestamp,
          uniqueId: result.uniqueId,
          name: result.name,
          id: result.id,
          displayId: result.displayId,
          sourceId: result.sourceId
        };
        
        console.log('Completely fresh screen capture obtained for user query:', {
          hasDataURL: !!currentScreenCapture.dataURL,
          dataURLLength: currentScreenCapture.dataURL ? currentScreenCapture.dataURL.length : 0,
          timestamp: currentScreenCapture.timestamp,
          uniqueId: currentScreenCapture.uniqueId,
          allProperties: Object.keys(currentScreenCapture)
        });
      } else {
        console.warn('captureScreenOnce method not available');
      }

      const requestBody = { 
        query,
        screenCapture: currentScreenCapture,
        selectedText: selectedText,
        timestamp: Date.now(),
        isActiveMode: isActiveMode
      };

      console.log('Sending user query with completely fresh screen capture:', {
        query: requestBody.query,
        hasScreenCapture: !!requestBody.screenCapture,
        screenCaptureProperties: requestBody.screenCapture ? Object.keys(requestBody.screenCapture) : [],
        uniqueId: requestBody.screenCapture?.uniqueId
      });

      const response = await fetch('http://localhost:3001/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to get AI response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullResponse += parsed.content;
                  setResponse(fullResponse);

                  // Check if this is a learning response
                  if (parsed.learningSession) {
                    setIsLearningMode(true);
                    setLearningContent({
                      explanation: fullResponse,
                      learningSession: parsed.learningSession,
                      concepts: parsed.concepts,
                      checkpoints: parsed.checkpoints,
                      progress: parsed.progress
                    });
                  }
                }
              } catch (e) {
                console.error('Failed to parse chunk:', e);
              }
            }
          }
        }
        
        // Disabled auto-switch to interactive tutoring to ensure responses always render in active understanding UI.
        // If you want to re-enable, gate with an explicit user intent flag instead of heuristics.
        // If not a quiz/test, show the normal response
        setResponse(fullResponse);
      } finally {
        setIsLoading(false);
        // Set user as inactive after a delay to allow background captures to resume
        setTimeout(async () => {
          if (window.electron?.setUserActive) {
            await window.electron.setUserActive(false);
          }
        }, 3000);
      }
    } catch (error) {
      console.error('Error:', error);
      setError(error.message || 'Failed to get response');
      setIsLoading(false);
      // Set user as inactive on error as well
      setTimeout(async () => {
        if (window.electron?.setUserActive) {
          await window.electron.setUserActive(false);
        }
      }, 3000);
    }
  };

  const clearConversation = () => {
    setQuery('');
    setResponse('');
    setError(null);
    setIsLoading(false);
    setLearningContent(null);
    setIsLearningMode(false);
    setShowTabGrouping(false);
    setIsInteractiveTutoring(false);
    setTutoringContent(null);
    setTutoringSessionId(null);
    setSelectedText('');
    setClearKey(prev => prev + 1);
  };

  // Interactive tutoring handlers
  const handleEndSession = async () => {
    if (!tutoringSessionId) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/tutoring/session/${tutoringSessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      console.log('Session ended:', data.summary);
      
      setIsInteractiveTutoring(false);
      setTutoringContent(null);
      setTutoringSessionId(null);
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check for YouTube video search command (topic-based)
    const youtubePattern = /^(?:can you )?(?:please )?(?:get|find|search for|open) (?:a )?youtube video (?:to learn about|about|on) (.+)$/i;
    const youtubeMatch = query.toLowerCase().match(youtubePattern);
    
    // Check for YouTube video search command (screen-based)
    const youtubeScreenPattern = /^(?:can you )?(?:please )?(?:open|get|find|search for) (?:a )?youtube video (?:to help me understand this|to help me learn this|about this|on this)$/i;
    const youtubeScreenMatch = query.toLowerCase().match(youtubeScreenPattern);
    
    if (youtubeMatch || youtubeScreenMatch) {
      setIsLoading(true);
      try {
        // For screen-based commands, we need screen capture
        let requestBody = {
          query: query,
          timestamp: Date.now(),
          isActiveMode: isActiveMode
        };

        // Add screen capture for screen-based YouTube commands
        if (youtubeScreenMatch) {
          try {
            const capture = await window.electron.captureScreenOnce();
            if (capture.error) {
              throw new Error('Failed to capture screen');
            }
            requestBody.screenCapture = {
              dataURL: capture.dataURL,
              timestamp: capture.timestamp || Date.now(),
              name: capture.name || 'screen',
              id: capture.id || 'main'
            };
          } catch (captureError) {
            setError('Failed to capture screen for YouTube search: ' + captureError.message);
            setIsLoading(false);
            return;
          }
        }

        const response = await fetch('http://localhost:3001/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(await response.text() || 'Failed to search YouTube');
        }

        const data = await response.json();
        setResponse(data.content || 'YouTube search completed successfully.');
      } catch (error) {
        setError('Failed to search YouTube: ' + error.message);
      } finally {
        setIsLoading(false);
      }
      setQuery('');
      return;
    }
    
    // Check for tab grouping command
    if (query.toLowerCase().includes('group') && query.toLowerCase().includes('tab')) {
      setIsLoading(true);
      try {
        // Get current tabs
        const tabs = await window.electron.getCurrentTabs('Google Chrome');
        
        // Get suggested groups
        const groups = await window.electron.suggestTabGroups(tabs);
        
        // Create each group
        for (const [groupName, groupTabs] of Object.entries(groups)) {
          if (groupTabs.length > 0) {
            await window.electron.createTabGroup('Google Chrome', groupName, groupTabs);
          }
        }
        
        setResponse('✓ Successfully grouped your tabs! Check your Chrome window to see the organized groups.');
      } catch (error) {
        setError('Failed to group tabs: ' + error.message);
      } finally {
        setIsLoading(false);
      }
      setQuery('');
      return;
    }

    // ... rest of the existing handleSubmit code ...
  };

  return (
    <>
      <motion.div
        ref={containerRef}
        initial={false}
        style={{
          position: 'fixed',
          width: '900px',
          zIndex: 10000,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitAppRegion: 'no-drag',
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          willChange: 'transform',
          contain: 'layout style paint',
          isolation: 'isolate',
          WebkitUserDrag: 'none',
          touchAction: 'none',
          WebkitTransform: 'translateZ(0)',
          WebkitPerspective: '1000',
          WebkitTransformStyle: 'preserve-3d',
        }}
        className="force-gpu no-drag-image"
        animate={{ 
          opacity: 1,
          scale: 1,
          x: position.x,
          y: position.y,
          transition: {
            duration: 0.2,
            ease: [0.23, 1, 0.32, 1]
          }
        }}
        exit={{ opacity: 0, scale: 0.95 }}
        drag
        dragMomentum={false}
        dragElastic={0.05}
        dragConstraints={{
          top: 0,
          left: 0,
          right: window.innerWidth - 900,
          bottom: window.innerHeight
        }}
        onDragStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(true);
          if (containerRef.current) {
            containerRef.current.style.opacity = '0.92';
            containerRef.current.style.cursor = 'grabbing';
          }
          document.body.style.cursor = 'grabbing';
        }}
        onDrag={(event, info) => {
          event.preventDefault();
          event.stopPropagation();
          setPosition({ x: info.point.x, y: info.point.y });
        }}
        onDragEnd={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(false);
          if (containerRef.current) {
            containerRef.current.style.opacity = '1';
            containerRef.current.style.cursor = 'grab';
          }
          document.body.style.cursor = 'auto';
        }}
        // Add window resize handler
        onResize={() => {
          const newX = Math.max(0, Math.min(window.innerWidth - 900, position.x));
          const newY = Math.max(0, Math.min(window.innerHeight - 100, position.y));
          setPosition({ x: newX, y: newY });
        }}
      >
        <motion.div 
          className={`backdrop-blur-xl shadow-2xl overflow-hidden ${
            isDragging ? 'dragging pointer-events-none select-none' : ''
          }`}
          style={{
            margin: '0 auto',
            contain: 'layout style paint',
            isolation: 'isolate',
            WebkitUserDrag: 'none',
            touchAction: 'none',
          }}
          animate={{
            scale: isDragging ? 1.02 : 1,
            width: isCollapsed ? 200 : 900,
            maxWidth: isCollapsed ? 200 : 900,
            backgroundColor: isCollapsed ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.8)',
            borderRadius: isCollapsed ? '12px 0 0 12px' : '12px',
            border: isCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
          }}
          transition={{
            duration: 0.6,
            ease: [0.25, 0.46, 0.45, 0.94],
            scale: { duration: 0.2, ease: "easeOut" },
            width: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
            maxWidth: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
            backgroundColor: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
            borderRadius: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
            border: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }
          }}
        >
          <motion.div 
            key={clearKey} 
            className={isCollapsed ? "p-4" : "p-6 space-y-4"}
            animate={{
              padding: isCollapsed ? '16px' : '24px',
            }}
            transition={{
              duration: 0.6,
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
          >
            {/* Header */}
            <motion.div 
              className="flex items-center justify-between"
              animate={{
                gap: isCollapsed ? '8px' : '16px',
              }}
              transition={{
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
            >
              <div className="flex items-center space-x-4">
                <motion.div 
                  className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 p-0.5 shadow-lg shadow-blue-500/20"
                  animate={{
                    width: isCollapsed ? '32px' : '48px',
                    height: isCollapsed ? '32px' : '48px',
                  }}
                  transition={{
                    duration: 0.6,
                    ease: [0.25, 0.46, 0.45, 0.94]
                  }}
                >
                  <motion.div 
                    className="w-full h-full bg-black/20 backdrop-blur-xl flex items-center justify-center"
                    animate={{
                      borderRadius: isCollapsed ? '8px' : '10px',
                    }}
                    transition={{
                      duration: 0.6,
                      ease: [0.25, 0.46, 0.45, 0.94]
                    }}
                  >
                    <motion.svg 
                      className="text-white" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor"
                      animate={{
                        width: isCollapsed ? '16px' : '24px',
                        height: isCollapsed ? '16px' : '24px',
                      }}
                      transition={{
                        duration: 0.6,
                        ease: [0.25, 0.46, 0.45, 0.94]
                      }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84" />
                    </motion.svg>
                  </motion.div>
                </motion.div>
                {!isCollapsed && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs bg-white/10 rounded-full px-2 py-0.5 text-gray-300">⌘/ to toggle</span>
                    <span className="text-xs bg-white/10 rounded-full px-2 py-0.5 text-gray-300">↵ to submit</span>
                    <span className="text-xs bg-white/10 rounded-full px-2 py-0.5 text-gray-300">⌘C to clear</span>
                  </div>
                )}
                {isCollapsed && (
                  <motion.div 
                    className="text-gray-700 font-medium text-sm"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    AI Assistant
                  </motion.div>
                )}
              </div>
              <div className="flex items-center no-drag">
                {!isCollapsed && (
                  <>
                    <button
                      onClick={() => setShowMemory(true)}
                      className="px-3 py-1.5 bg-purple-500/90 hover:bg-purple-600/90 rounded-xl text-white text-sm font-medium transition-all duration-200 flex items-center gap-1.5 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 whitespace-nowrap backdrop-blur-sm mr-2"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Memory
                    </button>
                    <button
                      onClick={() => setShowLearningPersona(true)}
                      className="px-3 py-1.5 bg-green-500/90 hover:bg-green-600/90 rounded-xl text-white text-sm font-medium transition-all duration-200 flex items-center gap-1.5 shadow-lg shadow-green-500/20 hover:shadow-green-500/30 whitespace-nowrap backdrop-blur-sm mr-2"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      Learning
                    </button>
                  </>
                )}
                {!isCollapsed && (
                  <ModeToggle 
                    isActiveMode={isActiveMode} 
                    onToggle={() => {
                      setIsActiveMode(!isActiveMode);
                    }} 
                  />
                )}
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className={`ml-2 w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-all duration-200 ${
                    isCollapsed 
                      ? 'bg-gray-200/80 hover:bg-gray-300/80 text-gray-700' 
                      : 'bg-white/10 text-white/80 hover:text-white'
                  }`}
                  title={isCollapsed ? "Expand CommandBar" : "Collapse CommandBar"}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
                  </svg>
                </button>
              </div>
            </motion.div>

            {/* Selected Text Indicator */}
            <AnimatePresence>
              {selectedText && !isCollapsed && (
                <motion.div 
                  className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-3 mb-3 w-full"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span className="text-yellow-300 text-sm font-medium">Selected Text:</span>
                  </div>
                  <button
                    onClick={() => setSelectedText('')}
                    className="text-yellow-400 hover:text-yellow-300 transition-colors"
                    title="Clear selection"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="text-yellow-200 text-sm mt-1 italic w-full break-words">
                  "{selectedText.length > 150 ? selectedText.substring(0, 150) + '...' : selectedText}"
                </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div 
                  className="relative no-drag -mx-6 px-6"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                <textarea
                  ref={inputRef}
                  className="w-full bg-white/5 rounded-2xl px-4 py-[10px] pr-[160px] text-[12px] text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[45px] max-h-[100px] resize-none overflow-y-auto leading-relaxed backdrop-blur-sm"
                  placeholder={selectedText ? "Ask about the selected text or anything on your screen..." : "Ask about anything on your screen..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleQuery();
                    }
                  }}
                  style={{ scrollbarWidth: 'none' }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {(response || error) && (
                    <button
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white/90 text-sm font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap backdrop-blur-sm"
                      onClick={clearConversation}
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                  )}
                  <button
                    className="px-3 py-1.5 bg-blue-500/90 hover:bg-blue-600/90 rounded-xl text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 whitespace-nowrap backdrop-blur-sm"
                    onClick={handleQuery}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        <span>Processing</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9.5l8 5-8 5V9.5z" />
                        </svg>
                        <span>Ask</span>
                      </>
                    )}
                  </button>
                </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Response */}
            <AnimatePresence>
              {!isCollapsed && (
                <>
                {/* If in interactive tutoring mode, render ONLY the step-by-step overlay and nothing else */}
                {isInteractiveTutoring && !isCollapsed ? (
                  <CollapsibleTutoringSteps
                    isVisible={isInteractiveTutoring}
                    content={tutoringContent}
                    onClose={() => {
                      setIsInteractiveTutoring(false);
                      setTutoringContent(null);
                      setTutoringSessionId(null);
                    }}
                  />
                ) : (
                  <>
                    {/* Add Memory Display */}
                    {!isInteractiveTutoring && !isCollapsed && (
                      <MemoryDisplay
                        isVisible={showMemory}
                        onClose={() => setShowMemory(false)}
                      />
                    )}

                    {/* Add Learning Persona Display */}
                    {!isInteractiveTutoring && !isCollapsed && (
                      <LearningPersonaDisplay
                        isVisible={showLearningPersona}
                        onClose={() => setShowLearningPersona(false)}
                      />
                    )}

                    {/* Response - Show in both regular and active mode */}
                    {(response || error || isLoading) && !isCollapsed && (
                      <AnimatePresence>
                        <motion.div
                          key="response-content"
                          data-current-response="true"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ 
                            opacity: 0, 
                            y: -10, 
                            transition: { duration: 0.2, ease: "easeInOut" }
                          }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-white/5 p-4 text-sm"
                          style={{
                            contain: 'layout style paint',
                            isolation: 'isolate',
                            willChange: 'opacity, transform'
                          }}
                        >
                          {isLoading ? (
                            <div className="flex items-center space-x-2">
                              <motion.div
                                className="w-2 h-2 bg-blue-500 rounded-full"
                                animate={{ scale: [1, 1.5, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              />
                              <motion.div
                                className="w-2 h-2 bg-purple-500 rounded-full"
                                animate={{ scale: [1, 1.5, 1] }}
                                transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                              />
                              <motion.div
                                className="w-2 h-2 bg-pink-500 rounded-full"
                                animate={{ scale: [1, 1.5, 1] }}
                                transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                              />
                              <span className="text-blue-400">Analyzing your screen...</span>
                            </div>
                          ) : error ? (
                            <div className="text-red-400">{error}</div>
                          ) : (
                            <div className="space-y-4">
                              {/* Text Response */}
                              {response && (
                                <AssistantErrorBoundary
                                  fallback={<div className="text-white/80">Unable to render rich response. Showing plain text.</div>}
                                >
                                  <CollapsibleCards 
                                    markdown={response}
                                    isActiveMode={isActiveMode}
                                    openFirstByDefault={false}
                                    className="max-w-none"
                                  />
                                </AssistantErrorBoundary>
                              )}
                            </div>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </>
                )}
                </>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
        
        {showTabGrouping && !isCollapsed && (
          <TabGrouping onClose={() => setShowTabGrouping(false)} />
        )}
      </motion.div>
    </>
  );
}
