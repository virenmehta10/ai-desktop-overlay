import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessMath, mathConfig } from '../utils/mathPreprocessor';

export default function CollapsibleTutoringSteps({ isVisible, content, onClose }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [userResponses, setUserResponses] = useState({});
  const [understandingLevels, setUnderstandingLevels] = useState({});
  const [steps, setSteps] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentInputs, setCurrentInputs] = useState({});

  // Always create 10 steps if not present
  useEffect(() => {
    if (!content?.explanation) return;
    const stepTitles = [
      "Let's Start Together",
      "Breaking Down the Question",
      "Understanding Checkpoint",
      "Analyzing the Answer Choices",
      "Understanding Checkpoint",
      "Teaching the Right Strategy",
      "Understanding Checkpoint",
      "Finding the Correct Answer",
      "Final Understanding Checkpoint",
      "What Would You Like to Know More About?"
    ];
    if (steps.length < 10) {
      setSteps(Array.from({length: 10}, (_, i) => ({
        number: i + 1,
        title: stepTitles[i],
        content: content.explanation,
        isVisible: i === 0,
        isCompleted: false
      })));
    }
  }, [content?.explanation]);

  const extractSteps = () => {
    if (!content?.explanation) return;

    const stepRegex = /\*\*Step (\d+):([^*]+)\*\*\s*([\s\S]*?)(?=\*\*Step \d+:|📝 Your Response|🎓 Key Takeaways|$)/gi;
    const matches = [...content.explanation.matchAll(stepRegex)];
    
    const extractedSteps = matches.map(match => {
      const stepNumber = parseInt(match[1]);
      const stepTitle = match[2].trim();
      const stepContent = match[3].trim();
      
      return {
        number: stepNumber,
        title: stepTitle,
        content: stepContent,
        isVisible: stepNumber === 1, // Only first step is visible initially
        isCompleted: false
      };
    });

    setSteps(extractedSteps);
  };

  const handleUserResponse = async (stepNumber, response, understandingLevel) => {
    if (!response.trim()) return;
    setIsProcessing(true);
    try {
      // Send to backend for AI feedback and next step
      const res = await fetch('/api/quiz/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userResponse: response,
          stepIndex: stepNumber - 1,
          context: steps.slice(0, stepNumber).map(s => s.content).join('\n')
        })
      });
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        setIsProcessing(false);
        alert('Error: Could not parse AI feedback. Please try again.');
        return;
      }
      if (!data || (!data.aiFeedback && !data.nextStepMarkdown)) {
        setIsProcessing(false);
        alert('Error: AI feedback was empty. Please try again.');
        return;
      }
      // Store the response
      setUserResponses(prev => ({ ...prev, [stepNumber]: response }));
      setUnderstandingLevels(prev => ({ ...prev, [stepNumber]: understandingLevel }));
      // Mark current step as completed
      setSteps(prev => prev.map(step =>
        step.number === stepNumber
          ? { ...step, isCompleted: true, isVisible: false }
          : step
      ));
      // If there is a next step, update its content and show it
      if (stepNumber < steps.length && data.nextStepMarkdown) {
        setSteps(prev => prev.map(step =>
          step.number === stepNumber + 1
            ? { ...step, content: data.nextStepMarkdown, isVisible: true }
            : step
        ));
        setCurrentStep(stepNumber + 1);
      }
      setIsProcessing(false);
    } catch (error) {
      setIsProcessing(false);
      alert('Error getting AI feedback: ' + (error.message || error));
    }
  };

  const handleInputChange = (stepNumber, value) => {
    setCurrentInputs(prev => ({
      ...prev,
      [stepNumber]: value
    }));
  };

  const handleUnderstandingChange = (stepNumber, value) => {
    setUnderstandingLevels(prev => ({
      ...prev,
      [stepNumber]: value
    }));
  };

  const getStepTitle = (stepNumber) => {
    const stepTitles = {
      1: "Let's Start Together",
      2: "Breaking Down the Question",
      3: "Understanding Checkpoint",
      4: "Analyzing the Answer Choices",
      5: "Understanding Checkpoint",
      6: "Teaching the Right Strategy",
      7: "Understanding Checkpoint",
      8: "Finding the Correct Answer",
      9: "Final Understanding Checkpoint",
      10: "What Would You Like to Know More About?"
    };
    return stepTitles[stepNumber] || `Step ${stepNumber}`;
  };

  const isCheckpointStep = (stepNumber) => {
    return [3, 5, 7, 9].includes(stepNumber);
  };

  const getProgressPercentage = () => {
    const completedSteps = steps.filter(step => step.isCompleted).length;
    return steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
  };

  if (!isVisible || !content?.explanation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white rounded-lg shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">🎯 Interactive Tutoring Session</h2>
              <p className="text-blue-100 mt-1">
                Step {currentStep} of {steps.length} • {Math.round(getProgressPercentage())}% Complete
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
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Progress</span>
              <span>{Math.round(getProgressPercentage())}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <motion.div
                className="bg-white h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${getProgressPercentage()}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="space-y-6">
            {steps.map((step, index) => {
              const isCurrent = step.number === currentStep;
              const isPast = step.number < currentStep;
              const isFuture = step.number > currentStep;
              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    scale: isCurrent ? 1 : 0.97
                  }}
                  transition={{ duration: 0.3 }}
                  className={`border rounded-lg overflow-hidden transition-all duration-300 ${
                    isCurrent
                      ? 'border-blue-300 bg-white shadow-lg'
                      : isPast
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 bg-gray-50 opacity-60 pointer-events-none'
                  }`}
                >
                  {/* Step Header */}
                  <div className={`p-4 border-b ${
                    isCurrent
                      ? 'bg-blue-50 border-blue-200'
                      : isPast
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          isPast
                            ? 'bg-green-500 text-white'
                            : isCurrent
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-300 text-gray-600'
                        }`}>
                          {isPast ? '✓' : step.number}
                        </div>
                        <div>
                          <h3 className={`font-semibold ${
                            isCurrent ? 'text-blue-800' : 'text-gray-600'
                          }`}>
                            Step {step.number}: {step.title}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {isPast ? 'Completed' : isCurrent ? 'Active' : 'Locked'}
                          </p>
                        </div>
                      </div>
                      {isPast && (
                        <div className="text-green-600 text-sm">
                          ✓ Completed
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step Content */}
                  {isCurrent && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                      className="p-4"
                    >
                      <div className="prose prose-xs max-w-none mb-6 prose-ul:list-none prose-ol:list-none">
                        <ReactMarkdown
                          {...mathConfig}
                          className="text-gray-700 leading-relaxed"
                        >
                          {preprocessMath(step.content)}
                        </ReactMarkdown>
                      </div>
                      {/* User Response Section */}
                      <div className="border-t pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          📝 Your Response (Required):
                        </label>
                        <textarea
                          placeholder="Share your thoughts, ask questions, or explain your reasoning..."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          rows={4}
                          disabled={isProcessing}
                          value={currentInputs[step.number] || ''}
                          onChange={(e) => handleInputChange(step.number, e.target.value)}
                        />
                        <button
                          className="mt-3 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          disabled={isProcessing || !currentInputs[step.number]?.trim()}
                          onClick={() => handleUserResponse(step.number, currentInputs[step.number], understandingLevels[step.number] || 0.5)}
                        >
                          {isProcessing ? 'Processing...' : 'Submit Response'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                  {/* Completed Step Summary */}
                  {isPast && (
                    <div className="p-4 bg-green-50">
                      <div className="flex items-center gap-2 text-green-700">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">Step completed</span>
                      </div>
                      {userResponses[step.number] && (
                        <p className="text-sm text-green-600 mt-1">
                          Your response: "{userResponses[step.number].substring(0, 100)}..."
                        </p>
                      )}
                    </div>
                  )}
                  {/* Locked Step (future) - collapsed, grayed out, no input */}
                  {isFuture && (
                    <div className="p-4 text-gray-400 text-sm">
                      This step will unlock after you complete the previous one.
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Key Takeaways Section */}
          {getProgressPercentage() === 100 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-6 bg-purple-50 border border-purple-200 rounded-lg"
            >
              <h3 className="text-lg font-semibold text-purple-800 mb-4">
                🎓 Key Takeaways and Next Steps
              </h3>
              <div className="prose prose-xs max-w-none prose-ul:list-none prose-ol:list-none">
                <ReactMarkdown
                  {...mathConfig}
                  className="text-purple-700"
                >
                  {preprocessMath(content.explanation.split('**🎓 Key Takeaways and Next Steps**')[1] || '')}
                </ReactMarkdown>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {getProgressPercentage() === 100 
                ? "Session completed! Review your responses and key takeaways."
                : `Complete Step ${currentStep} to continue`
              }
            </div>
            
            {getProgressPercentage() === 100 && (
              <button
                onClick={onClose}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Complete Session
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
} 