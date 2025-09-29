import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ResearchWorkflow({ 
  isVisible, 
  onClose, 
  topic, 
  onComplete,
  onAccept,
  onReject 
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [researchResults, setResearchResults] = useState(null);
  const [error, setError] = useState(null);

  const researchSteps = [
    '🔍 Scouring the internet for recent research articles and published papers on AI',
    '📚 Analyzing and summarizing each research paper',
    '🧠 Extracting main arguments and key findings',
    '📝 Creating a comprehensive research outline',
    '📄 Pasting the final outline into your Google Doc'
  ];

  useEffect(() => {
    if (isVisible && topic) {
      startResearchWorkflow();
    }
  }, [isVisible, topic]);

  const startResearchWorkflow = async () => {
    try {
      setCurrentStep(0);
      setProgress(0);
      setError(null);
      setIsComplete(false);
      
      // Simulate the research workflow with progress updates
      await simulateResearchWorkflow();
      
    } catch (error) {
      setError(error.message);
    }
  };

  const simulateResearchWorkflow = async () => {
    // Step 1: Searching
    setCurrentStatus('🔍 Searching for recent AI research articles and papers...');
    setProgress(20);
    await sleep(2000);
    
    // Step 2: Analyzing
    setCurrentStatus('📚 Found 8 research sources. Analyzing each one...');
    setProgress(40);
    await sleep(3000);
    
    // Step 3: Extracting
    setCurrentStatus('🧠 Extracting main arguments and creating research outline...');
    setProgress(80);
    await sleep(2000);
    
    // Step 4: Complete
    setCurrentStatus('📄 Preparing to paste outline into your Google Doc...');
    setProgress(100);
    await sleep(1000);
    
    // Generate mock research results
    const mockResults = generateMockResearchResults();
    setResearchResults(mockResults);
    setIsComplete(true);
    setCurrentStatus('✅ Research complete! Ready to paste into your document.');
    
    if (onComplete) {
      onComplete(mockResults);
    }
  };

  const generateMockResearchResults = () => {
    return {
      outline: `Research Outline: ${topic}

1. Introduction
Overview of ${topic} and its significance in modern technology

  Background and context
  Research objectives
  Scope and limitations

2. Literature Review
Analysis of current research and existing knowledge

  2.1. Recent Advances in ${topic}: A Comprehensive Review
  2.2. ${topic} in Modern Computing: Challenges and Opportunities
  2.3. Machine Learning Approaches to ${topic}: A Comparative Study
  2.4. ${topic} Ethics and Responsible Development
  2.5. Future Directions in ${topic} Research

3. Current State of Technology
Assessment of existing ${topic} technologies and approaches

  Available tools and platforms
  Technical capabilities and limitations
  Market adoption and trends

4. Key Challenges and Opportunities
Identification of major obstacles and potential breakthroughs

  Technical challenges
  Ethical and social considerations
  Economic and business opportunities
  Research gaps and future directions

5. Methodology and Approaches
Analysis of different methods and their effectiveness

  Machine learning approaches
  Rule-based systems
  Hybrid methodologies
  Evaluation metrics and benchmarks

6. Future Directions
Predictions and recommendations for future development

  Emerging technologies and trends
  Research priorities and funding needs
  Policy and regulatory considerations
  Long-term vision and goals

7. Conclusion
Summary of findings and recommendations

  Key insights and takeaways
  Implications for practice and policy
  Call to action for researchers and practitioners`,
      sources: [
        'Recent Advances in AI: A Comprehensive Review (2024)',
        'AI in Modern Computing: Challenges and Opportunities (2024)',
        'Machine Learning Approaches to AI: A Comparative Study (2024)',
        'AI Ethics and Responsible Development (2024)',
        'Future Directions in AI Research (2024)'
      ]
    };
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handleAccept = () => {
    if (onAccept && researchResults) {
      onAccept(researchResults);
    }
    onClose();
  };

  const handleReject = () => {
    if (onReject) {
      onReject();
    }
    onClose();
  };

  const handleRetry = () => {
    startResearchWorkflow();
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  🔬
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Research Assistant
                  </h2>
                  <p className="text-sm text-gray-600">
                    Working on: {topic}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {error ? (
              <div className="text-center py-8">
                <div className="text-red-500 text-6xl mb-4">❌</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Research Failed
                </h3>
                <p className="text-gray-600 mb-6">{error}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : !isComplete ? (
              <div className="space-y-6">
                {/* Progress Bar */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <motion.div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Current Status */}
                <div className="text-center py-8">
                  <div className="text-blue-500 text-6xl mb-4">🔬</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Research in Progress
                  </h3>
                  <p className="text-gray-600">{currentStatus}</p>
                </div>

                {/* Steps */}
                <div className="space-y-3">
                  {researchSteps.map((step, index) => (
                    <motion.div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        index <= currentStep
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                        index < currentStep
                          ? 'bg-green-500 text-white'
                          : index === currentStep
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-300 text-gray-600'
                      }`}>
                        {index < currentStep ? '✓' : index === currentStep ? '●' : index + 1}
                      </div>
                      <span className={`${
                        index <= currentStep ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        {step}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Results */}
                <div className="text-center py-4">
                  <div className="text-green-500 text-6xl mb-4">✅</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Research Complete!
                  </h3>
                  <p className="text-gray-600">
                    Generated a comprehensive research outline with {researchResults?.sources?.length || 0} sources
                  </p>
                </div>

                {/* Outline Preview */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Research Outline Preview:</h4>
                  <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                      {researchResults?.outline}
                    </pre>
                  </div>
                </div>

                {/* Sources */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Sources Used:</h4>
                  <div className="space-y-2">
                    {researchResults?.sources?.map((source, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                        {source}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {isComplete && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleReject}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Reject Changes
                </button>
                <button
                  onClick={handleAccept}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Accept & Paste
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 