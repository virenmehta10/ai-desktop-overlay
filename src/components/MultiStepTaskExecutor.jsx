import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MultiStepTaskExecutor({ isVisible, onClose, task, contextTabs }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isVisible && task) {
      initializeTask();
    }
  }, [isVisible, task]);

  const initializeTask = () => {
    if (task.type === 'research_outline') {
      const taskSteps = [
        {
          id: 'analyze_context',
          title: 'Analyzing Context',
          description: 'Examining selected tabs and understanding the research topic',
          status: 'pending'
        },
        {
          id: 'web_research',
          title: 'Web Research',
          description: 'Searching for credible sources and gathering information',
          status: 'pending'
        },
        {
          id: 'source_analysis',
          title: 'Source Analysis',
          description: 'Evaluating credibility and analyzing key findings',
          status: 'pending'
        },
        {
          id: 'outline_creation',
          title: 'Creating Outline',
          description: 'Synthesizing research into a structured outline',
          status: 'pending'
        },
        {
          id: 'document_writing',
          title: 'Writing to Document',
          description: 'Inserting the research outline into the Google Doc',
          status: 'pending'
        }
      ];
      setSteps(taskSteps);
      setCurrentStep(0);
    }
  };

  const executeStep = async (stepIndex) => {
    if (stepIndex >= steps.length) return;

    const step = steps[stepIndex];
    setCurrentStep(stepIndex);
    
    // Update step status
    setSteps(prev => prev.map((s, i) => 
      i === stepIndex ? { ...s, status: 'executing' } : s
    ));

    try {
      let result;
      
      switch (step.id) {
        case 'analyze_context':
          result = await analyzeContext();
          break;
        case 'web_research':
          result = await performWebResearch();
          break;
        case 'source_analysis':
          result = await analyzeSources();
          break;
        case 'outline_creation':
          result = await createOutline();
          break;
        case 'document_writing':
          result = await writeToDocument();
          break;
        default:
          throw new Error(`Unknown step: ${step.id}`);
      }

      // Update step status and results
      setSteps(prev => prev.map((s, i) => 
        i === stepIndex ? { ...s, status: 'completed' } : s
      ));
      setResults(prev => ({ ...prev, [step.id]: result }));

      // Move to next step if available
      if (stepIndex < steps.length - 1) {
        setTimeout(() => setCurrentStep(stepIndex + 1), 1000);
      }

    } catch (err) {
      console.error(`Error executing step ${step.id}:`, err);
      setError(`Failed to execute step: ${step.title}`);
      setSteps(prev => prev.map((s, i) => 
        i === stepIndex ? { ...s, status: 'failed' } : s
      ));
    }
  };

  const analyzeContext = async () => {
    // Simulate context analysis
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const contextInfo = {
      researchTopic: task.researchTopic,
      selectedTabs: contextTabs.map(tab => ({
        title: tab.title,
        url: tab.url,
        type: tab.url.includes('docs.google.com') ? 'google_doc' : 'web_page'
      })),
      googleDocTab: contextTabs.find(tab => tab.url.includes('docs.google.com'))
    };

    return {
      message: `Analyzed context: Research topic "${task.researchTopic}" with ${contextTabs.length} selected tabs`,
      data: contextInfo
    };
  };

  const performWebResearch = async () => {
    // Simulate web research
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const mockSources = [
      { title: 'Recent Study on AI in Education', url: 'https://example.com/ai-education', credibility: 'high', date: '2024' },
      { title: 'Comprehensive Guide to Research Methods', url: 'https://example.com/research-methods', credibility: 'high', date: '2023' },
      { title: 'Industry Report: Technology Trends', url: 'https://example.com/tech-trends', credibility: 'medium', date: '2024' },
      { title: 'Academic Paper: Machine Learning Applications', url: 'https://example.com/ml-applications', credibility: 'high', date: '2024' },
      { title: 'Expert Interview: Future of AI', url: 'https://example.com/ai-future', credibility: 'high', date: '2024' }
    ];

    return {
      message: `Found ${mockSources.length} credible sources for research`,
      sources: mockSources
    };
  };

  const analyzeSources = async () => {
    // Simulate source analysis
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const analysis = {
      keyFindings: [
        'AI is transforming educational methodologies',
        'Research shows 40% improvement in learning outcomes',
        'Machine learning applications are expanding rapidly',
        'Expert consensus on AI benefits and challenges'
      ],
      mainThemes: ['Technology Impact', 'Educational Innovation', 'Future Trends', 'Implementation Strategies']
    };

    return {
      message: 'Analyzed sources and identified key themes and findings',
      analysis
    };
  };

  const createOutline = async () => {
    // Simulate outline creation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const outline = {
      title: `Research Outline: ${task.researchTopic}`,
      sections: [
        {
          title: 'Introduction',
          subsections: ['Background', 'Research Question', 'Objectives']
        },
        {
          title: 'Literature Review',
          subsections: ['Current State of Knowledge', 'Gaps in Research', 'Theoretical Framework']
        },
        {
          title: 'Methodology',
          subsections: ['Research Design', 'Data Collection', 'Analysis Methods']
        },
        {
          title: 'Findings',
          subsections: ['Key Results', 'Data Analysis', 'Statistical Significance']
        },
        {
          title: 'Discussion',
          subsections: ['Implications', 'Limitations', 'Future Research']
        },
        {
          title: 'Conclusion',
          subsections: ['Summary', 'Recommendations', 'Final Thoughts']
        }
      ]
    };

    return {
      message: 'Created comprehensive research outline with 6 main sections',
      outline
    };
  };

  const writeToDocument = async () => {
    // Simulate writing to Google Doc
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const googleDocTab = contextTabs.find(tab => tab.url.includes('docs.google.com'));
    
    if (!googleDocTab) {
      throw new Error('No Google Doc tab found in context');
    }

    // Here you would integrate with Google Docs API
    // For now, we'll simulate the process
    
    return {
      message: `Successfully wrote research outline to Google Doc: "${googleDocTab.title}"`,
      documentUrl: googleDocTab.url,
      contentInserted: true
    };
  };

  const startExecution = async () => {
    setIsExecuting(true);
    setError(null);
    
    try {
      for (let i = 0; i < steps.length; i++) {
        await executeStep(i);
      }
    } catch (err) {
      console.error('Task execution failed:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const getStepStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'executing':
        return '🔄';
      case 'failed':
        return '❌';
      default:
        return '⏳';
    }
  };

  const getStepStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'executing':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white rounded-lg shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">🚀 Multi-Step Task Execution</h2>
                <p className="text-green-100 mt-1">
                  {task?.type === 'research_outline' 
                    ? `Creating research outline for: "${task.researchTopic}"`
                    : 'Executing complex task with multiple steps'
                  }
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-green-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-600 font-medium">❌ Error: {error}</div>
              </div>
            )}

            {/* Task Steps */}
            <div className="space-y-3 mb-6">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  className={`p-4 rounded-lg border transition-all duration-300 ${
                    index === currentStep ? 'ring-2 ring-blue-500' : ''
                  } ${getStepStatusColor(step.status)}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xl">{getStepStatusIcon(step.status)}</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{step.title}</h3>
                      <p className="text-sm text-gray-600">{step.description}</p>
                    </div>
                    <div className="text-sm text-gray-500">
                      Step {index + 1} of {steps.length}
                    </div>
                  </div>
                  
                  {/* Step Results */}
                  {results[step.id] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 pt-3 border-t border-gray-200"
                    >
                      <div className="text-sm text-gray-700">
                        <strong>Result:</strong> {results[step.id].message}
                      </div>
                      {results[step.id].data && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                            View Details
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                            {JSON.stringify(results[step.id].data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
              {!isExecuting && steps.every(s => s.status === 'pending') && (
                <button
                  onClick={startExecution}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Start Execution
                </button>
              )}
              {isExecuting && (
                <div className="px-6 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Executing...
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 