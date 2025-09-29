import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MemoryDisplay({ isVisible, onClose }) {
  const [memoryData, setMemoryData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isVisible) {
      fetchMemoryData();
    }
  }, [isVisible]);

  const fetchMemoryData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:3001/api/memory');
      if (!response.ok) {
        throw new Error('Failed to fetch memory data');
      }
      
      const data = await response.json();
      setMemoryData(data.memory);
    } catch (err) {
      console.error('Error fetching memory:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="bg-white rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold flex items-center">
                🧠 AI Memory System
              </h2>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-blue-100 mt-2">
              Your AI assistant's memory of you and your interactions
            </p>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading memory data...</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-red-800">Error: {error}</span>
                </div>
              </div>
            )}

            {memoryData && (
              <div className="space-y-6">
                {/* Profile Status */}
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Profile Status</h3>
                      <p className="text-gray-600">
                        {memoryData.hasProfile ? 'Active profile detected' : 'Building profile...'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {memoryData.totalInteractions}
                      </div>
                      <div className="text-sm text-gray-500">Interactions</div>
                    </div>
                  </div>
                </div>

                {/* Key Information */}
                {memoryData.keyInfo && Object.keys(memoryData.keyInfo).length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      Key Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {memoryData.keyInfo.name && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Name</label>
                          <p className="text-gray-900">{memoryData.keyInfo.name}</p>
                        </div>
                      )}
                      {memoryData.keyInfo.profession && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Profession</label>
                          <p className="text-gray-900">{memoryData.keyInfo.profession}</p>
                        </div>
                      )}
                      {memoryData.keyInfo.company && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Company</label>
                          <p className="text-gray-900">{memoryData.keyInfo.company}</p>
                        </div>
                      )}
                      {memoryData.keyInfo.skills && memoryData.keyInfo.skills.length > 0 && (
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-500">Skills</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {memoryData.keyInfo.skills.map((skill, index) => (
                              <span
                                key={index}
                                className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Memory Stats */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Memory Statistics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {memoryData.totalInteractions}
                      </div>
                      <div className="text-sm text-gray-500">Total Interactions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {memoryData.hasProfile ? 'Active' : 'Building'}
                      </div>
                      <div className="text-sm text-gray-500">Profile Status</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {new Date(memoryData.lastUpdated).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">Last Updated</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {memoryData.keyInfo?.skills?.length || 0}
                      </div>
                      <div className="text-sm text-gray-500">Skills Tracked</div>
                    </div>
                  </div>
                </div>

                {/* How it works */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    How Memory Works
                  </h3>
                  <div className="space-y-3 text-sm text-gray-700">
                    <div className="flex items-start">
                      <div className="bg-purple-100 text-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                        1
                      </div>
                      <p>Your AI assistant learns from every interaction, extracting information about you, your work, and preferences.</p>
                    </div>
                    <div className="flex items-start">
                      <div className="bg-purple-100 text-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                        2
                      </div>
                      <p>When you ask about your resume, the AI remembers your experiences and can provide more personalized suggestions.</p>
                    </div>
                    <div className="flex items-start">
                      <div className="bg-purple-100 text-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                        3
                      </div>
                      <p>Future responses are enhanced with context from previous conversations and your profile information.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 