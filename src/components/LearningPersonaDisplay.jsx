import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LearningPersonaDisplay({ isVisible, onClose }) {
  const [persona, setPersona] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    if (isVisible) {
      fetchPersona();
    }
  }, [isVisible]);

  const fetchPersona = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/learning-persona');
      const data = await response.json();
      if (data.success) {
        setPersona(data.persona);
      }
    } catch (error) {
      console.error('Error fetching learning persona:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLearningStyleColor = (style) => {
    const colors = {
      visual: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      auditory: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      kinesthetic: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      balanced: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    };
    return colors[style] || colors.balanced;
  };

  const getConfidenceColor = (level) => {
    const colors = {
      high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return colors[level] || colors.medium;
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'learning', label: 'Learning', icon: '🎓' },
    { id: 'progress', label: 'Progress', icon: '📊' },
    { id: 'insights', label: 'Insights', icon: '💡' }
  ];

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              🎓 Learning Persona
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading persona...</span>
            </div>
          )}

          {/* Content */}
          {!loading && persona && (
            <div className="space-y-6">
              {/* Tabs */}
              <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="mr-2">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="overflow-y-auto max-h-[60vh]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === 'profile' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Basic Info</h3>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Name:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.profile.name || 'Not specified'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Current Role:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.profile.currentRole || 'Not specified'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Learning Style</h3>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getLearningStyleColor(persona.learningProfile.primaryLearningStyle)}`}>
                                  {persona.learningProfile.primaryLearningStyle}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Confidence:</span>
                                <span className={`ml-2 inline-block px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(persona.learningProfile.confidenceLevel)}`}>
                                  {persona.learningProfile.confidenceLevel}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Anxiety Level:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.learningProfile.anxietyLevel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'learning' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Learning Patterns</h3>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Optimal Session:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.learningPatterns.optimalSessionLength} minutes
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Best Time:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.learningPatterns.bestTimeOfDay}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Retention Rate:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {(persona.learningPatterns.retentionRate * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Adaptive Strategies</h3>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Feedback Style:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.adaptiveStrategies.feedbackStyle}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Encouragement:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.adaptiveStrategies.encouragementLevel}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Challenge Level:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                  {persona.adaptiveStrategies.challengeLevel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'progress' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              {persona.progressMetrics.totalLearningSessions}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Total Sessions</div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {(persona.progressMetrics.successRate * 100).toFixed(0)}%
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                              {persona.progressMetrics.averageSessionLength.toFixed(0)}m
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Avg Session</div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                              {(persona.progressMetrics.confidenceGrowth * 100).toFixed(0)}%
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Confidence Growth</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'insights' && (
                      <div className="space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Recent Insights</h3>
                          <div className="space-y-3">
                            {persona.recentInsights && persona.recentInsights.length > 0 ? (
                              persona.recentInsights.map((insight, index) => (
                                <div key={index} className="flex items-start space-x-3 p-3 bg-white dark:bg-gray-600 rounded-lg">
                                  <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-900 dark:text-white">{insight.description}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {new Date(insight.timestamp).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500 dark:text-gray-400 text-sm">
                                No insights available yet. Start learning to generate insights!
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 