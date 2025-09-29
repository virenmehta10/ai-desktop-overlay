import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// mode toggle component
// - displays a button that switches between "active understanding" and "regular mode"
// - shows compact or default variants based on the `variant` prop
// - uses framer motion for subtle hover/tap animations and state transitions

export default function ModeToggle({ isActiveMode, onToggle, variant = 'default' }) {
  // click handler to prevent parent handlers and trigger the provided toggle callback
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };

  // whether to render the compact sizing preset
  const isCompact = variant === 'compact';
  // tailwind classes for sizing and rounding depending on the variant
  const sizeClasses = isCompact
    ? 'px-2 py-1 rounded-md text-[11px]'
    : 'px-3 py-1.5 rounded-lg text-[12px]';

  // text label changes based on compact mode and current active state
  const label = isCompact
    ? (isActiveMode ? 'Active' : 'Regular')
    : (isActiveMode ? 'Active Understanding' : 'Regular Mode');

  return (
    <div className="flex items-center gap-2">
      {/* main toggle button with motion interactions and conditional styling */}
      <motion.button
        onClick={handleClick}
        className={`
          relative overflow-hidden flex items-center gap-2 
          ${sizeClasses} border transition-all duration-300
          font-medium tracking-wide whitespace-nowrap
          cursor-pointer z-10 max-w-[160px]
          ${isActiveMode 
            ? 'border-blue-500/30 bg-gradient-to-r from-blue-500/15 to-purple-500/15 text-blue-600 hover:bg-blue-500/20' 
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }
        `}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        layout
      >
        {/* content wrapper keeps icon and label on top of any background effects */}
        <motion.div className="relative z-10 flex items-center gap-1 overflow-hidden">
          {/* icon block rotates slightly when active; swaps between two svgs */}
          <motion.div
            initial={false}
            animate={{ 
              rotate: isActiveMode ? 360 : 0,
              scale: isActiveMode ? 1.05 : 1
            }}
            transition={{ duration: 0.3 }}
          >
            {isActiveMode ? (
              <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            )}
          </motion.div>
          {/* text label reflects the current mode */}
          <span className="font-medium truncate">{label}</span>
        </motion.div>
      </motion.button>
      {/* detail callout on the right only shows in default (non-compact) variant */}
      {!isCompact && (
        <AnimatePresence mode="wait">
          {isActiveMode ? (
            <motion.div
              key="active"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
              className="px-2 py-1 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-center flex items-center"
            >
              <span className="text-[11px] bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-medium whitespace-nowrap">
                Comprehensive explanations
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="regular"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
              className="px-2 py-1 rounded-lg bg-gradient-to-r from-blue-400/10 to-indigo-400/10 border border-blue-300/20 text-center flex items-center"
            >
              <span className="text-[11px] bg-gradient-to-r from-blue-200 to-indigo-200 bg-clip-text text-transparent font-medium whitespace-nowrap">
                Quick answers
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
} 