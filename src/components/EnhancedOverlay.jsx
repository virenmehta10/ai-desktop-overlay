import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import KaTeX from 'katex';
import ModeToggle from './ModeToggle';
import CollapsibleCards from './CollapsibleCards';

// Configure KaTeX
const katexOptions = {
  strict: false,
  throwOnError: false,
  displayMode: false,
  output: 'html'
};

export default function EnhancedOverlay() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const [isActiveMode, setIsActiveMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Load position from localStorage or use default
  const [position, setPosition] = useState(() => {
    const savedPosition = localStorage.getItem('overlay-position');
    let x = Math.max(0, (window.innerWidth - 600) / 2);
    let y = 0; // Always start at the very top
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        x = Math.max(0, Math.min(parsed.x, window.innerWidth - 600));
        // y is always 0
      } catch (e) {
        console.error('Failed to parse saved position:', e);
      }
    }
    return { x, y };
  });
  
  const [clearKey, setClearKey] = useState(0); // Add key for forcing re-render

  // Initialize speech recognition
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const clearAll = () => {
    setQuery('');
    setResponse('');
    setError(null);
    setIsLoading(false);
    setIsTranscribing(false);
    setIsListening(false);
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setClearKey(prevKey => prevKey + 1); // Force re-render of components using this key
  };

  // Save position to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('overlay-position', JSON.stringify(position));
  }, [position]);

  useEffect(() => {
    const clearPromptUnsubscribe = window.electron?.onClearPrompt?.(clearAll);

    const explainTextUnsubscribe = window.electron?.onExplainText?.(async () => {
      const selectedText = await window.electron.getSelectedText();
      if (selectedText) {
        setQuery('explain this');
        handleQuery('explain this', selectedText);
      }
    });

    return () => {
      clearPromptUnsubscribe?.();
      explainTextUnsubscribe?.();
    };
  }, []);

  // Browser-based audio recording logic
  const toggleListening = async () => {
    console.log('toggleListening called, current state:', { isListening, isTranscribing });
    
    if (isListening) {
      // Stop recording
      console.log('Stopping recording...');
      setIsListening(false);
      setIsTranscribing(true);
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    } else {
      // Start recording
      console.log('Starting recording...');
      setIsListening(true);
      setIsTranscribing(false);
      audioChunksRef.current = [];
      
      // Use browser-based recording (more reliable)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          } 
        });
        
        // Use simple MediaRecorder without complex format detection
        const mediaRecorder = new window.MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            console.log('Audio chunk received, size:', event.data.size);
          }
        };
        
        mediaRecorder.onstop = async () => {
          console.log('MediaRecorder stopped, processing audio...');
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          console.log('Audio blob created, size:', audioBlob.size);
          
          // Check if we have enough audio data
          if (audioBlob.size < 1024) {
            console.log('Audio too small, likely no speech detected');
            setError('No speech detected. Please speak louder or longer.');
            setIsTranscribing(false);
            return;
          }
          
          // Send audioBlob to backend for transcription
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          
          // Add timeout for transcription request
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('Transcription request timed out');
            controller.abort();
          }, 30000); // 30 second timeout
          
          try {
            console.log('Sending transcription request...');
            const response = await fetch('http://localhost:3001/api/transcribe', {
              method: 'POST',
              body: formData,
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('Transcription response received:', response.status);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Transcription data:', data);
            
            if (data.success && data.transcription) {
              console.log('Transcription successful:', data.transcription);
              setQuery(data.transcription);
              await handleQuery(data.transcription);
            } else {
              console.log('Transcription failed:', data.error);
              setError(data.error || 'Transcription failed');
            }
          } catch (err) {
            clearTimeout(timeoutId);
            console.error('Transcription error:', err);
            if (err.name === 'AbortError') {
              setError('Transcription timed out. Please try again.');
            } else {
              setError(`Transcription failed: ${err.message}`);
            }
          } finally {
            console.log('Setting isTranscribing to false');
            setIsTranscribing(false);
          }
        };
        
        mediaRecorder.start(1000); // Collect data every second
        console.log('MediaRecorder started');
      } catch (err) {
        console.error('Error accessing microphone:', err);
        setError('Could not access microphone. Please check permissions.');
        setIsListening(false);
        setIsTranscribing(false);
      }
    }
  };

  const handleQuery = async (text, selectedText = null) => {
    if (!text?.trim()) return;
    setIsLoading(true);
    setError(null);
    setResponse('');

    try {
      // Check if it's a command that doesn't need screen capture
      const isCommandWithoutScreenCapture = 
        text.toLowerCase().includes('spotify') || 
        text.toLowerCase().match(/^(?:can you )?(?:please )?(?:text|message|send)/i) ||
        text.toLowerCase().match(/^(?:can you )?(?:please )?(?:open|launch|start|close|quit|exit)/i) ||
        text.toLowerCase().match(/^(?:can you )?(?:please )?(?:get|find|search for|open) (?:a )?youtube video (?:to learn about|about|on)/i);
      
      // Check if it's a screen-based YouTube command that needs screen capture
      const isScreenBasedYouTubeCommand = 
        text.toLowerCase().match(/^(?:can you )?(?:please )?(?:open|get|find|search for) (?:a )?youtube video (?:to help me understand this|to help me learn this|about this|on this)$/i);

      let requestBody = {
        query: text,
        timestamp: Date.now(),
        isActiveMode: isActiveMode,
        selectedText
      };

      // Add screen capture for non-command queries or screen-based YouTube commands
      if (!isCommandWithoutScreenCapture || isScreenBasedYouTubeCommand) {
        try {
          // Always get a fresh screen capture for non-command queries
          const capture = await window.electron.captureScreenOnce();
          
          if (capture.error) {
            console.error('Screen capture error:', capture.error);
            setError('Failed to capture screen. Please try again or use a command that doesn\'t require screen capture.');
            setIsLoading(false);
            return;
          }

          // Ensure we have the required dataURL property
          if (!capture.dataURL) {
            console.error('No dataURL in capture:', capture);
            setError('Failed to capture screen content. Please try again.');
            setIsLoading(false);
            return;
          }
          
          requestBody.screenCapture = {
            dataURL: capture.dataURL,
            timestamp: capture.timestamp || Date.now(),
            name: capture.name || 'screen',
            id: capture.id || 'main'
          };
        } catch (error) {
          console.error('Screen capture error:', error);
          setError('Failed to capture screen. Please try again or use a command that doesn\'t require screen capture.');
          setIsLoading(false);
          return;
        }
      }

      console.log('Sending request with isActiveMode:', isActiveMode);
      const response = await fetch('http://localhost:3001/api/ai', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || errorJson.message || 'Failed to get AI response');
        } catch (e) {
          throw new Error(errorText || 'Failed to get AI response');
        }
      }

      // Check if it's a JSON response (for commands) or streaming response (for AI analysis)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.needsAuth && data.authUrl) {
          handleSpotifyAuth(data.authUrl);
        }
        setResponse(data.response || data.content || '');
        setIsLoading(false);
        return;
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let isDone = false;

      while (!isDone) {
        const { value, done } = await reader.read();
        if (done) {
          isDone = true;
          continue;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              isDone = true;
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.content) {
                fullResponse += parsed.content;
                setResponse(fullResponse);
              }
            } catch (e) {
              if (e.message !== 'Unexpected end of JSON input') throw e;
            }
          }
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setError(error.message || 'Failed to get response');
      setResponse('');
      setIsLoading(false);
    }
  };

  const handleSpotifyAuth = (authUrl) => {
    // Open Spotify auth in a new window
    const width = 450;
    const height = 730;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    window.open(
      authUrl,
      'Spotify Login',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleAIResponse = async (query) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          screenCapture: null,
          selectedText: null,
          timestamp: Date.now(),
          isActiveMode: isActiveMode
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      if (data.needsAuth && data.authUrl) {
        handleSpotifyAuth(data.authUrl);
      }
      
      setResponse(data.response || data.content);
    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Add a function to process math expressions
  const processMathExpression = (text) => {
    if (!text) return text;

    // Helper function to wrap math content
    const wrapMath = (content, isDisplay = false) => {
      return isDisplay ? `$$ ${content} $$` : `$ ${content} $`;
    };

    // First pass: protect any properly formatted math
    let processed = text.replace(/\$\$(.*?)\$\$/g, '%%DISPLAY_MATH%%$1%%DISPLAY_MATH%%')
                      .replace(/\$(.*?)\$/g, '%%INLINE_MATH%%$1%%INLINE_MATH%%');

    // Second pass: fix specific patterns
    processed = processed
      // Fix trig expressions with ratios
      .replace(/Sine \(\(\\?sin\)\): .*?\\sin\(?\$?\\?theta\$?\)? = \\frac{([^}]*)}{([^}]*)} =\\frac{(\d+)}{(\d+)}/g,
        `Sine (sin): ${wrapMath('\\sin(\\theta) = \\frac{\\text{$1}}{\\text{$2}} = \\frac{$3}{$4}')}`)
      .replace(/Cosine \(\(\\?cos\)\): .*?\\cos\(?\$?\\?theta\$?\)? = \\frac{([^}]*)}{([^}]*)}/g,
        `Cosine (cos): ${wrapMath('\\cos(\\theta) = \\frac{\\text{$1}}{\\text{$2}}')}`)
      .replace(/Tangent \(\(\\?tan\)\): .*?\\tan\(?\$?\\?theta\$?\)? = \\frac{([^}]*)}{([^}]*)}/g,
        `Tangent (tan): ${wrapMath('\\tan(\\theta) = \\frac{\\text{$1}}{\\text{$2}}')}`)
      // Fix standalone theta references
      .replace(/\$?\\?theta\$?/g, wrapMath('\\theta'))
      // Fix Pythagorean theorem
      .replace(/\((\d+)\^2 \+ (\d+)\^2 = (\d+)\^2\)/g,
        wrapMath('$1^2 + $2^2 = $3^2'))
      // Fix general fractions
      .replace(/\\frac{([^}]*)}{([^}]*)}/g,
        (_, num, den) => wrapMath(`\\frac{${num}}{${den}}`));

    // Restore protected math
    processed = processed
      .replace(/%%DISPLAY_MATH%%(.*?)%%DISPLAY_MATH%%/g, '$$$$1$$')
      .replace(/%%INLINE_MATH%%(.*?)%%INLINE_MATH%%/g, '$$1$')
      // Clean up any double dollar signs or spaces
      .replace(/\${2,}/g, '$$')
      .replace(/\s*\$/g, '$')
      .replace(/\$\s*/g, '$');

    return processed;
  };

  // Update the ReactMarkdown configuration
  const MarkdownComponents = {
    p: ({ node, ...props }) => <p className="mb-4" {...props} />,
    code: ({ node, inline, className, children, ...props }) => {
      if (className?.includes('math')) {
        const isInline = className.includes('math-inline');
        const content = String(children).replace(/\n/g, ' ').trim();
        
        return isInline ? (
          <span className="katex-inline" style={{ margin: '0 0.15em', display: 'inline-block' }}>
            {content}
          </span>
        ) : (
          <div className="katex-display" style={{ margin: '1em 0', display: 'block', overflow: 'auto' }}>
            {content}
          </div>
        );
      }
      
      return (
        <code className="bg-black/30 px-1 py-0.5 rounded" {...props}>
          {children}
        </code>
      );
    },
    strong: ({ node, children, ...props }) => {
      // If the strong tag is the only child in a paragraph, treat as a section header
      if (
        node?.parent?.type === 'paragraph' &&
        node.parent.children.length === 1
      ) {
        return <div className="mt-6 mb-2 text-xl font-bold text-blue-300">{children}</div>;
      }
      // Otherwise, render as normal strong
      return <strong className="font-bold text-blue-200" {...props}>{children}</strong>;
    },
  };

  return (
    <div 
      key={clearKey}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: 700,
        zIndex: 2147483647,
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        touchAction: 'none',
        cursor: 'move',
        willChange: 'left, top'
      }}
      onPointerDown={(e) => {
        const target = e.target;
        // Don't handle drag if clicking on input, buttons, or other interactive elements
        if (target.tagName === 'INPUT' || 
            target.tagName === 'BUTTON' || 
            target.closest('button') ||
            target.closest('.prose') ||
            (!target.closest('.draggable') && !target.closest('.header'))) {
          return;
        }
        
        e.preventDefault();
        const initialX = e.clientX - position.x;
        const initialY = e.clientY - position.y;
        
        const onPointerMove = (moveEvent) => {
          const newX = moveEvent.clientX - initialX;
          const newY = moveEvent.clientY - initialY;
          setPosition({ x: newX, y: newY });
        };
        
        const onPointerUp = () => {
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
        };
        
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
      }}
    >
      <div className="header bg-gradient-to-r from-black/90 to-black/80 border-b border-white/10 p-4 draggable">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 draggable">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84" />
              </svg>
            </div>
            <div className="flex gap-3">
              <div className="text-xs text-white/70 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60 font-medium">⌘/</kbd>
                <span>toggle</span>
              </div>
              <div className="text-xs text-white/70 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60 font-medium">⏎</kbd>
                <span>submit</span>
              </div>
              <div className="text-xs text-white/70 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60 font-medium">⌘C</kbd>
                <span>clear</span>
              </div>
            </div>
          </div>
          <div className="flex items-center no-drag">
            <ModeToggle 
              isActiveMode={isActiveMode} 
              onToggle={() => {
                setIsActiveMode(!isActiveMode);
              }} 
            />
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleQuery(query);
          }}
          className="relative"
        >
          <div className="relative flex flex-col gap-4">
            <div className="relative flex items-start">
              <div className="relative flex-1">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (query.trim()) {
                        handleQuery(query);
                      }
                    }
                  }}
                  placeholder={isActiveMode 
                    ? "Detailed explanations about on-screen topics." 
                    : "General questions about on-screen content."}
                  className={`
                    w-full backdrop-blur-xl rounded-2xl px-5 py-3
                    text-[15px] placeholder-white/50
                    focus:outline-none focus:ring-2 transition-all duration-300
                    min-h-[45px] max-h-[100px] resize-none overflow-y-auto leading-relaxed
                    shadow-[inset_0_0_20px_rgba(0,0,0,0.1)]
                    bg-white/[0.07]
                    hover:bg-white/[0.09]
                    border border-white/10
                    text-white/90
                    focus:ring-white/20
                    focus:border-white/20
                  `}
                  style={{ 
                    paddingRight: '300px', // Increased right padding for more space from the edge and buttons
                    scrollbarWidth: 'none',
                    boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.1)',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                  }}
                />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <motion.button
                    onClick={toggleListening}
                    className={`
                      px-3 py-1.5 rounded-xl font-medium text-sm
                      transition-all duration-300 flex items-center gap-2
                      ${isListening
                        ? 'bg-red-500 text-white hover:opacity-90'
                        : isTranscribing
                        ? 'bg-blue-500 text-white hover:opacity-90'
                        : 'bg-white/10 text-white/90 hover:bg-white/20'
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isTranscribing}
                  >
                    {isListening ? (
                      <>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        Listening...
                      </>
                    ) : isTranscribing ? (
                      <>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        Transcribing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Speak
                      </>
                    )}
                  </motion.button>
                  <motion.button
                    onClick={() => handleQuery(query)}
                    className={`
                      px-4 py-1.5 rounded-xl font-medium text-sm
                      transition-all duration-300 flex items-center gap-2
                      ${isActiveMode
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90'
                        : 'bg-white/10 text-white/90 hover:bg-white/20'
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Ask AI
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loader"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="response-container mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-white/5 p-4"
            >
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
            </motion.div>
          )}

          {error && !isLoading && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="response-container mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-white/5 p-4"
            >
              <div className="text-red-400">{error}</div>
            </motion.div>
          )}

          {response && !isLoading && !error && (
            <motion.div
              key="response"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="response-container mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-white/5 p-4"
            >
              <CollapsibleCards 
                markdown={response}
                isActiveMode={isActiveMode}
                className="max-w-none"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
