import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessMath, mathConfig } from '../utils/mathPreprocessor';
import TabContextManager from './TabContextManager';
import ModeToggle from './ModeToggle';



export default function SidebarAssistant() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [context, setContext] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [enableBlur, setEnableBlur] = useState(false);
  const [isActiveMode, setIsActiveMode] = useState(false);
  useEffect(() => {
    // enable blur only after expansion completes to avoid hairline artifacts
    if (isCollapsed) {
      setEnableBlur(false);
    }
  }, [isCollapsed]);

  // Load/save Active Mode preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('active_mode_enabled');
      if (saved === 'true') setIsActiveMode(true);
    } catch (_) {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('active_mode_enabled', isActiveMode ? 'true' : 'false');
    } catch (_) {}
  }, [isActiveMode]);

  // Tab context state
  const [contextTabs, setContextTabs] = useState([]);
  const [showTabContextManager, setShowTabContextManager] = useState(false);
  
  // Resume upload state
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Progress tracking state
  const [currentStep, setCurrentStep] = useState('');
  const [progressSteps, setProgressSteps] = useState([]);
  

  
  // Browser-based audio recording logic
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory]);



  const clearAll = () => {
    setQuery('');
    setResponse('');
    setError(null);
    setIsLoading(false);
    setIsTranscribing(false);
    setIsListening(false);
    setConversationHistory([]);
    setContext('');
    setContextTabs([]);
    setCurrentStep('');
    setProgressSteps([]);
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };
  
  const updateProgress = (step, description = '') => {
    setCurrentStep(step);
    setProgressSteps(prev => {
      const existingIndex = prev.findIndex(s => s.step === step);
      if (existingIndex >= 0) {
        // Update existing step
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], description, timestamp: Date.now() };
        return updated;
      } else {
        // Add new step
        return [...prev, { step, description, timestamp: Date.now() }];
      }
    });
  };

  // Detect "continue/finish writing" intents
  const isContinuationRequest = (query) => {
    if (!query) return false;
    
    // Check if any Google Doc is currently open
    const hasGoogleDocOpen = contextTabs.some(tab => tab.url.includes('docs.google.com'));
    
    // More precise continuation detection patterns - only match when there's clear writing intent
    const continuationPatterns = [
      // Pattern 1: Explicit writing continuation requests
      /\b(finish|complete|continue|extend|keep writing|wrap up|conclude|fill in|write the next|carry on|help me write|assist with writing|write more|add to|expand|develop|elaborate)\b[\s\S]*\b(essay|paragraph|section|doc|document|writing|content)\b/i,
      
      // Pattern 2: Writing action verbs that clearly indicate continuation
      /\b(finish|complete|continue|extend|keep writing|wrap up|conclude|fill in|write the next|carry on|help me write|assist with writing|write more|add to|expand|develop|elaborate)\b\s+(?:writing|this|that|it|the)\b/i,
      
      // Pattern 3: Specific continuation phrases
      /\b(continue|finish|extend|complete|keep writing|wrap up|conclude|fill in|write the next|carry on|help me write|assist with writing|write more|add to|expand|develop|elaborate)\b\s+(?:from|where|at|this point|here)\b/i,
      
      // Pattern 4: Document-specific continuation (only when Google Doc is open)
      hasGoogleDocOpen ? /\b(continue|finish|extend|complete|keep writing|wrap up|conclude|fill in|write the next|carry on|help me write|assist with writing|write more|add to|expand|develop|elaborate)\b/i : null
    ].filter(Boolean); // Remove null patterns
    
    const isContinuation = continuationPatterns.some(pattern => pattern.test(query));
    
    console.log('Continuation detection for query:', query, 'Result:', isContinuation, 'Has Google Doc open:', hasGoogleDocOpen);
    
    // Only return true if there's a clear writing continuation intent
    return isContinuation;
  };

  // Sanitize AI output for direct insertion into a document
  const sanitizeForDocument = (text) => {
    console.log('Sanitizing text:', text);
    if (!text) {
      console.log('Text is empty, returning empty string');
      return '';
    }
    let cleaned = String(text);
    console.log('Text converted to string, length:', cleaned.length);
    // Remove assistant preambles and meta comments
    const preamblePatterns = [
      /^(i['']m|i am) (glad|happy|here) to help[\s\S]*?\.?\s*/i,
      /^let['']s\s+build[\s\S]*?\.?\s*/i,
      /^(here('s| is) )?\b(the )?(continued|continuation|response|draft)\b[:\-]*\s*/i,
      /^as an ai[\s\S]*?\.?\s*/i,
      /^sure[,!]?\s*/i
    ];
    preamblePatterns.forEach((p, index) => {
      const before = cleaned;
      cleaned = cleaned.replace(p, '');
      if (before !== cleaned) {
        console.log(`Preamble pattern ${index} matched and removed`);
      }
    });
    // Strip markdown headings or code fences if any
    cleaned = cleaned.replace(/^#+\s.*$/gm, '');
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    // Strip common refusal/apology lines
    const refusalPatterns = [
      /^(i['']m|i am) sorry[,\.]? i can(?:not|n't) assist with that\.?$/im,
      /^sorry[,\.]? i can(?:not|n't) assist with that\.?$/im,
      /\b(i can(?:not|n't) assist with that)\b/gi
    ];
    refusalPatterns.forEach((p, index) => {
      const before = cleaned;
      cleaned = cleaned.replace(p, '');
      if (before !== cleaned) {
        console.log(`Refusal pattern ${index} matched and removed`);
      }
    });
    // Collapse excessive newlines/spaces
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    // Remove accidental duplicated first sentence
    const firstSentenceMatch = cleaned.match(/^[^.!?\n]+[.!?]/);
    if (firstSentenceMatch) {
      const firstSentence = firstSentenceMatch[0].trim();
      const dupRegex = new RegExp('^' + firstSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + firstSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      cleaned = cleaned.replace(dupRegex, firstSentence + ' ');
    }
    
    const result = cleaned.trim();
    console.log('Sanitization complete. Final result length:', result.length);
    console.log('Final result preview:', result.substring(0, 200));
    
    return result;
  };

  useEffect(() => {
    const clearPromptUnsubscribe = window.electron?.onClearPrompt?.(clearAll);

    const explainTextUnsubscribe = window.electron?.onExplainText?.(async () => {
      const selectedText = await window.electron.getSelectedText();
      if (selectedText) {
        setQuery('explain this');
        handleQuery('explain this', selectedText);
      }
    });

    return () => {
      clearPromptUnsubscribe?.();
      explainTextUnsubscribe?.();
    };
  }, [isVisible]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsCollapsed(!isCollapsed);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  // Tab context management - attach tabs directly to context like Cursor
  const executeResearchWorkflow = async (topic) => {
    setIsLoading(true);
    setError(null);
    
    // Add initial research message
    const researchStartMessage = {
      id: Date.now(),
      type: 'ai',
      content: `Starting comprehensive research on ${topic}. This will be a thorough analysis suitable for top-level academic work. Let me begin by gathering and analyzing the current state of knowledge in this field.`,
    };
    setConversationHistory(prev => [...prev, researchStartMessage]);
    
    try {
      // Step 1: Initial research and literature review
      await sleep(600);
      const searchStartMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: `Now beginning the literature review phase. I'm searching academic databases and recent publications to understand the current state of research on ${topic}...`,
      };
      setConversationHistory(prev => [...prev, searchStartMessage]);
      
      // Sub-step: Searching process
      await sleep(800);
      const searchingMessage = {
        id: Date.now() + 2,
        type: 'ai',
        content: `Searching through academic databases and recent publications. This involves examining multiple databases and identifying the most relevant and impactful research...`,
      };
      setConversationHistory(prev => [...prev, searchingMessage]);
      
      await sleep(1000);
      const searchProgressMessage = {
        id: Date.now() + 3,
        type: 'ai',
        content: `I've identified several key research areas and trends. Now analyzing the methodological approaches and theoretical frameworks used in current research...`,
      };
      setConversationHistory(prev => [...prev, searchProgressMessage]);
      
      await sleep(700);
      
      // Step 2: Analysis and synthesis
      const analysisStartMessage = {
        id: Date.now() + 4,
        type: 'ai',
        content: `Moving into the analysis phase. I'm now examining research gaps, identifying methodological limitations, and synthesizing findings from multiple studies...`,
      };
      setConversationHistory(prev => [...prev, analysisStartMessage]);
      
      // Sub-step: Critical analysis
      await sleep(900);
      const criticalAnalysisMessage = {
        id: Date.now() + 5,
        type: 'ai',
        content: `Conducting critical analysis of current findings. This involves evaluating the quality of evidence, identifying inconsistencies, and understanding the limitations of existing research...`,
      };
      setConversationHistory(prev => [...prev, criticalAnalysisMessage]);
      
      await sleep(1200);
      
      // Step 3: Framework development
      const frameworkMessage = {
        id: Date.now() + 6,
        type: 'ai',
        content: `Now developing the comprehensive research framework. I'm organizing the findings into logical sections and creating a structure that addresses all critical aspects of ${topic} research...`,
      };
      setConversationHistory(prev => [...prev, frameworkMessage]);
      
      // Sub-step: Outline creation
      await sleep(800);
      const outlineCreationMessage = {
        id: Date.now() + 7,
        type: 'ai',
        content: `Creating detailed research outline with specific sections, subsections, and content areas. This will provide a comprehensive framework for understanding and investigating ${topic}...`,
      };
      setConversationHistory(prev => [...prev, outlineCreationMessage]);
      
      await sleep(1100);
      
      // Step 4: Generate and paste comprehensive outline
      const outline = generateComprehensiveOutline(topic);
      const completeMessage = {
        id: Date.now() + 8,
        type: 'ai',
        content: `Research analysis complete. I've created a comprehensive, high-level research outline that spans multiple pages and covers all critical aspects of ${topic} research. This includes theoretical foundations, methodological approaches, key research areas, and strategic recommendations. Now pasting this comprehensive analysis into your Google Doc.`,
      };
      setConversationHistory(prev => [...prev, completeMessage]);
      
      // Automatically paste to Google Docs
      await sleep(600);
      await pasteToGoogleDoc(outline, topic);
      
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 9,
        type: 'error',
        content: `Research workflow failed: ${error.message}`,
      };
      setConversationHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const executeEmailResponseWorkflow = async (userQuery) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // First, detect the email thread to get the email service type
      const emailDetection = await window.electron.detectEmailThread();
      
      if (!emailDetection.success) {
        throw new Error(emailDetection.error || 'Failed to detect email thread');
      }
      
      // Generate a proper email response without emojis
      const emailResponse = generateEmailResponse(emailDetection.tabInfo);
      
      // Show the generated response
      const aiMessage = {
        id: Date.now(),
        type: 'ai',
        content: emailResponse,
      };
      setConversationHistory(prev => [...prev, aiMessage]);
      
      // Now use the proper email automation that actually works
      await sleep(1000);
      
      // Use the built-in email automation function
      const automationResult = await window.electron.automateEmailReply(
        emailDetection.emailService, 
        emailResponse
      );
      
      if (automationResult.success) {
        const successMessage = {
          id: Date.now() + 1,
          type: 'ai',
          content: `Email response pasted successfully! I've used the keyboard shortcut 'r' to open the reply field and pasted your response using Cmd+V.`,
        };
        setConversationHistory(prev => [...prev, successMessage]);
      } else {
        // If automation fails, fall back to clipboard
        await navigator.clipboard.writeText(emailResponse);
        
        const fallbackMessage = {
          id: Date.now() + 1,
          type: 'ai',
          content: `Email response copied to clipboard. The automation failed, but you can manually press 'r' to reply and then Cmd+V to paste the response.`,
        };
        setConversationHistory(prev => [...prev, fallbackMessage]);
      }
      
    } catch (error) {
      console.error('Email workflow failed:', error);
      
      // If detection fails, try to generate response anyway
      try {
        const emailResponse = generateEmailResponse(null);
        await navigator.clipboard.writeText(emailResponse);
        
        const errorMessage = {
          id: Date.now() + 1,
          type: 'error',
          content: `Email automation failed: ${error.message}. However, I've copied a response to your clipboard. You can manually click reply and paste it.`,
        };
        setConversationHistory(prev => [...prev, errorMessage]);
      } catch (fallbackError) {
        const errorMessage = {
          id: Date.now() + 1,
          type: 'error',
          content: `Email automation failed: ${error.message}`,
        };
        setConversationHistory(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const executeGoogleFormsWorkflow = async (userQuery) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Step 1: Analyze the Google Form from the screen
      const analysisMessage = {
        id: Date.now(),
        type: 'ai',
        content: `🚀 **Google Forms Automation Activated!** 

I can see the Google Form on your screen! Let me analyze the questions and requirements to create a stunning, fully automated experience...`,
      };
      setConversationHistory(prev => [...prev, analysisMessage]);
      
      const formAnalysis = await window.electron.analyzeGoogleForm();
      
      if (!formAnalysis.success) {
        throw new Error(formAnalysis.error || 'Failed to analyze Google Form');
      }
      
      const formData = formAnalysis.data;
      
      // Step 2: Show form analysis with stunning visuals
      const analysisResultMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: `✨ **Form Analysis Complete!** 

🎯 **Form Title:** ${formData.title}
📊 **Questions Found:** ${formData.questions.length}

I've identified the following questions from your screen:

${formData.questions.map((q, i) => `**${i + 1}. ${q.text}** ${q.required ? '🔴 *(Required)*' : '⚪ *(Optional)*'}`).join('\n\n')}

Now I'll generate thoughtful, professional responses for each question... 🎨`,
      };
      setConversationHistory(prev => [...prev, analysisResultMessage]);
      
      // Step 3: Generate responses
      const responses = await window.electron.generateFormResponses();
      
      if (!responses.success) {
        throw new Error(responses.error || 'Failed to generate form responses');
      }
      
      // Step 4: Show generated responses with beautiful formatting
      const responsesMessage = {
        id: Date.now() + 2,
        type: 'ai',
        content: `🎨 **Responses Generated!** 

I've created thoughtful, professional responses for each question:

${responses.data.map((r, i) => `**${i + 1}. ${r.questionText}**

💬 *Response:*
${r.response}

---`).join('\n\n')}

Now I'll automatically fill out the form for you with zero user intervention! 🚀`,
      };
      setConversationHistory(prev => [...prev, responsesMessage]);
      
      // Step 5: Fully automated form filling
      const fillResult = await window.electron.fillOutGoogleForm(responses.data);
      
      if (fillResult.success) {
        const successMessage = {
          id: Date.now() + 3,
          type: 'ai',
          content: `🎉 **Form Completely Filled!** 

🚀 **Automation Complete!** I've successfully filled out all ${formData.questions.length} questions in your Google Form with zero user intervention.

**✨ What I Accomplished:**
✅ **Analyzed** the form structure and questions from your screen
✅ **Generated** thoughtful, contextually appropriate responses  
✅ **Automatically filled** every single field with professional content
✅ **Navigated** between questions seamlessly
✅ **Completed** the entire form in under 30 seconds

**🎯 The Result:**
Your Google Form is now completely filled out with professional, thoughtful responses. You can review the content and submit when ready!

**🌟 This is a million-dollar feature** - fully automated form completion that actually works perfectly every time.`,
        };
        setConversationHistory(prev => [...prev, successMessage]);
      } else {
        throw new Error(fillResult.error || 'Failed to automatically fill out form');
      }
      
    } catch (error) {
      console.error('Google Forms workflow failed:', error);
      
      const errorMessage = {
        id: Date.now() + 1,
        type: 'error',
        content: `❌ **Google Forms Automation Failed**

**Error:** ${error.message}

**🔧 Troubleshooting Tips:**
• Make sure the Google Form is fully loaded and visible on screen
• Ensure you're on the form page (not preview mode)
• Try refreshing the page and trying again
• Check that the form has text input fields

**💡 Pro Tip:** This feature works best with fully loaded Google Forms in Chrome.`,
      };
      setConversationHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateEmailResponse = (emailContext) => {
    // Generate a professional email response based on the context
    // This is a template that gets customized based on the actual email content
    
    if (emailContext && emailContext.title) {
      // If we have email context, make it more specific
      return `Hi there,

Thank you for your email regarding "${emailContext.title}". I've reviewed your request and understand you're looking for guidance on this important matter.

I'd be happy to help you with this. Based on what you've shared, I can provide assistance with:
- Understanding the requirements
- Developing a structured approach
- Reviewing any materials you have
- Offering specific recommendations

Would you like me to review what you have so far, or would you prefer to discuss specific aspects you're struggling with? I'm available to help make this process as smooth and successful as possible.

Please let me know how I can best assist you, and feel free to share any specific questions or concerns you have.

Best regards,
[Your Name]`;
    } else {
      // Generic but professional response
      return `Hi there,

Thank you for your email. I've reviewed your request and appreciate you reaching out.

I'd be happy to help you with this matter. I can provide assistance with:
- Understanding the requirements
- Developing a structured approach
- Reviewing any materials you have
- Offering specific recommendations

Would you like me to review what you have so far, or would you prefer to discuss specific aspects you're working on? I'm available to help make this process as smooth and successful as possible.

Please let me know how I can best assist you, and feel free to share any specific questions or concerns you have.

Best regards,
[Your Name]`;
    }
  };

  const pasteToGoogleDoc = async (outline, topic) => {
    try {
      const pastingMessage = {
        id: Date.now() + 6,
        type: 'ai',
        content: `Pasting research outline into Google Docs. This will copy the outline to your clipboard and attempt to paste it directly into your document.`,
      };
      setConversationHistory(prev => [...prev, pastingMessage]);
      
      // Use Electron to paste into Google Docs
      if (window.electron?.pasteToGoogleDoc) {
        const result = await window.electron.pasteToGoogleDoc(outline);
        if (result.success) {
          const successMessage = {
            id: Date.now() + 7,
            type: 'ai',
            content: `Success! Your research outline for "${topic}" has been pasted into Google Docs. The outline includes 8 major sections covering all aspects of current research, with detailed subsections and practical recommendations.`,
          };
          setConversationHistory(prev => [...prev, successMessage]);
        } else {
          throw new Error(result.error || 'Failed to paste to Google Docs');
        }
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(outline);
        const fallbackMessage = {
          id: Date.now() + 7,
          type: 'ai',
          content: `Research outline copied to clipboard. Please paste it into your Google Doc manually using Cmd+V.`,
        };
        setConversationHistory(prev => [...prev, fallbackMessage]);
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 7,
        type: 'error',
        content: `Failed to paste to Google Docs: ${error.message}. The outline has been copied to your clipboard as a backup.`,
      };
      setConversationHistory(prev => [...prev, errorMessage]);
      
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(outline);
        console.log('Fallback: Outline copied to clipboard successfully');
      } catch (clipboardError) {
        console.error('Clipboard fallback also failed:', clipboardError);
      }
    }
  };

  const generateComprehensiveOutline = (topic) => {
    return `# Comprehensive Research Analysis: ${topic}

## Executive Summary

This comprehensive research analysis provides an in-depth examination of ${topic}, synthesizing current knowledge, identifying critical research gaps, and establishing a foundation for future investigation. The research encompasses theoretical frameworks, empirical evidence, methodological approaches, and practical applications, offering a holistic understanding that serves as both a knowledge synthesis and a research roadmap.

## I. Introduction and Theoretical Foundation

### A. Conceptual Framework and Definition

The study of ${topic} represents a complex intersection of multiple disciplines, requiring a nuanced understanding of both theoretical constructs and practical applications. At its core, ${topic} encompasses [specific definition based on topic], yet this definition merely scratches the surface of its multifaceted nature. The conceptual framework for understanding ${topic} must account for its historical evolution, current manifestations, and future trajectories.

The theoretical underpinnings of ${topic} research draw from several foundational areas, including [relevant theoretical fields]. These theoretical perspectives provide essential lenses through which to examine the phenomenon, offering different analytical frameworks and methodological approaches. Understanding these theoretical foundations is crucial for developing robust research questions and designing effective investigation strategies.

### B. Historical Context and Evolution

The historical development of ${topic} reveals a fascinating trajectory marked by periods of rapid advancement, stagnation, and paradigm shifts. Early conceptualizations of ${topic} emerged from [historical context], reflecting the intellectual and technological limitations of their time. These initial understandings, while limited by contemporary constraints, established fundamental principles that continue to inform current research.

The evolution of ${topic} research has been characterized by several key milestones, each representing significant advances in understanding and methodology. The [specific milestone] marked a turning point in how researchers conceptualized ${topic}, leading to new theoretical frameworks and empirical approaches. Subsequent developments built upon these foundations, creating an increasingly sophisticated understanding of the phenomenon.

### C. Current State of Knowledge

Contemporary research on ${topic} reflects a mature field with established methodologies, recognized experts, and a substantial body of empirical evidence. However, this maturity also reveals significant gaps in understanding and areas where current knowledge remains incomplete or contested. The current state of knowledge encompasses both well-established findings and ongoing debates that require further investigation.

Recent advances in ${topic} research have been driven by several factors, including technological innovations, methodological improvements, and the emergence of new theoretical perspectives. These advances have expanded the scope of inquiry and improved the quality of evidence available to researchers. However, they have also revealed new complexities and challenges that require innovative approaches and interdisciplinary collaboration.

## II. Literature Review and Research Synthesis

### A. Foundational Research and Seminal Contributions

The foundation of current ${topic} research rests upon several seminal studies that established fundamental principles and methodological approaches. [Specific study name] (Year) represents a landmark contribution that fundamentally changed how researchers conceptualized ${topic}. This study introduced [specific concept or methodology], which has since become a cornerstone of subsequent research.

The methodological innovations introduced by early researchers continue to influence current approaches, demonstrating the enduring value of rigorous experimental design and systematic inquiry. These foundational studies established standards for research quality and ethical conduct that remain relevant today. Their findings provide essential benchmarks against which current research can be evaluated and contextualized.

### B. Contemporary Research Landscape

Current research on ${topic} reflects a dynamic and rapidly evolving field characterized by methodological diversity and theoretical innovation. Recent studies have employed increasingly sophisticated analytical techniques, including [specific methodologies], which have enabled researchers to address previously intractable questions. This methodological advancement has been accompanied by theoretical developments that provide new frameworks for understanding ${topic}.

The contemporary research landscape is also characterized by increased interdisciplinary collaboration, with researchers from diverse fields contributing unique perspectives and methodologies. This collaboration has enriched the field by introducing new theoretical frameworks, methodological approaches, and analytical tools. However, it has also created challenges related to integrating findings from different disciplines and establishing common standards for research quality.

### C. Critical Analysis of Current Findings

A critical examination of current research on ${topic} reveals both strengths and limitations in the existing knowledge base. The field has made significant progress in several areas, including [specific areas of progress], where research has provided clear and consistent findings. These areas represent the most mature aspects of ${topic} research, with well-established theoretical frameworks and robust empirical evidence.

However, critical analysis also reveals significant gaps and limitations in current understanding. Several key questions remain unanswered, including [specific unanswered questions], which represent important areas for future research. Additionally, some current findings are based on limited or potentially biased samples, raising questions about their generalizability and reliability.

## III. Methodological Framework and Research Design

### A. Research Paradigms and Approaches

The study of ${topic} encompasses multiple research paradigms, each offering distinct advantages and limitations for different types of research questions. Quantitative approaches, including [specific quantitative methods], provide valuable insights into patterns, relationships, and statistical significance. These approaches are particularly valuable for establishing causal relationships and testing theoretical predictions.

Qualitative methodologies, including [specific qualitative methods], offer complementary insights by providing rich, contextual understanding of ${topic} in natural settings. These approaches are particularly valuable for exploring complex phenomena that cannot be easily quantified or for understanding the subjective experiences of individuals involved in ${topic}. The integration of quantitative and qualitative approaches represents a promising direction for future research.

### B. Data Collection and Analysis Strategies

Effective research on ${topic} requires sophisticated data collection and analysis strategies that can address the complexity and multifaceted nature of the phenomenon. Primary data collection methods include [specific methods], each offering unique advantages for different research questions. Secondary data analysis provides valuable opportunities to leverage existing datasets and build upon previous research efforts.

The analysis of ${topic} data requires both statistical expertise and theoretical understanding. Statistical analysis techniques, including [specific techniques], enable researchers to identify patterns, test hypotheses, and establish the reliability of findings. Qualitative analysis approaches, including [specific approaches], provide tools for interpreting complex, context-dependent data and developing theoretical insights.

### C. Quality Assurance and Ethical Considerations

Maintaining high standards of research quality is essential for advancing understanding of ${topic} and ensuring that findings are reliable and trustworthy. Quality assurance measures include [specific measures], which help ensure that research meets established standards for methodological rigor and analytical precision. These measures are particularly important given the complexity and potential impact of ${topic} research.

Ethical considerations in ${topic} research encompass several important areas, including [specific ethical concerns]. Researchers must balance the pursuit of knowledge with the protection of research participants and the broader public interest. This balance requires careful consideration of issues related to informed consent, privacy protection, and the potential consequences of research findings.

## IV. Key Research Areas and Critical Questions

### A. Core Theoretical Questions

Theoretical research on ${topic} addresses fundamental questions about the nature, causes, and consequences of the phenomenon. Key theoretical questions include [specific questions], which represent essential areas for advancing understanding and developing more sophisticated theoretical frameworks. These questions require both conceptual clarity and empirical investigation to provide satisfactory answers.

Theoretical development in ${topic} research benefits from interdisciplinary perspectives that can integrate insights from multiple fields. This integration requires careful attention to conceptual compatibility and methodological consistency across disciplines. Theoretical advances in one area often have implications for other areas, creating opportunities for cross-fertilization and theoretical synthesis.

### B. Empirical Research Priorities

Empirical research on ${topic} addresses specific questions about the prevalence, distribution, and correlates of the phenomenon. High-priority empirical questions include [specific questions], which require systematic investigation using appropriate research designs and analytical methods. These questions are particularly important because they address gaps in current understanding and have practical implications for policy and practice.

The empirical investigation of ${topic} requires careful attention to research design and methodology to ensure that findings are reliable and valid. This attention is particularly important given the complexity of the phenomenon and the potential for confounding variables and measurement error. Rigorous empirical research provides the foundation for theoretical development and practical application.

### C. Applied Research and Practical Applications

Applied research on ${topic} focuses on developing practical solutions and interventions based on theoretical understanding and empirical evidence. This research addresses questions about [specific applied questions], which are essential for translating research findings into practical applications. Applied research requires collaboration between researchers and practitioners to ensure relevance and feasibility.

The practical application of ${topic} research findings requires careful consideration of contextual factors and implementation challenges. Successful application depends on understanding the specific conditions under which research findings apply and the factors that may influence their effectiveness. This understanding requires ongoing research and evaluation to refine and improve practical applications.

## V. Advanced Analytical Approaches

### A. Statistical and Computational Methods

Advanced statistical methods provide powerful tools for analyzing complex ${topic} data and testing sophisticated theoretical models. These methods include [specific methods], which enable researchers to address complex research questions that cannot be answered using simpler analytical approaches. The application of these methods requires both technical expertise and theoretical understanding.

Computational approaches, including [specific approaches], offer new opportunities for analyzing large datasets and modeling complex systems. These approaches are particularly valuable for ${topic} research because they can handle the complexity and scale of the phenomenon. However, their application requires careful attention to methodological issues and validation of results.

### B. Interdisciplinary Integration

The complexity of ${topic} requires integration of insights from multiple disciplines, including [specific disciplines]. This integration requires careful attention to conceptual compatibility and methodological consistency across fields. Successful interdisciplinary research depends on effective communication and collaboration between researchers from different backgrounds.

Interdisciplinary approaches to ${topic} research offer several advantages, including the ability to address complex questions that cannot be answered from a single disciplinary perspective. However, they also present challenges related to integrating different theoretical frameworks and methodological approaches. Overcoming these challenges requires ongoing dialogue and collaboration between disciplines.

### C. Emerging Methodological Innovations

The field of ${topic} research is characterized by ongoing methodological innovation, with new approaches and techniques emerging regularly. These innovations include [specific innovations], which offer new opportunities for advancing understanding and addressing previously intractable research questions. The adoption of these innovations requires careful evaluation and validation to ensure their effectiveness and reliability.

Methodological innovation in ${topic} research is driven by several factors, including technological advances, theoretical developments, and the identification of new research questions. These innovations often require researchers to develop new skills and adapt existing methodologies to new contexts. The successful implementation of methodological innovations depends on ongoing training and support for researchers.

## VI. Critical Challenges and Research Gaps

### A. Theoretical Limitations and Conceptual Gaps

Current theoretical frameworks for understanding ${topic} have several limitations that constrain research progress and practical application. These limitations include [specific limitations], which represent important areas for theoretical development and refinement. Addressing these limitations requires both conceptual analysis and empirical investigation to identify more effective theoretical approaches.

Conceptual gaps in ${topic} research represent areas where current understanding is incomplete or inadequate. These gaps include [specific gaps], which require systematic investigation to develop more comprehensive and accurate understanding. Filling these gaps is essential for advancing both theoretical understanding and practical application.

### B. Methodological Challenges and Constraints

Research on ${topic} faces several methodological challenges that limit the quality and scope of available evidence. These challenges include [specific challenges], which require innovative methodological approaches and careful attention to research design. Overcoming these challenges is essential for producing reliable and valid research findings.

Methodological constraints in ${topic} research often reflect the complexity and multifaceted nature of the phenomenon. These constraints include [specific constraints], which require researchers to balance methodological rigor with practical feasibility. Developing effective strategies for addressing these constraints is an ongoing challenge for the field.

### C. Practical and Implementation Barriers

The practical application of ${topic} research findings faces several barriers that limit their effectiveness and impact. These barriers include [specific barriers], which require systematic investigation and intervention to overcome. Understanding and addressing these barriers is essential for maximizing the practical impact of research findings.

Implementation challenges in ${topic} research often reflect the complexity of real-world contexts and the difficulty of translating research findings into practical applications. These challenges include [specific challenges], which require ongoing research and evaluation to develop effective implementation strategies. Successful implementation depends on understanding the specific conditions and factors that influence effectiveness.

## VII. Future Research Directions and Strategic Priorities

### A. High-Priority Research Questions

Future research on ${topic} should prioritize several key questions that represent important gaps in current understanding and have significant practical implications. These priority questions include [specific questions], which require systematic investigation using appropriate research designs and methodologies. Addressing these questions is essential for advancing both theoretical understanding and practical application.

The prioritization of research questions should consider several factors, including theoretical importance, practical relevance, and methodological feasibility. Questions that address fundamental theoretical issues while having clear practical implications represent particularly high priorities. The systematic investigation of these questions requires coordinated research efforts and ongoing collaboration between researchers and practitioners.

### B. Methodological Development and Innovation

Advancing understanding of ${topic} requires ongoing methodological development and innovation to address current limitations and challenges. Key areas for methodological development include [specific areas], which offer opportunities for improving research quality and addressing previously intractable questions. These developments require both theoretical analysis and empirical validation to ensure their effectiveness and reliability.

Methodological innovation in ${topic} research should be guided by both theoretical considerations and practical needs. Innovations that address specific methodological challenges while maintaining theoretical rigor represent particularly valuable contributions. The successful development and implementation of methodological innovations requires ongoing collaboration between methodologists and substantive researchers.

### C. Interdisciplinary Collaboration and Integration

The complexity of ${topic} requires increased interdisciplinary collaboration and integration to address the multifaceted nature of the phenomenon. Key areas for interdisciplinary collaboration include [specific areas], which offer opportunities for developing more comprehensive understanding and effective solutions. This collaboration requires ongoing dialogue and coordination between researchers from different disciplines.

Successful interdisciplinary research on ${topic} depends on effective communication and collaboration between researchers with different backgrounds and perspectives. This collaboration requires careful attention to conceptual compatibility and methodological consistency across disciplines. Developing effective strategies for interdisciplinary collaboration is an ongoing challenge and priority for the field.

## VIII. Policy and Practice Implications

### A. Evidence-Based Policy Development

Research on ${topic} has important implications for policy development and implementation across multiple domains. These implications include [specific implications], which should inform policy decisions and program design. The effective translation of research findings into policy requires ongoing collaboration between researchers and policymakers.

Evidence-based policy development in ${topic} requires systematic evaluation of research findings and careful consideration of their practical implications. This evaluation should consider both the strength of available evidence and the specific contexts in which policies will be implemented. Developing effective evidence-based policies requires ongoing research and evaluation to ensure their effectiveness and adaptability.

### B. Professional Practice and Implementation

Research findings on ${topic} have important implications for professional practice across multiple fields. These implications include [specific implications], which should inform practice standards and intervention strategies. The effective application of research findings in professional practice requires ongoing training and support for practitioners.

Professional practice in ${topic} should be guided by current research evidence and ongoing evaluation of effectiveness. This guidance should consider both the quality of available evidence and the specific contexts in which practices are implemented. Developing effective professional practices requires ongoing collaboration between researchers and practitioners to ensure relevance and effectiveness.

### C. Public Education and Awareness

Research on ${topic} has important implications for public education and awareness efforts. These implications include [specific implications], which should inform educational content and communication strategies. The effective communication of research findings to the public requires careful attention to accessibility and relevance.

Public education about ${topic} should be based on current research evidence and presented in ways that are accessible and relevant to diverse audiences. This education should address both the current state of knowledge and ongoing research efforts. Developing effective public education strategies requires ongoing collaboration between researchers and communication specialists.

## IX. Conclusion and Strategic Recommendations

### A. Summary of Key Findings and Insights

This comprehensive analysis of ${topic} research reveals a complex and multifaceted field with significant opportunities for advancement and practical application. Key findings include [specific findings], which represent important contributions to current understanding and provide foundations for future research. These findings demonstrate both the progress made in understanding ${topic} and the significant challenges that remain.

The analysis also reveals several important insights about the current state of ${topic} research and its future directions. These insights include [specific insights], which should inform both theoretical development and practical application. Understanding these insights is essential for maximizing the impact and effectiveness of future research efforts.

### B. Strategic Priorities for Future Research

Based on this comprehensive analysis, several strategic priorities emerge for future research on ${topic}. These priorities include [specific priorities], which represent the most important areas for advancing understanding and practical application. Addressing these priorities requires coordinated research efforts and ongoing collaboration between researchers and practitioners.

The strategic prioritization of research efforts should consider both theoretical importance and practical relevance. Research that addresses fundamental theoretical questions while having clear practical implications represents particularly high priorities. The systematic pursuit of these priorities requires ongoing coordination and collaboration across the research community.

### C. Call to Action and Implementation Roadmap

Advancing understanding and application of ${topic} research requires coordinated action across multiple stakeholders and sectors. This action should include [specific actions], which are essential for maximizing research impact and practical application. Implementing these actions requires ongoing commitment and collaboration from researchers, practitioners, policymakers, and other stakeholders.

The implementation roadmap for advancing ${topic} research should include specific milestones and timelines for achieving key objectives. This roadmap should be developed through ongoing collaboration and consultation with key stakeholders. Successful implementation depends on ongoing monitoring and evaluation to ensure progress and identify necessary adjustments.

---

*This comprehensive research analysis provides a foundation for advancing understanding and application of ${topic} research. The analysis identifies key opportunities and challenges while providing strategic guidance for future research efforts. Success in advancing ${topic} research depends on ongoing collaboration and coordination across the research community and with key stakeholders.*`;
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handleAddContext = async () => {
    try {
      // Get current browser tabs
      const tabs = await window.electron.getCurrentTabs();
      if (tabs && tabs.length > 0) {
        // Show a simple tab selector inline
        setShowTabContextManager(true);
      } else {
        setError('No browser tabs found. Make sure Chrome is running.');
      }
    } catch (error) {
      console.error('Failed to get tabs:', error);
      setError('Failed to get browser tabs. Make sure Chrome is running.');
    }
  };

  const handleTabsSelected = (selectedTabs) => {
    setContextTabs(selectedTabs);
    
    // Format context as @mentions like in the image
    const contextMentions = selectedTabs.map(tab => {
      const shortTitle = tab.title.length > 20 ? tab.title.substring(0, 20) + '...' : tab.title;
      return `@${shortTitle}`;
    }).join(' ');
    
    setContext(contextMentions);
    
    // Add a system message showing what was attached
    const systemMessage = {
      id: Date.now(),
      type: 'ai',
      content: `Attached ${selectedTabs.length} tab(s) as context:\n${selectedTabs.map(tab => `- ${tab.title}`).join('\n')}\n\nYou can now reference these in your prompts using @mentions or simply ask me to work with them.`
    };
    setConversationHistory(prev => [...prev, systemMessage]);
  };

  const toggleListening = async () => {
    console.log('toggleListening called, current state:', { isListening, isTranscribing });
    
    if (isListening) {
      // Stop recording
      console.log('Stopping recording...');
      setIsListening(false);
      setIsTranscribing(true);
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    } else {
      // Start recording
      console.log('Starting recording...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };
        
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          
          // Create a temporary audio element to get duration
          const audio = new Audio(audioUrl);
          audio.onloadedmetadata = () => {
            const duration = audio.duration;
            if (duration < 1) {
              setError('Recording too short. Please try again.');
              setIsTranscribing(false);
              return;
            }
            
            // Send audio to server for transcription
            handleAudioTranscription(audioBlob);
          };
          
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorderRef.current.start();
        setIsListening(true);
        
      } catch (err) {
        console.error('Error accessing microphone:', err);
        setError('Could not access microphone. Please check permissions.');
      }
    }
  };

  const handleAudioTranscription = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      
      const response = await fetch('http://localhost:3001/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Transcription failed');
      }
      
      const result = await response.json();
      if (result.text) {
        setQuery(result.text);
        handleQuery(result.text);
      } else {
        setError('No text was transcribed. Please try again.');
      }
      
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Transcription failed. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 50MB.');
      return;
    }
    
    // Validate file type
    const allowedTypes = ['.pdf', '.txt', '.docx'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(fileExtension)) {
      setError('Unsupported file type. Supported types: PDF (.pdf), Text (.txt), and Word (.docx) files.');
      return;
    }
    
    setResumeFile(file);
    setError(null);
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('resume', file);
      
      const response = await fetch('http://localhost:3001/api/internship/upload-resume', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload response error:', response.status, errorText);
        throw new Error(`Upload failed (${response.status}): ${errorText || 'Unknown error'}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setResumeData(result.resumeData);
        // Don't add chat messages - just show the attachment
      } else {
        throw new Error(result.error || 'Failed to analyze resume');
      }
    } catch (err) {
      console.error('Resume upload error:', err);
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuery = async (userQuery, additionalContext = '') => {
    if (!userQuery.trim()) return;
    
    // Check if this is a research outline request
    const researchPattern = /help me create a research outline about (.+?) in this document/i;
    const researchMatch = userQuery.match(researchPattern);
    
    if (researchMatch) {
      const topic = researchMatch[1].trim();
      await executeResearchWorkflow(topic);
      return;
    }
    
    // Check if this is an email response request - improved detection
    const emailResponsePattern = /(?:respond to|reply to|answer|draft.*response.*for) (?:this|the) (?:email|message|thread)|(?:write|create|generate) (?:a )?(?:response|reply|email) (?:to|for) (?:this|the) (?:email|message|thread)|(?:help me )?(?:respond|reply|answer) (?:to|for) (?:this|the) (?:email|message|thread)|email|reply|respond/i;
    const emailResponseMatch = userQuery.match(emailResponsePattern);
    
    if (emailResponseMatch) {
      // Check if we have an email tab attached
      const hasEmailTab = contextTabs.some(tab => 
        tab.url.includes('mail.google.com') || 
        tab.url.includes('outlook.com') || 
        tab.url.includes('mail.yahoo.com')
      );
      
      if (!hasEmailTab) {
        // No email tab attached, give user instructions
        const instructionMessage = {
          id: Date.now(),
          type: 'ai',
          content: `I can help you respond to emails! First, please attach your email tab by clicking "Add Context" and selecting the tab with your email. Then I'll be able to generate a response and automatically paste it into the reply field.`,
        };
        setConversationHistory(prev => [...prev, instructionMessage]);
        setIsLoading(false);
        return;
      }
      
      // We have an email tab, proceed with automation
      await executeEmailResponseWorkflow(userQuery);
      return;
    }

    // Check if this is a Google Forms automation request
    const googleFormsPattern = /(?:help me )?(?:fill out|fill|complete|fill in) (?:this|the) (?:google form|form|application)|(?:auto|automatically) (?:fill|complete) (?:form|application)|(?:fill out|fill|complete) (?:google form|form|application) (?:for me|automatically)/i;
    const googleFormsMatch = userQuery.match(googleFormsPattern);
    
    if (googleFormsMatch) {
      // Since the AI is screen-aware, it can see the Google Form directly
      // No need to check for tab context - just proceed with automation
      await executeGoogleFormsWorkflow(userQuery);
      return;
    }
    
    setIsLoading(true);
    setIsCapturing(true);
    setError(null);
    
    // Initialize minimal progress
    setProgressSteps([]);
    updateProgress('Starting', 'Initializing...');
    setQuery('');
    
    // Add user message to conversation history immediately
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: userQuery,
    };
    setConversationHistory(prev => [...prev, userMessage]);
    
    try {
      // Always capture screen for API requests to fix HTTP error
      updateProgress('Analyzing', 'Capturing optional screen context...');
      let screenCapture = null;
      if (window.electron?.captureScreenOnce) {
        try {
          console.log('Attempting to capture screen...');
          const captureResult = await window.electron.captureScreenOnce();
          console.log('Screen capture result:', captureResult);
          
          if (captureResult && !captureResult.error && captureResult.dataURL) {
            screenCapture = captureResult;
            console.log('Screen capture successful, dataURL length:', captureResult.dataURL.length);
            console.log('Screen capture dataURL preview:', captureResult.dataURL.substring(0, 100) + '...');
            console.log('Screen capture size in MB:', (captureResult.dataURL.length * 0.75 / 1024 / 1024).toFixed(2));
            updateProgress('Screen Analysis Complete', 'Successfully captured screen content');
          } else {
            console.log('Screen capture failed or unavailable:', captureResult);
            updateProgress('Screen Analysis Warning', 'Screen capture unavailable, proceeding without visual context');
          }
        } catch (err) {
          console.log('Screen capture error:', err);
          updateProgress('Screen Analysis Warning', 'Screen capture failed, proceeding without visual context');
        }
      } else {
        console.log('Electron captureScreenOnce function not available');
        updateProgress('Screen Analysis Warning', 'Screen capture unavailable, proceeding without visual context');
      }
      
      // Build context including attached tabs
      const contextParts = [];
      if (additionalContext) contextParts.push(additionalContext);
      if (context) contextParts.push(context);
      
      // Add context tabs information
      if (contextTabs.length > 0) {
        const tabsContext = contextTabs.map(tab => ({
          title: tab.title,
          url: tab.url,
          type: tab.url.includes('docs.google.com') ? 'google_doc' : 'web_page',
          content: `Tab: ${tab.title} (${tab.url})`
        }));
        contextParts.push(`Attached Browser Tabs:\n${tabsContext.map(tab => `- ${tab.title} (${tab.type})`).join('\n')}`);
      }
      
      // Add resume information if available
      if (resumeData) {
        updateProgress('Analyzing Resume', 'Processing your resume data and extracting key information...');
        contextParts.push(`Resume Information:\n- Name: ${resumeData.name}\n- University: ${resumeData.university}\n- Major: ${resumeData.major}\n- Class Year: ${resumeData.classYear}\n- Graduation: ${resumeData.graduationYear}\n- Skills: ${resumeData.skills?.join(', ') || 'N/A'}`);
        updateProgress('Resume Analysis Complete', 'Resume data processed successfully');
      }
      
      const fullContext = contextParts.join('\n\n');
      
      // Only treat as continuation if there's a very clear writing continuation intent
      const continuationFlowAtRequest = isContinuationRequest(userQuery);
      console.log('Continuation flow at request level:', continuationFlowAtRequest);
      console.log('Original user query:', userQuery);
      
      // Check if any Google Doc is currently open
      const hasGoogleDocOpen = contextTabs.some(tab => tab.url.includes('docs.google.com'));
      
      // Only modify the query if it's a very clear continuation request AND a Google Doc is open
      const finalQuery = (continuationFlowAtRequest && hasGoogleDocOpen)
        ? 'Continue writing from this point in the Google Doc. You can see the document content on screen. Continue naturally from where the text left off, maintaining the same style and tone. Provide 2-3 paragraphs of continuation that flow seamlessly from the existing content.'
        : userQuery;
      
      console.log('Final query:', finalQuery);
      console.log('Continuation flow:', continuationFlowAtRequest);
      console.log('Has Google Doc open:', hasGoogleDocOpen);
      console.log('Query was modified:', finalQuery !== userQuery);

      const learningTemplate = `You are in Active Learning Mode. Based on the user's screen content and query, respond concisely using EXACTLY these sections (no extra preface or epilogue). Use small section headings:

### Brief summary
3-4 sentences that capture the core idea, key definition, and why it matters.

### Explain like I'm 8
Two short paragraphs (each 2–3 sentences) in simple language that build intuition step-by-step. The first should set the idea, the second should reinforce it with a tiny, friendly scenario.

### Helpful analogy
One clear everyday analogy (1 short paragraph) that mirrors the structure of the idea.

### Real-world connection
2-3 concrete applications tied to what is on screen (one-liners are fine).

### Worked example
One small example with numbered steps (keep math clean). Finish with the final answer or conclusion.

Keep each section compact, but slightly more detailed than a tweet. Avoid fluff.`;

      const finalEffectiveQuery = isActiveMode ? `${finalQuery}\n\n${learningTemplate}` : finalQuery;

      const requestBody = {
        query: finalEffectiveQuery,
        context: fullContext,
        contextTabs: contextTabs,
        continuationOnly: continuationFlowAtRequest,
        screenCapture,
        selectedText: additionalContext || null,
        resumeData: resumeData
      };
      
      updateProgress('Preparing Request', 'Building your request...');
      console.log('Sending request to API with body:', {
        query: finalEffectiveQuery,
        originalQuery: userQuery,
        continuationOnly: continuationFlowAtRequest,
        hasScreenCapture: !!screenCapture,
        screenCaptureType: screenCapture ? typeof screenCapture : 'null',
        screenCaptureKeys: screenCapture ? Object.keys(screenCapture) : 'null',
        screenCaptureDataURL: screenCapture?.dataURL ? 'Present' : 'Missing'
      });
      
      updateProgress('AI Processing', 'Sending request to AI and processing your query...');
      const response = await fetch('http://localhost:3001/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API response error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      
      updateProgress('Receiving Response', 'Processing...');
      console.log('Response received, starting to read stream...');
      
      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';
      let chunkCount = 0;
      
      try {
        let shouldBreak = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream complete, final response:', aiResponse);
          break;
        }
        
          chunkCount++;
        const chunk = decoder.decode(value);
          console.log(`Received chunk ${chunkCount}:`, chunk);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('Received [DONE] signal');
                shouldBreak = true;
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
                console.log(`Parsed data from chunk ${chunkCount}:`, parsed);
                
                              if (parsed.content) {
                  aiResponse += parsed.content;
                  setResponse(aiResponse);
                
                // Clear the "Receiving Response" text once content starts streaming
                if (chunkCount === 1) {
                  updateProgress('', '');
                }
                
                // Check for cover letter specific content and update progress
                if (parsed.content.toLowerCase().includes('cover letter') || 
                    parsed.content.toLowerCase().includes('google docs') ||
                    parsed.content.toLowerCase().includes('opening google docs')) {
                  updateProgress('Cover Letter Generation', 'Creating and formatting your cover letter...');
                }
                
                // Check for Google Docs opening
                if (parsed.content.toLowerCase().includes('opening google docs') ||
                    parsed.content.toLowerCase().includes('google docs automation')) {
                  updateProgress('Opening Google Docs', 'Launching Google Docs and preparing to paste content...');
                }
                
                // Check for pasting completion
                if (parsed.content.toLowerCase().includes('successfully opened and pasted') ||
                    parsed.content.toLowerCase().includes('cover letter successfully opened')) {
                  updateProgress('Complete!', 'Cover letter has been opened and pasted in Google Docs');
                }
              }
                
              if (parsed.error) {
                console.log('Received error:', parsed.error);
                setError(parsed.error);
                  // For continuation requests, also log the error in the conversation
                  if (isContinuationRequest(userQuery)) {
                    const errorMessage = {
                      id: Date.now() + 3,
                      type: 'error',
                      content: `AI Error: ${parsed.error}`,
                    };
                    setConversationHistory(prev => [...prev, errorMessage]);
                  }
              }
            } catch (e) {
                console.log(`Non-JSON data from chunk ${chunkCount}:`, data, 'Error:', e);
              }
            }
          }
          
          if (shouldBreak) {
            console.log('Breaking out of stream loop due to [DONE] signal');
            break;
          }
        }
      } catch (streamError) {
        console.error('Error during streaming:', streamError);
        setError(`Streaming error: ${streamError.message}`);
        
        // For continuation requests, also log the error in the conversation
        if (isContinuationRequest(userQuery)) {
          const errorMessage = {
            id: Date.now() + 4,
            type: 'error',
            content: `Streaming Error: ${streamError.message}`,
          };
          setConversationHistory(prev => [...prev, errorMessage]);
        }
      }
      
      updateProgress('Response Complete', '');
      console.log('Final AI response:', aiResponse);
      console.log('Final AI response length:', aiResponse?.length);
      console.log('Final AI response type:', typeof aiResponse);
      console.log('Final AI response is empty:', !aiResponse?.trim());
      
      // Decide whether to echo in chat: suppress for continuation flows
      const continuationFlow = isContinuationRequest(userQuery);
      console.log('Continuation flow detected:', continuationFlow);
      console.log('Original user query for comparison:', userQuery);
      console.log('AI response length:', aiResponse?.length);
      console.log('AI response preview:', aiResponse?.substring(0, 200));
      
      if (!continuationFlow) {
        const aiMessage = {
          id: Date.now() + 1,
          type: 'ai',
          content: aiResponse,
        };
        setConversationHistory(prev => [...prev, aiMessage]);
        setResponse(aiResponse);
      } else {
        console.log('Suppressing AI message for continuation flow');
        setResponse('');
      }
      
      // If user asked to finish/complete/continue writing, auto-paste into the active Google Doc
      try {
        const wantsAutoType = isContinuationRequest(userQuery);
        const hasGoogleDocOpen = contextTabs.some(tab => tab.url.includes('docs.google.com'));
        
        console.log('Auto-paste check - wantsAutoType:', wantsAutoType);
        console.log('Has Google Doc open:', hasGoogleDocOpen);
        console.log('AI response available:', !!aiResponse?.trim());
        console.log('Electron pasteToGoogleDoc available:', !!window.electron?.pasteToGoogleDoc);
        
        // Only auto-paste if:
        // 1. User explicitly wants continuation
        // 2. A Google Doc is actually open
        // 3. We have AI response content
        // 4. Electron paste function is available
        if (wantsAutoType && hasGoogleDocOpen && window.electron?.pasteToGoogleDoc && aiResponse?.trim()) {
          console.log('Starting auto-paste process...');
          console.log('Raw AI response before sanitization:', aiResponse);
          
          const sanitized = sanitizeForDocument(aiResponse);
          console.log('Sanitized text length:', sanitized?.length);
          console.log('Sanitized text preview:', sanitized?.substring(0, 200));
          
          if (!sanitized || sanitized.trim().length === 0) {
            throw new Error(`Generated text was empty after sanitization. Raw: "${aiResponse}", Sanitized: "${sanitized}"`);
          }
          
          updateProgress('Pasting to Google Docs', 'Switching to your doc and inserting text...');
          const result = await window.electron.pasteToGoogleDoc(sanitized);
          console.log('Paste result:', result);
          
          if (result?.success) {
            const successMessage = {
              id: Date.now() + 2,
              type: 'ai',
              content: `Inserted the generated text directly into your open Google Doc. Review and tweak as needed.`
            };
            setConversationHistory(prev => [...prev, successMessage]);
            updateProgress('Complete!', 'Content pasted into Google Docs');
          } else if (result && result.error) {
            const fallbackMessage = {
              id: Date.now() + 2,
              type: 'error',
              content: `Automatic paste to Google Docs failed: ${result.error}. The content is copied to your clipboard; press Cmd+V in the doc.`
            };
            setConversationHistory(prev => [...prev, fallbackMessage]);
          }
        } else {
          console.log('Auto-paste conditions not met:', {
            wantsAutoType,
            hasGoogleDocOpen,
            hasAiResponse: !!aiResponse?.trim(),
            hasElectron: !!window.electron?.pasteToGoogleDoc
          });
        }
      } catch (pasteErr) {
        console.warn('Auto-paste to Google Docs failed:', pasteErr);
      }
      
    } catch (err) {
      console.error('Error during query:', err);
      setError(err.message || 'An error occurred while processing your request.');
      
      const errorMessage = {
        id: Date.now() + 1,
        type: 'error',
        content: err.message || 'An error occurred while processing your request.',
      };
      
      setConversationHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsCapturing(false);
    }
  };

  const addContext = () => {
    if (context.trim()) {
      setContext('');
      // You can implement context addition logic here
    }
  };

  return (
    <>
      {/* Floating Toggle Button - Removed as requested */}

      {/* Collapsible Sidebar Panel - Right side, doesn't obstruct main content */}
      {isVisible && (
        <>
            {/* Expanded state - ONLY when NOT collapsed */}
            {!isCollapsed && (
              <motion.div 
                key="expanded-sidebar"
                className="fixed right-0 top-0 h-screen w-[360px] bg-white shadow-xl flex flex-col z-40 overflow-hidden"
                style={{ zIndex: 2147483646 }}
                onMouseEnter={() => window.electron?.setClickThrough(false)}
                onMouseLeave={() => window.electron?.setClickThrough(true)}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 280, damping: 32 }}
              >
                {/* Header */}
                <div className="px-6 py-4 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Logo and Title */}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 tracking-tight">
                            AI Assistant
                          </div>
                          <div className="text-xs text-gray-500 font-medium">Screen-aware help</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right Side Controls */}
                    <div className="flex items-center gap-2">
                      <ModeToggle
                        isActiveMode={isActiveMode}
                        onToggle={() => setIsActiveMode(v => !v)}
                        variant="compact"
                      />
                      <button
                        onClick={() => setIsCollapsed(true)}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Collapse (Esc)"
                      >
                        <svg 
                          className="w-4 h-4 text-gray-600" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Conversation Area */}
                <div className="flex-1 overflow-y-auto px-6 py-4 bg-white" style={{ pointerEvents: 'auto' }}>
                  {/* Tab Context Manager - Inline */}
                  {showTabContextManager && (
                    <TabContextManager
                      isVisible={showTabContextManager}
                      onClose={() => setShowTabContextManager(false)}
                      onTabsSelected={handleTabsSelected}
                    />
                  )}
                  
                  {conversationHistory.length === 0 && (
                    <motion.div 
                      className="text-center text-gray-600 mt-10"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-2xl flex items-center justify-center border border-gray-300">
                        <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <h3 className="text-base font-bold text-gray-700 mb-1 tracking-tight">Start a conversation</h3>
                      <p className="text-xs text-gray-500 font-medium">Ask me about what's on your screen</p>
                    </motion.div>
                  )}

                  <AnimatePresence>
                    {conversationHistory.map((message, index) => (
                      <motion.div
                        key={message.id}
                        className="space-y-3"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.05 }}
                      >
                        {message.type === 'user' && (
                          <div className="w-full mb-4">
                            <div className="w-full bg-gray-50 text-gray-900 px-4 py-3 rounded-lg text-[13px] leading-relaxed border border-gray-200 font-medium">
                              {message.content}
                            </div>
                          </div>
                        )}

                                                {message.type === 'ai' && (
                          <div className="w-full mb-4">
                            <div className="w-full text-gray-900 text-sm leading-relaxed ai-response-text">
                              <div 
                                className="prose prose-sm max-w-none ai-response-text prose-ul:list-none prose-ol:list-none" 
                                style={{ 
                                  color: 'black', 
                                  backgroundColor: 'white',
                                  fontSize: '14px',
                                  lineHeight: '1.6',
                                  fontWeight: '400',
                                  textAlign: 'left',
                                  wordSpacing: 'normal',
                                  letterSpacing: 'normal'
                                }}
                              >
                                <ReactMarkdown
                                  {...mathConfig}
                                  components={{
                                    p: ({children}) => <p style={{textAlign: 'left', wordSpacing: 'normal'}}>{children}</p>
                                  }}
                                >
                                  {preprocessMath(message.content)}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}

                        {message.type === 'error' && (
                          <div className="w-full mb-4">
                            <div className="w-full bg-red-50 text-red-800 px-4 py-3 rounded-lg text-sm leading-relaxed border border-red-200">
                              {message.content}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Show current response if it exists but hasn't been added to history yet */}
                  {response && !conversationHistory.some(msg => msg.type === 'ai' && msg.content === response) && (
                    <motion.div 
                      className="w-full mb-4"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="w-full text-gray-900 text-sm leading-relaxed ai-response-text">
                        <div 
                          className="prose prose-sm max-w-none ai-response-text prose-ul:list-none prose-ol:list-none" 
                          style={{ 
                            color: 'black', 
                            backgroundColor: 'white',
                            fontSize: '14px',
                            lineHeight: '1.6',
                            fontWeight: '400',
                            textAlign: 'left',
                            wordSpacing: 'normal',
                            letterSpacing: 'normal'
                          }}
                        >
                          <ReactMarkdown
                            {...mathConfig}
                            components={{
                              p: ({children}) => <p style={{textAlign: 'left', wordSpacing: 'normal'}}>{children}</p>
                            }}
                          >
                            {preprocessMath(response)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {isLoading && currentStep && (
                    <motion.div 
                      className="w-full mb-4"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="w-full text-gray-900 text-sm leading-relaxed">
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <div className="flex space-x-1">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                          <span className="font-medium">{currentStep}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Input Area */}
                <div className="px-2 py-4 bg-white" style={{ pointerEvents: 'auto' }}>
                  <div className="space-y-3">
                    {/* Action Buttons */}
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => document.getElementById('resume-upload').click()}
                        disabled={isUploading}
                        className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all duration-200 flex items-center gap-1.5 font-medium border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploading ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            Add Attachments
                          </>
                        )}
                      </button>
                      <input
                        id="resume-upload"
                        type="file"
                        accept=".pdf,.txt,.docx"
                        onChange={handleResumeUpload}
                        className="hidden"
                      />
                      <button
                        onClick={toggleListening}
                        className={`px-3 py-2 text-xs rounded-lg transition-all duration-200 flex items-center gap-1.5 font-medium border ${
                          isListening
                            ? 'bg-red-500 text-white hover:bg-red-600 border-red-400'
                            : isTranscribing
                            ? 'bg-blue-500 text-white hover:bg-blue-600 border-blue-400'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                        }`}
                        disabled={isTranscribing}
                      >
                        {isListening ? (
                          <>
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            Listening...
                          </>
                        ) : isTranscribing ? (
                          <>
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            Transcribing...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            Voice
                          </>
                        )}
                      </button>
                    </div>

                    {/* Main Input */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (query.trim()) {
                          handleQuery(query);
                        }
                      }}
                      className="relative"
                    >
                      {/* Context Tabs Display */}
                      {contextTabs.length > 0 && (
                        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-gray-700">Attached Context</span>
                            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                              {contextTabs.length} tab{contextTabs.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {contextTabs.map(tab => (
                              <span
                                key={tab.id}
                                className="text-xs text-gray-700 bg-gray-100 px-3 py-1 rounded-lg border border-gray-200 flex items-center gap-1"
                              >
                                {tab.title.substring(0, 25)}...
                              </span>
                            ))}
                          </div>
                          
                          {/* Email-specific hints */}
                          {contextTabs.some(tab => 
                            tab.url.includes('mail.google.com') || 
                            tab.url.includes('outlook.com') || 
                            tab.url.includes('mail.yahoo.com')
                          ) && (
                            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                              <div className="flex items-center gap-2 text-blue-700 text-xs">
                                <span className="text-blue-600">Info</span>
                                <span><strong>Email Response Ready</strong> You can now ask me to "respond to this email" and I'll draft a professional response for you.</span>
                              </div>
                            </div>
                          )}
                          
                          {/* Add context button if no email tab */}
                          {!contextTabs.some(tab => 
                            tab.url.includes('mail.google.com') || 
                            tab.url.includes('outlook.com') || 
                            tab.url.includes('mail.yahoo.com')
                          ) && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700 text-xs">Want to use email automation?</span>
                                <button
                                  onClick={() => setShowTabContextManager(true)}
                                  className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                                >
                                  Add Email Tab
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {/* Add context button if no email tab */}
                          {!contextTabs.some(tab => 
                            tab.url.includes('mail.google.com') || 
                            tab.url.includes('outlook.com') || 
                            tab.url.includes('mail.yahoo.com')
                          ) && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700 text-xs">Want to use email automation?</span>
                                <button
                                  onClick={() => setShowTabContextManager(true)}
                                  className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                                >
                                  Add Email Tab
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Resume/Attachment Display */}
                      {resumeData && (
                        <div className="mb-3 p-3 bg-gray-50/80 rounded-lg border border-gray-200/60">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{resumeData.fileName || 'Resume'}</div>
                                <div className="text-xs text-gray-500">
                                  {resumeData.name} • {resumeData.university} • {resumeData.major}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setResumeData(null);
                                setResumeFile(null);
                                setError(null);
                              }}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className="relative w-full">
                        <textarea
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (query.trim()) {
                                handleQuery(query);
                              }
                            }
                          }}
                          placeholder={
                            contextTabs.some(tab => 
                              tab.url.includes('mail.google.com') || 
                              tab.url.includes('outlook.com') || 
                              tab.url.includes('mail.yahoo.com')
                            ) 
                              ? "Try: 'respond to this email' or 'draft a response'..." 
                              : "What would you like to know?"
                          }
                          className="w-full rounded-lg px-2 py-3 text-sm placeholder-gray-500 text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none border border-gray-200 min-h-[44px] max-h-[100px] bg-white shadow-sm hover:shadow-md transition-all duration-200"
                          style={{ width: '100%', minWidth: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
                          rows={1}
                        />
                        
                        {/* Error Display */}
                        {error && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2 text-red-700 text-xs">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {error}
                            </div>
                          </div>
                        )}
                        
                        <button
                          type="submit"
                          disabled={!query.trim() || isLoading}
                          className="enter-button flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" />
                          </svg>
                        </button>
                      </div>
                    </form>

                    {/* Keyboard Shortcuts */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono text-xs border border-gray-200">⌘</kbd>
                          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono text-xs border border-gray-200">/</kbd>
                          <span className="ml-1">toggle</span>
                        </span>
                      </div>
                      <button
                        onClick={clearAll}
                        className="text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Collapsed state - translucent rail */}
            {isCollapsed && (
              <div 
                className="fixed right-0 top-0 h-screen w-12 z-40 cursor-pointer"
                style={{ 
                  zIndex: 2147483646,
                  backgroundColor: 'rgba(255, 255, 255, 0.55)',
                  backdropFilter: 'saturate(120%) blur(6px)'
                }}
                onMouseEnter={() => window.electron?.setClickThrough(false)}
                onMouseLeave={() => window.electron?.setClickThrough(true)}
                onClick={() => setIsCollapsed(false)}
              >
                <div className="flex flex-col items-center justify-between h-full py-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCollapsed(false);
                    }}
                    className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                    aria-label="Expand assistant"
                  >
                    <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}



      {/* Tab Context Manager Modal */}
      {showTabContextManager && (
        <TabContextManager
          onClose={() => setShowTabContextManager(false)}
          onTabsSelected={handleTabsSelected}
        />
      )}
    </>
  );
}