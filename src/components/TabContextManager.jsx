import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function TabContextManager({ isVisible, onClose, onTabsSelected }) {
  const [tabs, setTabs] = useState([]);
  const [selectedTabs, setSelectedTabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isVisible) {
      loadTabs();
    }
  }, [isVisible]);

  const loadTabs = async () => {
    setLoading(true);
    setError(null);
    try {
      const tabsData = await window.electron.getCurrentTabs();
      setTabs(tabsData || []);
    } catch (err) {
      console.error('Failed to load tabs:', err);
      setError('Failed to load browser tabs. Make sure Chrome is running.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTabSelection = (tab) => {
    setSelectedTabs(prev => {
      const isSelected = prev.some(t => t.id === tab.id);
      if (isSelected) {
        return prev.filter(t => t.id !== tab.id);
      } else {
        return [...prev, tab];
      }
    });
  };

  const handleConfirm = () => {
    if (selectedTabs.length > 0) {
      onTabsSelected(selectedTabs);
      onClose();
    }
  };

  const getTabIcon = (url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('docs.google.com')) {
        return 'Doc'; // Google Docs
      } else if (urlObj.hostname.includes('github.com')) {
        return 'Git'; // GitHub
      } else if (urlObj.hostname.includes('youtube.com')) {
        return 'YT'; // YouTube
      } else if (urlObj.hostname.includes('mail.google.com')) {
        return 'Mail'; // Gmail
      } else if (urlObj.hostname.includes('outlook.com') || urlObj.hostname.includes('mail.yahoo.com')) {
        return 'Mail'; // Email services
      } else if (urlObj.hostname.includes('notion.so')) {
        return 'Note'; // Notion
      } else if (urlObj.hostname.includes('slack.com')) {
        return 'Chat'; // Slack
      } else {
        return 'Web'; // Default web
      }
    } catch {
      return 'Web';
    }
  };

  const getTabDomain = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Unknown';
    }
  };

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg overflow-hidden mb-4"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Select Browser Tabs</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 text-sm">Loading tabs...</span>
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <div className="text-red-500 text-sm mb-2">{error}</div>
            <button
              onClick={loadTabs}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Selected Tabs Summary */}
            {selectedTabs.length > 0 && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2 text-sm">
                  {selectedTabs.length} tab{selectedTabs.length !== 1 ? 's' : ''} selected
                </h4>
                <div className="flex flex-wrap gap-1">
                  {selectedTabs.map(tab => (
                    <span
                      key={tab.id}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center gap-1"
                    >
                      {getTabIcon(tab.url)} {tab.title.substring(0, 20)}...
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs List */}
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {tabs.map(tab => {
                const isSelected = selectedTabs.some(t => t.id === tab.id);
                return (
                  <motion.div
                    key={tab.id}
                    className={`p-2 rounded-lg border cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => toggleTabSelection(tab)}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTabSelection(tab)}
                          className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex-shrink-0 text-sm">
                        {getTabIcon(tab.url)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate text-sm">
                          {tab.title}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {getTabDomain(tab.url)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedTabs.length === 0}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Attach {selectedTabs.length} Tab{selectedTabs.length !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
} 