import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessMath, mathConfig } from '../utils/mathPreprocessor';

export default function CollapsibleCards({ 
  markdown, 
  isActiveMode = false,
  defaultOpenSections = [],
  className = "",
  onUserResponse,
  openFirstByDefault = true
}) {
  const safeMarkdown = typeof markdown === 'string' ? markdown : (markdown ? String(markdown) : '');
  const [openSections, setOpenSections] = useState(defaultOpenSections);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [inputs, setInputs] = useState({});
  const [sections, setSections] = useState(isActiveMode ? normalizeSectionTitles(parseSections(safeMarkdown)) : []);
  const [isLoadingStep, setIsLoadingStep] = useState(false);


  useEffect(() => {
    setSections(isActiveMode ? normalizeSectionTitles(parseSections(safeMarkdown)) : []);
  }, [safeMarkdown, isActiveMode]);

  function handleInputChange(idx, value) {
    setInputs(prev => ({ ...prev, [idx]: value }));
  }

  async function handleSubmit(idx) {
    if (!inputs[idx] || !inputs[idx].trim()) return;
    setIsLoadingStep(true);
    // Send to backend for AI feedback and next step
    const context = sections.slice(0, idx + 1).map(s => s.content).join('\n');
    try {
      const res = await fetch('/api/quiz/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userResponse: inputs[idx],
          stepIndex: idx,
          context
        })
      });
      const data = await res.json();
      // Add AI feedback as a new card, then next step as a new card (if any)
      const newSections = [...sections];
      if (data.aiFeedback) {
        newSections.push({ title: `AI Feedback for Step ${idx + 1}`, content: data.aiFeedback });
      }
      if (data.nextStepMarkdown) {
        // Parse the next step markdown into a section
        const nextStepSections = parseSections(data.nextStepMarkdown);
        newSections.push(...nextStepSections);
      }
      setSections(newSections);
      // Open the next section (AI feedback or next step)
      setOpenSections([newSections[newSections.length - 1].title]);
      setInputs({});
    } catch (e) {
      alert('Error getting AI feedback: ' + e.message);
    } finally {
      setIsLoadingStep(false);
    }
  }

  function renderSectionContent(section, idx) {
    const responseMarker = 'Your Response (Required):';
    if (section.content.includes(responseMarker)) {
      const [before, after] = section.content.split(responseMarker);
      return (
        <>
          <div style={{ pointerEvents: 'auto' }}>
            <ReactMarkdown
              {...mathConfig}
              className="prose prose-2xs max-w-none prose-ul:list-none prose-ol:list-none"
            >
              {preprocessMath(before)}
            </ReactMarkdown>
          </div>
          {openSections.includes(section.title) && (
            <motion.div 
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Your Response:
              </label>
              <textarea
                className="w-full p-3 border border-gray-200/60 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent resize-none text-gray-900 bg-white/80 shadow-sm hover:shadow-md transition-all duration-200 backdrop-blur-sm"
                rows={3}
                value={inputs[idx] || ''}
                onChange={e => setInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                placeholder="Type your answer here..."
                disabled={isLoadingStep}
                style={{ width: '100%', minWidth: '100%', maxWidth: '100%' }}
              />
              <div className="mt-2.5 flex justify-end">
                <button
                  className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  disabled={!inputs[idx] || !inputs[idx].trim() || isLoadingStep}
                  onClick={() => handleSubmit(idx)}
                >
                  {isLoadingStep ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </motion.div>
          )}
          {after && (
            <div style={{ pointerEvents: 'auto' }}>
              <ReactMarkdown
                {...mathConfig}
                className="prose prose-xs max-w-none mt-4 prose-ul:list-none prose-ol:list-none"
              >
                {preprocessMath(after)}
              </ReactMarkdown>
            </div>
          )}
        </>
      );
    }
    
    return (
      <div style={{ pointerEvents: 'auto' }}>
        <ReactMarkdown
          {...mathConfig}
          className="prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none"
        >
          {preprocessMath(section.content)}
        </ReactMarkdown>
      </div>
    );
  }

  // Enhanced interactive elements rendering
  function renderInteractiveElements(content) {
    // Look for patterns like "List Worksheets" or "Get Values in Range"
    const interactivePatterns = [
      {
        pattern: /(List Worksheets|Get Values in Range|Get Document)/g,
        render: (match) => (
          <motion.button
            key={match}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-100/80 to-purple-100/80 hover:from-indigo-200/80 hover:to-purple-200/80 text-indigo-700 rounded-lg transition-all duration-200 font-medium shadow-sm hover:shadow-md border border-indigo-200/50 backdrop-blur-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {match}
            <svg className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </motion.button>
        )
      }
    ];

    let enhancedContent = content;
    interactivePatterns.forEach(({ pattern, render }) => {
      enhancedContent = enhancedContent.replace(pattern, (match) => {
        return `__INTERACTIVE_${match}__`;
      });
    });

    // Split by interactive markers and render
    const parts = enhancedContent.split(/(__INTERACTIVE_.*?__)/);
    return parts.map((part, index) => {
      if (part.startsWith('__INTERACTIVE_') && part.endsWith('__')) {
        const match = part.replace(/__INTERACTIVE_(.*?)__/, '$1');
        return interactivePatterns[0].render(match);
      }
      return part;
    });
  }

  function parseSections(markdownText) {
    if (!markdownText || typeof markdownText !== 'string') return [];

    console.log('Parsing markdown for sections:', markdownText.substring(0, 200) + '...');
    
    const lines = markdownText.split('\n');
    const sections = [];
    let currentSection = null;

    function startNewSection(rawTitle) {
      const title = (rawTitle || '').trim() || `Section ${sections.length + 1}`;
      console.log('Starting new section:', title);
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { title, content: '' };
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      // Match bold-only line: **Title** (most important for our use case)
      const boldHeader = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
      if (boldHeader) {
        console.log('Found bold header:', boldHeader[1]);
        startNewSection(boldHeader[1]);
        continue;
      }

      // Match ATX headers: ## Title / ### Title, etc.
      const atxHeader = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
      if (atxHeader) {
        console.log('Found ATX header:', atxHeader[1]);
        startNewSection(atxHeader[1]);
        continue;
      }

      // Match Setext headers: Title on one line, then === or ---
      const isSetextUnderline = /^\s*(=+|-+)\s*$/.test(nextLine || '');
      if (line.trim().length > 0 && isSetextUnderline) {
        console.log('Found Setext header:', line);
        startNewSection(line);
        i++; // Skip underline line
        continue;
      }

      // Match colon-terminated headers: "Title:"
      const colonHeader = line.match(/^\s*([^:]{3,}):\s*$/);
      if (colonHeader) {
        console.log('Found colon header:', colonHeader[1]);
        startNewSection(colonHeader[1]);
        continue;
      }

      // Accumulate content
      if (!currentSection) {
        // Start a default section if content appears before any header
        console.log('No header found, starting default section');
        startNewSection('Response');
      }
      currentSection.content = currentSection.content
        ? currentSection.content + '\n' + line
        : line;
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    console.log('Parsed sections:', sections.map(s => ({ title: s.title, contentLength: s.content.length })));

    // Normalize: trim and drop empty sections, cap to avoid pathological splits
    const normalized = sections
      .map(s => ({
        title: (s.title || '').trim() || 'Section',
        content: (s.content || '').trim()
      }))
      .filter(s => s.content.length > 0)
      .slice(0, 20);

    if (normalized.length === 0) {
      console.log('No sections found, returning fallback');
      return [{ title: 'Response', content: markdownText }];
    }
    
    console.log('Final normalized sections:', normalized.map(s => s.title));
    return normalized;
  }

  function normalizeSectionTitles(rawSections) {
    if (!Array.isArray(rawSections) || rawSections.length === 0) return [];

    const expected = [
      'Brief Summary',
      "Explain Like I'm 8",
      'Deep Dive',
      'Real World Application',
      'Connections and Implications',
      'Key Takeaways and Next Steps'
    ];

    // If headers already match expected (prefix-insensitive), keep as is
    const titles = rawSections.map(s => (s.title || '').trim());
    const matchesExpected = titles.every((t, i) => expected[i] && t.toLowerCase().startsWith(expected[i].toLowerCase().slice(0, 6)));
    if (matchesExpected && rawSections.length === expected.length) return rawSections;

    // Fuzzy synonyms mapping
    const synonyms = {
      'core concept': 'Brief Summary',
      'summary': 'Brief Summary',
      'tl;dr': 'Brief Summary',
      "eli5": "Explain Like I'm 8",
      "explain like i'm five": "Explain Like I'm 8",
      'simple explanation': "Explain Like I'm 8",
      'in simple terms': "Explain Like I'm 8",
      'details': 'Deep Dive',
      'deep dive': 'Deep Dive',
      'technical details': 'Deep Dive',
      'real world context': 'Real World Application',
      'real-world context': 'Real World Application',
      'applications': 'Real World Application',
      'implications': 'Connections and Implications',
      'connections & implications': 'Connections and Implications',
      'takeaways': 'Key Takeaways and Next Steps',
      'next steps': 'Key Takeaways and Next Steps'
    };

    function normalizeTitle(t) {
      const lower = (t || '').toLowerCase();
      for (const key of Object.keys(synonyms)) {
        if (lower.includes(key)) return synonyms[key];
      }
      return null;
    }

    const bucket = new Map();
    for (const section of rawSections) {
      const normalized = normalizeTitle(section.title);
      if (normalized) {
        bucket.set(normalized, (bucket.get(normalized) || '') + (bucket.get(normalized) ? '\n\n' : '') + section.content);
      }
    }

    // If we have at least 3 normalized buckets, assemble in expected order
    if (bucket.size >= 3) {
      return expected
        .map(title => ({ title, content: (bucket.get(title) || '').trim() }))
        .filter(s => s.content.length > 0);
    }

    // As a fallback, map by position into expected order to enforce consistency
    const remapped = rawSections.map((s, idx) => ({
      title: expected[idx] || s.title || `Section ${idx + 1}`,
      content: s.content
    }));
    return remapped;
  }

  // Initialize open sections only once when sections are first available
  useEffect(() => {
    if (sections && sections.length > 0 && !hasInitialized) {
      if (defaultOpenSections.length === 0) {
        setOpenSections(openFirstByDefault ? [sections[0].title] : []);
      } else {
        setOpenSections(defaultOpenSections);
      }
      setHasInitialized(true);
    }
  }, [sections, defaultOpenSections, hasInitialized, openFirstByDefault]);

  // Reset state when markdown changes completely
  useEffect(() => {
    setHasInitialized(false);
    setOpenSections([]);
  }, [safeMarkdown]);

  // If not in active mode, render as regular markdown with enhanced interactive elements
  if (!isActiveMode) {
    return (
      <div className={className} style={{ pointerEvents: 'auto' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <ReactMarkdown
            {...mathConfig}
            className="prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none"
          >
            {preprocessMath(safeMarkdown)}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // Active mode rendering with collapsible sections
  return (
    <div className={`space-y-3 ${className}`} style={{ pointerEvents: 'auto' }}>
      {sections.length > 0 ? sections.map((section, idx) => (
        <motion.div
          key={section.title}
          className="bg-white border border-gray-200/60 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: idx * 0.05 }}
          style={{ pointerEvents: 'auto' }}
        >
          <motion.button
            className="w-full px-4 py-3 text-left bg-gradient-to-r from-gray-50/80 to-white hover:from-gray-100/80 hover:to-gray-50/80 transition-all duration-200 flex items-center justify-between group backdrop-blur-sm cursor-pointer"
            onClick={() => {
              setOpenSections(prev => 
                prev.includes(section.title) 
                  ? prev.filter(s => s !== section.title)
                  : [...prev, section.title]
              );
            }}
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.995 }}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-sm">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900">{section.title}</h3>
            </div>
            <motion.div
              animate={{ rotate: openSections.includes(section.title) ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-gray-400 group-hover:text-gray-600"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </motion.div>
          </motion.button>
          
          <AnimatePresence mode="wait">
            {openSections.includes(section.title) && (
              <motion.div
                key={`content-${section.title}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="px-4 pb-4 border-t border-gray-100/60 bg-gray-50/30"
                style={{ pointerEvents: 'auto' }}
              >
                <div className="pt-3">
                  {renderSectionContent(section, idx)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )) : (
        // Fallback: render as regular markdown when no sections are found
        <div style={{ pointerEvents: 'auto' }}>
          <ReactMarkdown
            {...mathConfig}
            className="prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none"
          >
            {preprocessMath(markdown)}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
} 