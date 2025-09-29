import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessMath, mathConfig } from '../utils/mathPreprocessor';

export default function InteractiveTutoringOverlay({ 
  isVisible, 
  content, 
  onClose,
  position = { x: 20, y: 20 },
  onUserResponse,
  onAdvanceStep,
  onEndSession
}) {
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [questionContext, setQuestionContext] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (content?.sessionId) {
      setSessionId(content.sessionId);
    }
  }, [content]);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  useEffect(() => {
    // Initialize with the AI's problem-solving steps
    if (content?.explanation && messages.length === 0) {
      const initialMessage = {
        id: 'initial',
        type: 'ai',
        content: content.explanation,
        timestamp: new Date()
      };
      setMessages([initialMessage]);
    }
  }, [content?.explanation, messages.length]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isWaitingForAI) return;

    const userMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: currentInput,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentInput('');
    setIsWaitingForAI(true);

    try {
      // Send user response to AI and get feedback
      const response = await fetch('/api/tutoring/interactive-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userResponse: currentInput,
          questionContext: content?.explanation || '',
          conversationHistory: messages
        })
      });

      if (response.ok) {
        const aiResponse = await response.json();
        const aiMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: aiResponse.feedback,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        // Fallback response if API fails
        const fallbackMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: "Thank you for sharing your thoughts! I can see you're thinking about this carefully. Let me help guide you through this step by step. What specific part of the question would you like to focus on first?",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, fallbackMessage]);
      }
    } catch (error) {
      console.error('Error getting AI feedback:', error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: "I appreciate you sharing your thinking! Let's work through this together. What aspect of the question would you like to explore first?",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsWaitingForAI(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">🎯 Problem-Solving Steps</h2>
              <p className="text-blue-100 mt-1">
                Clear, detailed steps to solve this problem effectively
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-lg p-4 ${
                  message.type === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                  <div className="prose max-w-none prose-ul:list-none prose-ol:list-none">
                    <ReactMarkdown
                      {...mathConfig}
                      className={`prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none ${
                        message.type === 'user' ? 'text-white' : 'text-gray-700'
                      } leading-relaxed`}
                    >
                      {preprocessMath(message.content)}
                    </ReactMarkdown>
                  </div>
                  <div className={`text-xs mt-2 ${
                    message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {formatTimestamp(message.timestamp)}
                  </div>
                </div>
              </motion.div>
            ))}
            
            {isWaitingForAI && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-sm text-gray-600">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t bg-white p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex space-x-4">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Share your thoughts, ask questions, or explain your reasoning..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  disabled={isWaitingForAI}
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">
                    Press Enter to send, Shift+Enter for new line
                  </span>
                  <span className="text-xs text-gray-500">
                    {currentInput.length} characters
                  </span>
                </div>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!currentInput.trim() || isWaitingForAI}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
              >
                {isWaitingForAI ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 