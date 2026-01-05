import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessMath, mathConfig } from '../utils/mathPreprocessor';
import { learningTools } from '../services/learning-tools';

export default function LearningOverlay({ 
  isVisible, 
  content, 
  onClose,
  position = { x: 20, y: 20 },
  isActiveMode = false
}) {
  const [activeSession, setActiveSession] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [notes, setNotes] = useState('');
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [checkpoints, setCheckpoints] = useState([]);
  const [progress, setProgress] = useState(0);
  const [openSections, setOpenSections] = useState([]);

  useEffect(() => {
    if (content?.learningSession) {
      setActiveSession(content.learningSession);
      setConcepts(content.concepts || []);
      setCheckpoints(content.checkpoints || []);
      setProgress(content.progress || 0);
    }
  }, [content]);

  function parseSections(markdown) {
    if (!markdown) return [];
    const sectionRegex = /\*\*(.+?)\*\*\n([\s\S]*?)(?=(\n\*\*|$))/g;
    const sections = [];
    let match;
    while ((match = sectionRegex.exec(markdown)) !== null) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim()
      });
    }
    return sections;
  }

  const sections = isActiveMode && content?.explanation ? parseSections(content.explanation) : null;

  useEffect(() => {
    if (sections && sections.length > 0) {
      setOpenSections([sections[0].title]);
    }
  }, [content?.explanation]);

  const toggleSection = (title) => {
    setOpenSections((prev) =>
      prev.includes(title)
        ? prev.filter((t) => t !== title)
        : [...prev, title]
    );
  };

  const handleConceptClick = (concept) => {
    // Request deeper explanation of the concept
    if (window.electron?.captureScreenOnce) {
      window.electron.captureScreenOnce().then(screenCapture => {
        fetch('http://localhost:3000/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `Please explain the concept of "${concept}" in more detail, with examples and analogies.`,
            screenCapture,
            timestamp: Date.now()
          })
        });
      });
    }
  };

  const handleSaveNotes = async () => {
    if (activeSession) {
      await learningTools.trackProgress('notes', {
        success: true,
        content: notes,
        concepts: concepts,
        timestamp: Date.now()
      });
    }
  };

  const handleCheckpointComplete = async (checkpoint) => {
    if (activeSession) {
      await learningTools.trackProgress('checkpoint', {
        success: true,
        checkpoint,
        timestamp: Date.now()
      });
      
      // Update checkpoints
      setCheckpoints(prev => 
        prev.map(cp => 
          cp.id === checkpoint.id 
            ? { ...cp, completed: true }
            : cp
        )
      );
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ 
            opacity: 1, 
            scale: 1
          }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-2xl p-6 w-full border border-blue-200 dark:border-gray-700"
          style={{
            maxHeight: '80vh',
            overflow: 'auto'
          }}
        >
          {/* Motivational Header */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <h2 className="text-xl font-bold text-blue-800 dark:text-blue-200">🌟 You're Learning Something Amazing! 🌟</h2>
            </div>
            <p className="text-blue-600 dark:text-blue-300 text-sm">Your best teacher is here to help you understand everything!</p>
          </div>

          {/* Main Content Area */}
          <div className="space-y-6">
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Learning Progress: {Math.round(progress)}%</span>
            </div>

            {/* Content as collapsible cards in active mode */}
            {isActiveMode && sections && sections.length > 0 ? (
              <div className="space-y-3">
                {sections.map((section, idx) => (
                  <div key={section.title} className="border border-blue-200 dark:border-gray-600 rounded-xl shadow-lg bg-white dark:bg-gray-900 overflow-hidden">
                    <button
                      className="w-full flex justify-between items-center px-4 py-4 font-semibold text-left text-lg focus:outline-none hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900 dark:hover:to-indigo-900 transition-all duration-200"
                      onClick={() => toggleSection(section.title)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                          {idx + 1}
                        </div>
                        <span className="text-blue-800 dark:text-blue-200">{section.title}</span>
                      </div>
                      <svg className={`w-5 h-5 ml-2 transition-transform text-blue-600 ${openSections.includes(section.title) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSections.includes(section.title) && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="px-4 pb-4 pt-2 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/20"
                        >
                          <ReactMarkdown
                            {...mathConfig}
                            className="prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none"
                          >
                            {preprocessMath(section.content)}
                          </ReactMarkdown>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            ) : (
              // Fallback: render the full response as a single card
              <div className="border border-blue-200 dark:border-gray-600 rounded-xl shadow-lg bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                      📚
                    </div>
                    <span className="text-blue-800 dark:text-blue-200 font-semibold text-lg">Your Amazing Learning Response!</span>
                  </div>
                </div>
                <div className="px-4 pb-4 pt-2 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/20">
                  <div className="prose dark:prose-invert max-w-none prose-ul:list-none prose-ol:list-none">
                    <ReactMarkdown
                      {...mathConfig}
                      className="prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none"
                    >
                      {preprocessMath(content?.explanation || '')}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* Key Concepts */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">🌟 Key Concepts You're Mastering!</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {concepts.map((concept, index) => (
                  <button
                    key={index}
                    onClick={() => handleConceptClick(concept)}
                    className="px-4 py-2 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 rounded-full text-sm font-medium text-blue-800 dark:text-blue-200 hover:from-blue-200 hover:to-indigo-200 dark:hover:from-blue-800 dark:hover:to-indigo-800 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    ✨ {concept}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">📝 Your Learning Notes</h3>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                className="w-full h-32 p-3 border border-green-200 dark:border-green-700 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 placeholder-green-500 dark:placeholder-green-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all duration-200"
                placeholder="Write down your thoughts, questions, or insights here... ✨"
              />
            </div>

            {/* Checkpoints */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200">🎯 Your Learning Journey</h3>
              </div>
              <div className="space-y-3">
                {checkpoints.map((checkpoint, index) => (
                  <div 
                    key={index}
                    className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-200 ${
                      checkpoint.completed 
                        ? 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200 dark:border-green-700' 
                        : 'bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 border border-purple-200 dark:border-purple-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checkpoint.completed}
                      onChange={() => handleCheckpointComplete(checkpoint)}
                      className={`w-5 h-5 rounded border-2 transition-all duration-200 ${
                        checkpoint.completed 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'border-purple-300 dark:border-purple-600'
                      }`}
                    />
                    <span className={`font-medium ${
                      checkpoint.completed 
                        ? 'text-green-800 dark:text-green-200 line-through' 
                        : 'text-purple-800 dark:text-purple-200'
                    }`}>
                      {checkpoint.completed ? '✅ ' : '🎯 '}{checkpoint.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>


        </motion.div>
      )}
    </AnimatePresence>
  );
} 