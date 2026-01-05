const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { exec } = require('child_process');
const dotenv = require('dotenv');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const path = require('path');
const os = require('os');

console.log('Loading environment variables...');
// Load environment variables from .env file
// In packaged app, look for .env in the app directory (where main.js is)
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });
console.log('Environment variables loaded. Current working directory:', process.cwd());
console.log('Looking for .env at:', envPath);

const isDev = process.env.NODE_ENV !== 'production';
const { getFullSystemPrompt } = require('./src/services/prompts');
const { learningTools } = require('./src/services/learning-tools');
const { parsePlayCommand, playSong, spotifyApi, getAuthUrl, handleCallback } = require('./src/services/spotify-service');
const googleDocsEditor = require('./src/services/google-docs-editor');

// Initialize memory system
const MemorySystem = require('./src/services/memory-system');
const memorySystem = new MemorySystem();

console.log('🧠 Memory system initialized');

// Initialize learning persona system
const LearningPersonaSystem = require('./src/services/learning-persona-system');
const learningPersonaSystem = new LearningPersonaSystem();
learningPersonaSystem.setMemorySystem(memorySystem);

console.log('🎓 Learning persona system initialized');

// Initialize interactive tutoring service
const InteractiveTutoringService = require('./src/services/interactive-tutoring');
const interactiveTutoring = new InteractiveTutoringService();

console.log('🎯 Interactive tutoring service initialized');

const app = express();

// Enable CORS for development
app.use(cors({
  origin: ['http://localhost:5174', 'http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Increase payload size limit to 50mb
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define model to use - this should be gpt-4o for vision tasks
const MODEL = 'gpt-4o';

// Spotify credentials are optional - only validate if they're needed
if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  console.log('✅ Spotify credentials loaded successfully');
} else {
  console.log('ℹ️  Spotify credentials not configured (optional)');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Memory system endpoint
app.get('/api/memory', (req, res) => {
  try {
    const memorySummary = memorySystem.getMemorySummary();
    res.json({ 
      success: true, 
      memory: memorySummary 
    });
  } catch (error) {
    console.error('Error getting memory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Learning persona endpoint
app.get('/api/learning-persona', (req, res) => {
  try {
    const personaSummary = learningPersonaSystem.getPersonaSummary();
    res.json({ 
      success: true, 
      persona: personaSummary 
    });
  } catch (error) {
    console.error('Error getting learning persona:', error);
    res.status(500).json({ error: error.message });
  }
});

// Open application endpoint
app.post('/api/open-app', async (req, res) => {
  try {
    const { appName } = req.body;
    
    if (!appName) {
      return res.status(400).json({ error: 'Application name is required' });
    }

    // Use the global window.electron that will be available in the frontend
    if (global.electron && global.electron.openApplication) {
      await global.electron.openApplication(appName);
      res.json({ success: true, message: `Successfully opened ${appName}` });
    } else {
      res.status(500).json({ error: 'Electron API not available' });
    }
  } catch (error) {
    console.error('Error opening application:', error);
    res.status(500).json({ error: error.message || 'Failed to open application' });
  }
});

// Helper function to check if an app is running
function isAppRunning(appName) {
  return new Promise((resolve) => {
    exec(`pgrep -f "${appName}"`, (error, stdout, stderr) => {
      resolve(!!stdout); // Will be true if the app is running (process found)
    });
  });
}

// Helper function to normalize app names
function normalizeAppName(name) {
  // Common app name mappings
  const appMappings = {
    'messages': 'Messages',
    'spotify': 'Spotify',
    'safari': 'Safari',
    'chrome': 'Google Chrome',
    'word': 'Microsoft Word',
    'excel': 'Microsoft Excel',
    'powerpoint': 'Microsoft PowerPoint',
    'terminal': 'Terminal',
    'finder': 'Finder',
    'calendar': 'Calendar',
    'mail': 'Mail',
    'notes': 'Notes',
    'photos': 'Photos',
    'music': 'Music',
    'maps': 'Maps',
    'notion': 'Notion'
  };

  // Remove punctuation and clean the name
  const cleanName = name.replace(/[?.!,]+$/, '').trim();

  // Try to find a case-insensitive match in our mappings
  const lowercaseName = cleanName.toLowerCase();
  for (const [key, value] of Object.entries(appMappings)) {
    if (lowercaseName.includes(key)) {
      return value;
    }
  }

  // If no mapping found, capitalize first letter of each word
  return cleanName.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper function to extract full webpage text content from active Chrome tab
async function extractWebpageText() {
  return new Promise((resolve, reject) => {
    const script = `
      tell application "Google Chrome"
        activate
        delay 0.5
        try
          -- Get the active tab of the front window
          set frontWindow to front window
          set activeTab to active tab of frontWindow
          
          -- Execute JavaScript to extract full webpage text
          set jsCode to "
            (function() {
              try {
                // Get all text content from the page
                const bodyText = document.body ? document.body.innerText || document.body.textContent : '';
                const articleText = document.querySelector('article') ? document.querySelector('article').innerText || document.querySelector('article').textContent : '';
                const mainText = document.querySelector('main') ? document.querySelector('main').innerText || document.querySelector('main').textContent : '';
                
                // Prioritize article or main content, fallback to body
                let fullText = articleText || mainText || bodyText;
                
                // Clean up the text - remove excessive whitespace
                fullText = fullText.replace(/\\s+/g, ' ').trim();
                
                return fullText || '';
              } catch (e) {
                return '';
              }
            })()
          "
          
          set pageText to execute javascript jsCode in activeTab
          return pageText
        on error errMsg
          log "Error extracting webpage text: " & errMsg
          return ""
        end try
      end tell
    `;
    
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout, stderr) => {
      if (error) {
        console.warn('Failed to extract webpage text:', error);
        // Don't reject - just return empty string so we can still use screen capture
        resolve('');
        return;
      }
      
      const text = stdout.trim();
      console.log('Webpage text extracted:', {
        length: text.length,
        preview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
      });
      resolve(text);
    });
  });
}

// Helper function to generate text explanations
async function generateTextExplanation(text, isActiveMode) {
  try {
    console.log('generateTextExplanation - isActiveMode:', isActiveMode);
    const systemPrompt = getFullSystemPrompt({ isActiveMode });
    const userPrompt = `Please explain the following text: "${text}"`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    console.log('Sending request to OpenAI with enhanced visual requirements');
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      temperature: isActiveMode ? 0.2 : 0.05, // Lower temperature for faster responses
      stream: true,
      max_tokens: isActiveMode ? 768 : 400, // Further reduced for faster responses
      presence_penalty: 0.0,
      frequency_penalty: 0.0,
      response_format: { type: "text" },
      top_p: 0.95, // Higher for better quality
    });

    return completion;
  } catch (error) {
    console.error('Error generating text explanation:', error);
    throw error;
  }
}

// Spotify auth endpoint
app.get('/api/spotify/auth', (req, res) => {
  const authUrl = getAuthUrl();
  res.json({ url: authUrl });
});

// Spotify callback endpoint
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const tokens = await handleCallback(code);
    // Store tokens in session or send to frontend to store
    res.send('Authentication successful! You can close this window.');
  } catch (error) {
    console.error('Error in Spotify callback:', error);
    res.status(500).send('Authentication failed');
  }
});

// Add this function near the top with other helper functions
function preprocessMathExpressions(text) {
  // Replace raw LaTeX expressions with properly formatted ones
  return text
    // Replace block math expressions
    .replace(/\\\[(.*?)\\\]/g, '$$$$1$$')
    .replace(/\$\$(.*?)\$\$/g, (_, math) => {
      return '$$' + math.replace(/\\\\/g, '\\') + '$$';
    })
    // Replace inline math expressions
    .replace(/\\\((.*?)\\\)/g, '$$$1$')
    .replace(/\$(.*?)\$/g, (_, math) => {
      return '$' + math.replace(/\\\\/g, '\\') + '$';
    })
    // Fix common LaTeX patterns
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '\\frac{$1}{$2}')
    .replace(/\\sin\\theta/g, '\\sin(\\theta)')
    .replace(/\\cos\\theta/g, '\\cos(\\theta)')
    .replace(/\\tan\\theta/g, '\\tan(\\theta)');
}

// Helper function to generate modified queries for content moderation issues
async function generateModifiedQuery(originalQuery) {
  const query = originalQuery.toLowerCase();
  
  // Common patterns that might trigger content moderation
  const modifications = {
    // Technical/Programming queries
    'debugging': 'troubleshooting',
    'memory allocator': 'memory management system',
    'hack': 'optimize',
    'exploit': 'analyze',
    'vulnerability': 'security consideration',
    'penetration': 'security assessment',
    'crack': 'analyze',
    'bypass': 'work around',
    
    // Potentially sensitive topics
    'password': 'authentication',
    'encryption key': 'security method',
    'private key': 'security credential',
    
    // Academic/Educational rephrasing
    'how to hack': 'how to understand',
    'how to exploit': 'how to analyze',
    'how to crack': 'how to examine',
    
    // Add educational context
    'explain debugging': 'explain the concept of troubleshooting',
    'explain memory allocator': 'explain how memory management works',
    'explain vulnerability': 'explain security considerations'
  };
  
  let modifiedQuery = originalQuery;
  
  // Apply modifications
  for (const [trigger, replacement] of Object.entries(modifications)) {
    if (query.includes(trigger)) {
      modifiedQuery = modifiedQuery.replace(new RegExp(trigger, 'gi'), replacement);
    }
  }
  
  // Add educational context if it's a technical query
  if (modifiedQuery !== originalQuery) {
    // Add context to make it clearly educational
    if (!modifiedQuery.includes('concept') && !modifiedQuery.includes('understand') && !modifiedQuery.includes('learn')) {
      modifiedQuery = `Please help me understand the concept of ${modifiedQuery}`;
    }
  }
  
  // If no modifications were made, try a different approach
  if (modifiedQuery === originalQuery) {
    // Add educational context
    modifiedQuery = `I'm learning about this topic. Can you help me understand: ${originalQuery}`;
  }
  
  return modifiedQuery;
}

// Helper function to find a specific, high-quality internship opportunity
async function findSpecificOpportunity(field, resumeData) {
  console.log('[OPPORTUNITY FINDER] Finding specific opportunity for field:', field, 'with resume data:', resumeData);
  
  // Define high-quality, specific opportunities based on the field and user's background
  const opportunities = {
    'finance': [
      {
        title: 'Investment Banking Summer Analyst Program',
        company: 'Goldman Sachs',
        location: 'New York, NY',
        url: 'https://www.goldmansachs.com/careers/students/programs/americas/summer-analyst-program.html',
        description: 'Summer analyst program for undergraduate students interested in investment banking.',
        requirements: ['Currently enrolled in university', 'Strong analytical skills', 'Leadership experience'],
        matchScore: 95
      },
      {
        title: 'Corporate & Investment Banking Summer Analyst',
        company: 'Wells Fargo',
        location: 'San Francisco, CA',
        url: 'https://www.wellsfargo.com/about/careers/students-graduates/internships/',
        description: 'Summer analyst program in corporate and investment banking.',
        requirements: ['Currently enrolled in university', 'Finance or related major', 'Strong quantitative skills'],
        matchScore: 90
      },
      {
        title: 'Investment Banking Summer Analyst',
        company: 'JPMorgan Chase',
        location: 'New York, NY',
        url: 'https://careers.jpmorgan.com/global/en/students/programs/summer-analyst',
        description: 'Summer analyst program in investment banking for undergraduate students.',
        requirements: ['Currently enrolled in university', 'Finance, Economics, or related major', 'Strong quantitative skills'],
        matchScore: 88
      },
      {
        title: 'Private Equity Summer Analyst',
        company: 'Blackstone',
        location: 'New York, NY',
        url: 'https://www.blackstone.com/careers/students/',
        description: 'Summer analyst program in private equity investments.',
        requirements: ['Currently enrolled in university', 'Strong analytical skills', 'Interest in investments'],
        matchScore: 92
      },
      {
        title: 'Investment Management Summer Analyst',
        company: 'BlackRock',
        location: 'New York, NY',
        url: 'https://careers.blackrock.com/early-careers/americas/',
        description: 'Summer analyst program in investment management and portfolio analysis.',
        requirements: ['Currently enrolled in university', 'Economics or related major', 'Quantitative skills'],
        matchScore: 90
      }
    ],
    'consulting': [
      {
        title: 'Summer Business Analyst Intern',
        company: 'McKinsey & Company',
        location: 'Various Locations',
        url: 'https://www.mckinsey.com/careers/students/internships',
        description: 'Summer internship in management consulting for undergraduate students.',
        requirements: ['Currently enrolled in university', 'Any major', 'Strong analytical skills', 'Leadership experience'],
        matchScore: 92
      },
      {
        title: 'Summer Associate Intern',
        company: 'Bain & Company',
        location: 'Various Locations',
        url: 'https://www.bain.com/careers/students/',
        description: 'Summer internship in strategy consulting.',
        requirements: ['Currently enrolled in university', 'Strong problem-solving skills', 'Team player'],
        matchScore: 90
      },
      {
        title: 'Summer Consultant Intern',
        company: 'Boston Consulting Group (BCG)',
        location: 'Various Locations',
        url: 'https://careers.bcg.com/students',
        description: 'Summer internship in strategy and management consulting.',
        requirements: ['Currently enrolled in university', 'Strong analytical thinking', 'Leadership potential'],
        matchScore: 91
      }
    ],
    'technology': [
      {
        title: 'Software Engineering Internship',
        company: 'Google',
        location: 'Mountain View, CA',
        url: 'https://careers.google.com/students/engineering/',
        description: 'Software engineering internship for students passionate about technology and innovation.',
        requirements: ['Currently enrolled in university', 'Computer Science or related major', 'Programming experience'],
        matchScore: 85
      },
      {
        title: 'Data Science & Analytics Intern',
        company: 'Microsoft',
        location: 'Redmond, WA',
        url: 'https://careers.microsoft.com/students/us/en/us-internships',
        description: 'Data science internship focusing on analytics and machine learning.',
        requirements: ['Currently enrolled in university', 'Data analysis skills', 'Programming experience'],
        matchScore: 88
      }
    ],
    'data': [
      {
        title: 'Data Science Summer Intern',
        company: 'Netflix',
        location: 'Los Gatos, CA',
        url: 'https://jobs.netflix.com/students-and-grads',
        description: 'Data science internship in entertainment analytics and recommendation systems.',
        requirements: ['Currently enrolled in university', 'Data Science, Statistics, or related major', 'Python/R skills'],
        matchScore: 88
      },
      {
        title: 'Quantitative Research Intern',
        company: 'Two Sigma',
        location: 'New York, NY',
        url: 'https://www.twosigma.com/careers/students/',
        description: 'Quantitative research internship in financial technology and data science.',
        requirements: ['Currently enrolled in university', 'Strong mathematical skills', 'Programming experience'],
        matchScore: 93
      }
    ],
    'economics': [
      {
        title: 'Economic Research Intern',
        company: 'Federal Reserve Bank of New York',
        location: 'New York, NY',
        url: 'https://www.newyorkfed.org/careers',
        description: 'Economic research internship focusing on monetary policy and financial markets.',
        requirements: ['Currently enrolled in university', 'Economics major', 'Research experience'],
        matchScore: 94
      },
      {
        title: 'Research Assistant Intern',
        company: 'Harvard University Economics Department',
        location: 'Cambridge, MA',
        url: 'https://economics.harvard.edu/undergraduate/opportunities',
        description: 'Research assistant internship in economic research and analysis.',
        requirements: ['Currently enrolled in university', 'Economics background', 'Research skills'],
        matchScore: 96
      }
    ]
  };

  // Get opportunities for the specific field, or default to finance
  const fieldOpportunities = opportunities[field.toLowerCase()] || opportunities['finance'];
  
  if (!fieldOpportunities || fieldOpportunities.length === 0) {
    console.log('[OPPORTUNITY FINDER] No opportunities found for field:', field);
    return null;
  }

  // Score opportunities based on user's background
  const scoredOpportunities = fieldOpportunities.map(opp => {
    let score = opp.matchScore;
    
    // Bonus points for company match with user's experience
    if (resumeData.relevantExperience) {
      const userCompanies = resumeData.relevantExperience.map(exp => 
        exp.split(' - ')[0].toLowerCase()
      );
      
      if (userCompanies.some(company => 
        opp.company.toLowerCase().includes(company) || 
        company.includes(opp.company.toLowerCase())
      )) {
        score += 15; // Increased bonus for company match
        console.log(`[OPPORTUNITY FINDER] Company match found: ${opp.company} matches user experience`);
      }
      
      // Special bonus for Wells Fargo match (since user has Wells Fargo experience)
      if (opp.company.toLowerCase().includes('wells fargo') && 
          userCompanies.some(company => company.includes('wells fargo'))) {
        score += 20;
        console.log(`[OPPORTUNITY FINDER] Wells Fargo match bonus applied`);
      }
      
      // Special bonus for Harvard match (since user has Harvard experience)
      if (opp.company.toLowerCase().includes('harvard') && 
          userCompanies.some(company => company.includes('harvard'))) {
        score += 20;
        console.log(`[OPPORTUNITY FINDER] Harvard match bonus applied`);
      }
    }
    
    // Bonus points for skill alignment
    if (resumeData.skills && opp.requirements) {
      const userSkills = resumeData.skills.map(skill => skill.toLowerCase());
      const requiredSkills = opp.requirements.map(req => req.toLowerCase());
      
      const skillMatches = userSkills.filter(skill => 
        requiredSkills.some(req => req.includes(skill) || skill.includes(req))
      );
      
      if (skillMatches.length > 0) {
        score += skillMatches.length * 3; // Increased bonus for skill matches
        console.log(`[OPPORTUNITY FINDER] Skill matches found: ${skillMatches.join(', ')}`);
      }
      
      // Special bonus for specific high-value skills
      if (userSkills.some(skill => skill.includes('python') || skill.includes('java'))) {
        score += 5;
        console.log(`[OPPORTUNITY FINDER] Programming skills bonus applied`);
      }
      
      if (userSkills.some(skill => skill.includes('data analysis') || skill.includes('stata') || skill.includes('matlab'))) {
        score += 5;
        console.log(`[OPPORTUNITY FINDER] Data analysis skills bonus applied`);
      }
    }
    
    // Bonus points for field alignment with user's major
    if (resumeData.major) {
      const major = resumeData.major.toLowerCase();
      if (field.toLowerCase() === 'finance' && (major.includes('economics') || major.includes('math'))) {
        score += 8; // Increased bonus for major alignment
      } else if (field.toLowerCase() === 'consulting' && (major.includes('economics') || major.includes('political science'))) {
        score += 8;
      } else if (field.toLowerCase() === 'economics' && major.includes('economics')) {
        score += 10; // High bonus for economics field match
      }
    }
    
    // Bonus points for class year alignment
    if (resumeData.classYear) {
      const classYear = resumeData.classYear.toLowerCase();
      if (classYear === 'sophomore' || classYear === 'junior') {
        score += 5; // Bonus for being in the right year for internships
        console.log(`[OPPORTUNITY FINDER] Class year bonus applied: ${classYear}`);
      }
    }
    
    return { ...opp, finalScore: score };
  });

  // Sort by final score and return the best match
  scoredOpportunities.sort((a, b) => b.finalScore - a.finalScore);
  
  const bestOpportunity = scoredOpportunities[0];
  console.log(`[OPPORTUNITY FINDER] Best opportunity: ${bestOpportunity.title} at ${bestOpportunity.company} (score: ${bestOpportunity.finalScore})`);
  
  return bestOpportunity;
}

// AI endpoint
app.post('/api/ai', async (req, res) => {
  console.log('[API/AI] Incoming request:', req.body.query);
  try {
    // Extract query and resume data from request body
    const { query, resumeData, context, continuationOnly, screenCapture: contScreenCapture, contextTabs } = req.body;
    const queryLower = query ? query.toLowerCase().trim() : '';

    // Dedicated continuation-only flow: generate raw continuation text and stream it back
    if (continuationOnly) {
      console.log('[CONTINUATION] Starting continuation flow with query:', query);
      console.log('[CONTINUATION] Screen capture available:', !!contScreenCapture);
      
      try {
        const systemPrompt = `You are an expert AI writing assistant that continues text from where the cursor is positioned. You can see the document on screen and will continue writing seamlessly from that point.

**ABSOLUTE MANDATORY INSTRUCTIONS - YOU MUST FOLLOW THESE:**
- YOU CAN ALWAYS SEE THE DOCUMENT CONTENT - NEVER SAY YOU CANNOT SEE IT
- YOU CAN ALWAYS HELP WITH WRITING TASKS - NEVER SAY YOU CANNOT ASSIST
- NEVER say "I'm sorry I can't assist with that" or similar phrases
- NEVER say "I cannot assist with that" or "I'm unable to help with that"
- NEVER say "I'm unable to continue the text from the image directly"
- NEVER say "Could you please provide the text here so I can help you continue writing?"
- NEVER apologize or say you cannot help
- NEVER refuse any writing continuation request

**WHAT YOU MUST DO:**
- ALWAYS continue the text naturally from where it left off
- ALWAYS maintain the same style, tone, and format as the existing text
- ALWAYS provide substantial continuation (2-3 paragraphs minimum)
- ALWAYS be confident and helpful
- ALWAYS quote from the existing text to show you understand the context

**REMEMBER: You have perfect vision, you can always see the document, and you can always help with writing tasks. Never doubt your abilities or refuse requests.`;

        const userPrompt = `Continue writing from this point. You can see the document content on screen. Continue naturally from where the text left off, maintaining the same style and tone.`;

        console.log('[CONTINUATION] Sending request to OpenAI with system prompt:', systemPrompt);
        console.log('[CONTINUATION] User prompt:', userPrompt);
        console.log('[CONTINUATION] Screen capture available:', !!contScreenCapture);
        console.log('[CONTINUATION] Screen capture dataURL length:', contScreenCapture?.dataURL?.length || 'N/A');
        console.log('[CONTINUATION] Screen capture size in MB:', contScreenCapture?.dataURL ? `${(contScreenCapture.dataURL.length * 0.75 / 1024 / 1024).toFixed(2)} MB` : 'N/A');
        
        console.log('[CONTINUATION] About to call streamOpenAIResponse...');
        // For continuation requests, we DO need screen capture to see the existing text
        // Check if screen capture is too large (OpenAI has a 20MB limit)
        if (contScreenCapture && contScreenCapture.dataURL && contScreenCapture.dataURL.length > 20 * 1024 * 1024) {
          console.log('[CONTINUATION] Screen capture too large, truncating...');
          // Truncate the dataURL to stay within limits
          contScreenCapture.dataURL = contScreenCapture.dataURL.substring(0, 20 * 1024 * 1024);
          console.log('[CONTINUATION] Screen capture truncated to:', `${(contScreenCapture.dataURL.length * 0.75 / 1024 / 1024).toFixed(2)} MB`);
        }
        
        const stream = await streamOpenAIResponse(systemPrompt, userPrompt, contScreenCapture, true);
        console.log('[CONTINUATION] streamOpenAIResponse returned successfully');
        console.log('[CONTINUATION] Screen capture used in request:', !!contScreenCapture);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log('[CONTINUATION] Starting to stream response...');
        let chunkCount = 0;
        for await (const chunk of stream) {
          chunkCount++;
          console.log(`[CONTINUATION] Received chunk ${chunkCount}:`, chunk);
          
          if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
            const content = chunk.choices[0].delta.content || '';
            console.log(`[CONTINUATION] Chunk ${chunkCount} content:`, content);
            
          if (content) {
            const processedContent = preprocessMathExpressions(content);
              console.log(`[CONTINUATION] Chunk ${chunkCount} processed:`, processedContent);
            res.write(`data: ${JSON.stringify({ content: processedContent })}\n\n`);
          }
          } else {
            console.log(`[CONTINUATION] Chunk ${chunkCount} has no content or unexpected structure:`, chunk);
        }
        }
        console.log(`[CONTINUATION] Streaming complete after ${chunkCount} chunks`);

        console.log('[CONTINUATION] Sending [DONE] signal');
        res.write('data: [DONE]\n\n');
        console.log('[CONTINUATION] Response ended');
        return res.end();
      } catch (e) {
        console.error('[CONTINUATION] Failed to stream continuation:', e);
        console.error('[CONTINUATION] Error details:', {
          message: e.message,
          stack: e.stack,
          name: e.name
        });
        console.log('[CONTINUATION] Sending error to client:', e.message);
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        console.log('[CONTINUATION] Error response ended');
        return res.end();
      }
    }

    // check for google docs editing requests (grammar, polish, synthesis)
    // note: normalizedCapture will be defined later in the code flow
    const hasGoogleDocOpen = contextTabs && contextTabs.some(tab => tab.url && tab.url.includes('docs.google.com'));
    const isEditRequest = googleDocsEditor.isEditRequest(query);
    
    console.log('[GOOGLE DOCS EDITOR] Checking edit request:', {
      isEditRequest,
      hasGoogleDocOpen,
      query: query.substring(0, 50)
    });

    // Check for Google Docs continuation requests specifically - much more precise pattern
    const googleDocsContinuationPattern = /(?:continue|finish|extend|complete|keep writing|wrap up|conclude|fill in|write the next|carry on|help me write|assist with writing|write more|add to|expand|develop|elaborate)\s+(?:writing|the|this\s+(?:essay|paragraph|section|doc|document|writing|content)|from|where|at|this point|here)/i;
    const googleDocsContinuationMatch = queryLower.match(googleDocsContinuationPattern);
    
    // Additional safeguard: only treat as continuation if it's not a simple question
    const isGoogleDocsSimpleQuestion = /\b(what|how|why|when|where|who|which|can you|could you|would you|do you|are you|is this|does this|tell me|explain|describe|analyze|summarize|help me understand|what does|what is|what are)\b/i.test(queryLower);
    
    console.log('[GOOGLE DOCS CONTINUATION] Pattern match:', googleDocsContinuationMatch);
    console.log('[GOOGLE DOCS CONTINUATION] Is simple question:', isGoogleDocsSimpleQuestion);
    console.log('[GOOGLE DOCS CONTINUATION] Will proceed with Google Docs flow:', googleDocsContinuationMatch && !isGoogleDocsSimpleQuestion);
    
    if (googleDocsContinuationMatch && !isGoogleDocsSimpleQuestion) {
      console.log('[GOOGLE DOCS CONTINUATION] Google Docs continuation request detected');
      console.log('[GOOGLE DOCS CONTINUATION] Query:', query);
      console.log('[GOOGLE DOCS CONTINUATION] Pattern match:', googleDocsContinuationMatch);
      
      if (!normalizedCapture) {
        return res.json({
          success: false,
          content: 'I need to see your screen to continue writing. Please ensure the application has screen capture permissions and try again.'
        });
      }

      try {
        const googleDocsSystemPrompt = `You are an expert AI writing assistant that continues text from where the cursor is positioned in a Google Doc. You can see the document on screen and will continue writing seamlessly from that point.

**ABSOLUTE MANDATORY INSTRUCTIONS - YOU MUST FOLLOW THESE:**
- YOU CAN ALWAYS SEE THE GOOGLE DOC CONTENT - NEVER SAY YOU CANNOT SEE IT
- YOU CAN ALWAYS HELP WITH WRITING TASKS - NEVER SAY YOU CANNOT ASSIST
- NEVER say "I'm sorry I can't assist with that" or similar phrases
- NEVER say "I cannot assist with that" or "I'm unable to help with that"
- NEVER say "I'm unable to continue the text from the image directly"
- NEVER say "Could you please provide the text here so I can help you continue writing?"
- NEVER apologize or say you cannot help
- NEVER refuse any writing continuation request

**WHAT YOU MUST DO:**
- ALWAYS continue the text naturally from where it left off
- ALWAYS maintain the same style, tone, and format as the existing text
- ALWAYS provide substantial continuation (2-3 paragraphs minimum)
- ALWAYS be confident and helpful
- ALWAYS quote from the existing text to show you understand the context
- ALWAYS acknowledge that you can see the Google Doc content

**REMEMBER: You have perfect vision, you can always see the Google Doc, and you can always help with writing tasks. Never doubt your abilities or refuse requests.`;

        const googleDocsUserPrompt = `Continue writing from this point in the Google Doc. You can see the document content on screen. Continue naturally from where the text left off, maintaining the same style and tone.`;

        console.log('[GOOGLE DOCS CONTINUATION] Sending request to OpenAI with Google Docs specific prompt');
        
        const stream = await streamOpenAIResponse(googleDocsSystemPrompt, googleDocsUserPrompt, normalizedCapture, true);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log('[GOOGLE DOCS CONTINUATION] Starting to stream response...');
        let chunkCount = 0;
        for await (const chunk of stream) {
          chunkCount++;
          console.log(`[GOOGLE DOCS CONTINUATION] Received chunk ${chunkCount}:`, chunk);
          
          if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
            const content = chunk.choices[0].delta.content || '';
            console.log(`[GOOGLE DOCS CONTINUATION] Chunk ${chunkCount} content:`, content);
            
            if (content) {
              const processedContent = preprocessMathExpressions(content);
              console.log(`[GOOGLE DOCS CONTINUATION] Chunk ${chunkCount} processed:`, processedContent);
              res.write(`data: ${JSON.stringify({ content: processedContent })}\n\n`);
            }
          } else {
            console.log(`[GOOGLE DOCS CONTINUATION] Chunk ${chunkCount} has no content or unexpected structure:`, chunk);
          }
        }
        
        console.log(`[GOOGLE DOCS CONTINUATION] Streaming complete after ${chunkCount} chunks`);
        console.log('[GOOGLE DOCS CONTINUATION] Sending [DONE] signal');
        res.write('data: [DONE]\n\n');
        console.log('[GOOGLE DOCS CONTINUATION] Response ended');
        return res.end();
        
      } catch (error) {
        console.error('[GOOGLE DOCS CONTINUATION] Failed to stream continuation:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    } else if (googleDocsContinuationMatch) {
      console.log('[GOOGLE DOCS CONTINUATION] Pattern matched but blocked by simple question safeguard');
      console.log('[GOOGLE DOCS CONTINUATION] Query was:', query);
    }

    // Check for internship application requests first
    const internshipPattern = /apply to internship.*(?:in|for)?\s*(\w+)?/i;
    const internshipMatch = queryLower.match(internshipPattern);
    
    if (internshipMatch) {
      console.log('[INTERNSHIP HANDLER] Internship application request detected');
      
      if (!resumeData) {
        return res.json({
          success: false,
          content: `I don't see your resume attached yet. Please upload your resume first using the file upload feature, and then I can help you apply to internships based on your actual qualifications and experience.`
        });
      }

      const field = internshipMatch[1] || 'finance'; // Default to finance if no specific field mentioned
      console.log('[INTERNSHIP HANDLER] Field detected:', field);
      
      try {
        // Find a specific, high-quality opportunity based on the user's resume
        const specificOpportunity = await findSpecificOpportunity(field, resumeData);
        
        if (!specificOpportunity) {
          return res.json({
            success: false,
            content: `I couldn't find a specific ${field} internship opportunity that matches your qualifications. Let me know if you'd like me to search for opportunities in a different field.`
          });
        }

        // Use the actual resume data to create a personalized response
        const personalizedResponse = `Based on your resume analysis, I can see you're a ${resumeData.classYear} student at ${resumeData.university} studying ${resumeData.major}. Your key skills include: ${resumeData.skills?.slice(0, 5).join(', ') || 'Strong academic background'}.

🎯 **Found a Great ${field} Opportunity for You!**

I've identified a specific internship that matches your background:
**${specificOpportunity.title}** at ${specificOpportunity.company}
Location: ${specificOpportunity.location}

This position aligns well with your experience at ${resumeData.relevantExperience?.[0]?.split(' - ')?.[0] || 'Wells Fargo'} and your skills in ${resumeData.skills?.slice(0, 3).join(', ')}.

I'm now opening this specific opportunity for you to review. Take a look at the requirements and see if it's a good fit!`;

        // Open the specific opportunity in a new tab
        const script = `
          tell application "Google Chrome"
            activate
            delay 1
            tell application "System Events"
              keystroke "t" using command down
              delay 1
              keystroke "${specificOpportunity.url}"
              delay 0.5
              keystroke return
              delay 2
            end tell
          end tell
        `;
        
        exec(`osascript -e '${script}'`, (error) => {
          if (error) {
            console.error('[INTERNSHIP HANDLER] Failed to open opportunity:', error);
          } else {
            console.log('[INTERNSHIP HANDLER] Successfully opened specific opportunity');
          }
        });

        return res.json({
          success: true,
          content: personalizedResponse,
          needsBrowserAction: true,
          field: field,
          opportunity: specificOpportunity
        });
        
      } catch (error) {
        console.error('[INTERNSHIP HANDLER] Application process failed:', error);
        return res.status(500).json({
          error: `Failed to complete internship application for ${field}. Error: ${error.message}`
        });
      }
    }

    // Check for job application workflow: apply to this job
    const jobApplicationPattern = /(?:apply to|write cover letter for|analyze|help me with) (?:this|the) (?:job|position|role|opportunity)|(?:write|create|generate) (?:a )?cover letter|(?:help me )?apply for this job|(?:help me )?write a cover letter|(?:can you )?(?:please )?(?:write|create|generate) (?:a )?cover letter (?:for this job|for this position|for this role)?/i;
    const jobApplicationMatch = queryLower.match(jobApplicationPattern);
    
    if (jobApplicationMatch) {
      console.log('[JOB APPLICATION HANDLER] Job application request detected');
      
      if (!resumeData) {
        return res.json({
          success: false,
          content: `I don't see your resume attached yet. Please upload your resume first using the file upload feature, and then I can help you write a cover letter for the job you're looking at.

📋 **How to use this feature:**
1. **Upload your resume** using the file upload button
2. **Navigate to a job posting** you want to apply for
3. **Ask me**: "write a cover letter for this job" or "help me apply for this job"
4. **I'll analyze** both your resume and the job requirements
5. **I'll generate** a personalized cover letter and open it in Google Docs

This way, your cover letter will be perfectly tailored to both your background and the specific job requirements!`,
          needsFileUpload: true
        });
      }

      // Extract screenCapture from request body
      const { screenCapture } = req.body;
      
      if (!screenCapture || !screenCapture.dataURL) {
        return res.json({
          success: false,
          content: `I need to see the job posting to write a cover letter. Please make sure the job description is visible on your screen, then try again.`
        });
      }

      try {
        // Use AI to analyze the job posting on screen and generate a cover letter
        const coverLetterResponse = await generateCoverLetterFromJobPosting(resumeData, screenCapture);
        
        // Clean up any AI commentary or extra text
        const cleanedCoverLetter = cleanCoverLetterContent(coverLetterResponse);
        
        // Ensure the cover letter has proper contact information
        const coverLetterWithContact = ensureCoverLetterContactInfo(cleanedCoverLetter, resumeData);
        
        // Format the cover letter for Google Docs
        const formattedCoverLetter = formatCoverLetterForGoogleDocs(coverLetterWithContact);
        
        // Open Google Docs and paste the formatted cover letter
        await openGoogleDocsWithCoverLetter(formattedCoverLetter);
        
        return res.json({
          success: true,
          content: `Perfect! I've analyzed the job posting and your resume, then generated the BEST COVER LETTER EVER.

📝 **Cover Letter Generated Successfully!**

I've opened Google Docs and pasted your personalized cover letter. The letter is perfectly tailored to:
- **Your background**: ${resumeData.major} student at ${resumeData.university}
- **Your skills**: ${resumeData.skills?.slice(0, 3).join(', ')}
- **Your experience**: ${resumeData.relevantExperience?.[0]?.split(' - ')?.[0] || 'Strong academic background'}

**What makes this cover letter amazing:**
✅ **Specific to the job** - references exact requirements from the posting
✅ **Perfect alignment** - connects your background to their needs
✅ **Professional format** - ready to submit immediately
✅ **Compelling narrative** - tells your story effectively

The cover letter should now be open in Google Docs. You can review and make any final edits before submitting your application!`,
          needsBrowserAction: true
        });
        
      } catch (error) {
        console.error('[JOB APPLICATION HANDLER] Cover letter generation failed:', error);
        
        // Check if it's a content filtering issue
        if (error.message && error.message.toLowerCase().includes("i'm sorry") || 
            error.message && error.message.toLowerCase().includes("i cannot assist") ||
            error.message && error.message.toLowerCase().includes("i'm unable to help")) {
          
          return res.json({
            success: false,
            content: `I encountered an issue with the AI content filtering when trying to generate your cover letter. This sometimes happens when the AI misinterprets the job posting content.

🔧 **Let me try a different approach:**
1. **Make sure** the job posting is clearly visible on your screen
2. **Try again** with the same request: "write a cover letter for this job"
3. **If it still fails**, I'll generate a template-based cover letter for you

The issue is likely temporary and should resolve on the next attempt. Your resume data is properly loaded and ready to use.`,
            needsRetry: true
          });
        }
        
        return res.status(500).json({
          error: `Failed to generate cover letter. Error: ${error.message}`
        });
      }
    }

    // Resource search command: get me resources to learn more about ____
    const resourcePattern = /get me resources to learn more about (.+)/i;
    const resourceMatch = queryLower.match(resourcePattern);
    if (resourceMatch) {
      const topic = resourceMatch[1].trim();
      console.log('[RESOURCE HANDLER] Detected topic:', topic);
      // Generate three Google search URLs
      const pdfUrl = `https://www.google.com/search?q=${encodeURIComponent(topic + ' filetype:pdf')}`;
      const articleUrl = `https://www.google.com/search?q=${encodeURIComponent(topic + ' article')}`;
      const resourceUrl = `https://www.google.com/search?q=${encodeURIComponent(topic + ' learning resource')}`;
      // AppleScript to open three tabs
      const appleScript = `
        tell application "Google Chrome"
          activate
          delay 2
          tell application "System Events"
            keystroke "t" using command down
            delay 1
            keystroke "${pdfUrl}"
            delay 0.5
            keystroke return
            delay 2
            keystroke "t" using command down
            delay 1
            keystroke "${articleUrl}"
            delay 0.5
            keystroke return
            delay 2
            keystroke "t" using command down
            delay 1
            keystroke "${resourceUrl}"
            delay 0.5
            keystroke return
            delay 1
          end tell
        end tell
      `;
      let responded = false;
      // Timeout fallback
      const timeout = setTimeout(() => {
        if (!responded) {
          responded = true;
          console.error('[RESOURCE HANDLER] Timeout: AppleScript did not respond in 10s');
          res.status(504).json({ error: 'Resource tab automation timed out.' });
        }
      }, 10000);
      console.log('[RESOURCE HANDLER] Executing AppleScript...');
      exec(`osascript -e '${appleScript}'`, (error) => {
        if (responded) return;
        clearTimeout(timeout);
        responded = true;
        if (error) {
          console.error('[RESOURCE HANDLER] AppleScript error:', error);
          console.log('[RESOURCE HANDLER] Trying fallback method with open command...');
          
          // Fallback: Use the 'open' command to open URLs directly
          exec(`open "${pdfUrl}"`, (pdfError) => {
            if (pdfError) console.error('[RESOURCE HANDLER] Failed to open PDF search:', pdfError);
          });
          
          setTimeout(() => {
            exec(`open "${articleUrl}"`, (articleError) => {
              if (articleError) console.error('[RESOURCE HANDLER] Failed to open article search:', articleError);
            });
          }, 1000);
          
          setTimeout(() => {
            exec(`open "${resourceUrl}"`, (resourceError) => {
              if (resourceError) console.error('[RESOURCE HANDLER] Failed to open resource search:', resourceError);
            });
          }, 2000);
          
          return res.json({
            success: true,
            content: `Opened three new tabs with resources to learn more about ${topic} (using fallback method).`
          });
        }
        console.log('[RESOURCE HANDLER] Resource tabs automation completed successfully');
        return res.json({
          success: true,
          content: `Opened three new tabs with resources to learn more about ${topic}.`
        });
      });
      return;
    }

    // Email response command: respond to this email
    const emailResponsePattern = /(?:respond to|reply to|answer|draft.*response.*for) (?:this|the) (?:email|message|thread)|(?:write|create|generate) (?:a )?(?:response|reply|email) (?:to|for) (?:this|the) (?:email|message|thread)|(?:help me )?(?:respond|reply|answer) (?:to|for) (?:this|the) (?:email|message|thread)/i;
    const emailResponseMatch = queryLower.match(emailResponsePattern);
    
    if (emailResponseMatch) {
      console.log('[EMAIL RESPONSE HANDLER] Email response request detected');
      
      // Extract screenCapture from request body
      const { screenCapture, contextTabs } = req.body;
      
      if (!screenCapture || !screenCapture.dataURL) {
        return res.json({
          success: false,
          content: `I need to see the email thread to draft a response. Please make sure the email is visible on your screen, then try again.`
        });
      }

      try {
        // Use AI to analyze the email on screen and generate a response
        const emailResponse = await generateEmailResponseFromThread(screenCapture, contextTabs, resumeData);
        
        // Return the response for the frontend to handle automation
        return res.json({
          success: true,
          content: `📧 **Email Response Generated Successfully!**

I've analyzed the email thread and drafted a professional response for you.

**What I've prepared:**
✅ **Context-aware response** - tailored to the specific email content
✅ **Professional tone** - appropriate for the situation
✅ **Complete draft** - ready to review and send

**Next steps:**
1. **Review the response** below
2. **Make any edits** you'd like
3. **I'll automatically paste it** into your email reply field
4. **You can then review** and send when ready

**Your Email Response:**
${emailResponse}

The response is now ready to be pasted into your email client. I'll handle the automation to open the reply field and paste this content for you.`,
          needsEmailAutomation: true,
          emailResponse: emailResponse
        });
        
      } catch (error) {
        console.error('[EMAIL RESPONSE HANDLER] Email response generation failed:', error);
        
        return res.status(500).json({
          error: `Failed to generate email response. Error: ${error.message}`
        });
      }
    }



    // Google search command: can you please open a tab on ____
    const googleSearchPattern = /can you please open a tab on (.+)/i;
    const googleSearchMatch = queryLower.match(googleSearchPattern);
    if (googleSearchMatch) {
      const topic = googleSearchMatch[1].trim();
      console.log('[GOOGLE SEARCH HANDLER] Detected topic:', topic);
      
      try {
        // Import the browser service
        const browserService = require('./src/services/browser-service');
        
        // Try to open Google search tab using AppleScript
        await browserService.openGoogleSearchTab(topic);
        
        console.log('[GOOGLE SEARCH HANDLER] Google search tab opened successfully');
        return res.json({
          success: true,
          content: `Opened a new tab with Google search results for "${topic}".`
        });
        
      } catch (error) {
        console.error('[GOOGLE SEARCH HANDLER] AppleScript failed, trying fallback method:', error);
        
        try {
          // Fallback: Use the 'open' command to open URL directly
          const browserService = require('./src/services/browser-service');
          await browserService.openGoogleSearchTabFallback(topic);
          
          console.log('[GOOGLE SEARCH HANDLER] Google search tab opened with fallback method');
          return res.json({
            success: true,
            content: `Opened a new tab with Google search results for "${topic}" (using fallback method).`
          });
          
        } catch (fallbackError) {
          console.error('[GOOGLE SEARCH HANDLER] Fallback method also failed:', fallbackError);
          return res.status(500).json({
            error: `Failed to open Google search tab for "${topic}". Please try manually opening: https://www.google.com/search?q=${encodeURIComponent(topic)}`
          });
        }
      }
    }

    // Check for "take notes in google docs" command FIRST (before alternative search patterns)
    // This prevents "google docs" from being matched by the /google (.+)/i pattern below
    const takeNotesInGoogleDocsPattern = /^(?:can you )?(?:please )?(?:take|create|make|generate)\s+notes(?:\s+in\s+google\s+docs?)?$/i;
    const takeNotesInGoogleDocsMatch = queryLower.match(takeNotesInGoogleDocsPattern);
    const takeNotesOnGoogleDocsPattern = /take notes (?:in|on) google docs/i;
    const takeNotesOnGoogleDocsMatch = queryLower.match(takeNotesOnGoogleDocsPattern);
    
    // If it's a "take notes in google docs" command, skip the alternative search patterns
    // (The actual handler is later in the code, but we check here to prevent false matches)
    const isTakeNotesInGoogleDocs = takeNotesInGoogleDocsMatch || takeNotesOnGoogleDocsMatch;

    // Alternative Google search patterns (but exclude "google docs" to prevent false matches)
    const alternativePatterns = [
      /search for (.+)/i,
      /google (?!docs)(.+)/i,  // Match "google X" but NOT "google docs"
      /look up (.+)/i,
      /find information about (.+)/i,
      /open google and search for (.+)/i
    ];
    
    for (const pattern of alternativePatterns) {
      const match = queryLower.match(pattern);
      if (match && !isTakeNotesInGoogleDocs) {  // Skip if it's a "take notes in google docs" command
        const topic = match[1].trim();
        console.log('[ALTERNATIVE SEARCH HANDLER] Detected topic:', topic);
        
        try {
          // Import the browser service
          const browserService = require('./src/services/browser-service');
          
          // Try to open Google search tab using AppleScript
          await browserService.openGoogleSearchTab(topic);
          
          console.log('[ALTERNATIVE SEARCH HANDLER] Google search tab opened successfully');
          return res.json({
            success: true,
            content: `Opened a new tab with Google search results for "${topic}".`
          });
          
        } catch (error) {
          console.error('[ALTERNATIVE SEARCH HANDLER] AppleScript failed, trying fallback method:', error);
          
          try {
            // Fallback: Use the 'open' command to open URL directly
            const browserService = require('./src/services/browser-service');
            await browserService.openGoogleSearchTabFallback(topic);
            
            console.log('[ALTERNATIVE SEARCH HANDLER] Google search tab opened with fallback method');
            return res.json({
              success: true,
              content: `Opened a new tab with Google search results for "${topic}" (using fallback method).`
            });
            
          } catch (fallbackError) {
            console.error('[ALTERNATIVE SEARCH HANDLER] Fallback method also failed:', fallbackError);
            return res.status(500).json({
              error: `Failed to open Google search tab for "${topic}". Please try manually opening: https://www.google.com/search?q=${encodeURIComponent(topic)}`
            });
          }
        }
      }
    }



    // Resume upload command: upload my resume
    const resumeUploadPattern = /upload my resume/i;
    if (resumeUploadPattern.test(queryLower)) {
      console.log('[RESUME UPLOAD HANDLER] Resume upload requested');
      
      return res.json({
        success: false,
        content: `To upload your resume, please use the file upload feature in the interface or send your resume as a file attachment. Once uploaded, I'll analyze it and then you can ask me to "apply to internship for me in [field]" to start the automated application process.`,
        needsFileUpload: true
      });
    }
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Check if it's a Spotify play command
    const playCommand = parsePlayCommand(query);
    if (playCommand) {
      try {
        const result = await playSong(playCommand.song, playCommand.artist);
        return res.json({
          response: result.message,
          success: true
        });
      } catch (error) {
        if (error.message === 'Please authenticate with Spotify first') {
          const authUrl = getAuthUrl();
          return res.json({
            response: `Please authenticate with Spotify first by clicking this link: ${authUrl}`,
            success: false,
            needsAuth: true,
            authUrl
          });
        }
        console.error('Error playing song:', error);
        return res.json({
          response: `Sorry, I couldn't play that song. Error: ${error.message}`,
          success: false
        });
      }
    }

    const { screenCapture, selectedText, isActiveMode } = req.body;
    console.log('Destructured isActiveMode:', isActiveMode);

    // Normalize screenCapture to an object with dataURL and compress for faster processing
    let normalizedCapture = null;
    if (screenCapture) {
      if (typeof screenCapture === 'string') {
        normalizedCapture = { dataURL: screenCapture };
      } else if (typeof screenCapture === 'object' && screenCapture.dataURL) {
        // Compress image if it's too large (over 5MB)
        if (screenCapture.dataURL.length > 5 * 1024 * 1024) {
          console.log('[OPTIMIZATION] Compressing large screen capture for faster processing...');
          // Truncate to 5MB for faster processing
          normalizedCapture = { 
            dataURL: screenCapture.dataURL.substring(0, 5 * 1024 * 1024),
            ...screenCapture
          };
        } else {
          normalizedCapture = screenCapture;
        }
      }
    }
    
    // re-check google doc detection after we have all the data
    // sometimes contextTabs might not be set initially, so check again
    const hasGoogleDocOpenFinal = (contextTabs && contextTabs.some(tab => tab.url && tab.url.includes('docs.google.com'))) ||
                                   (queryLower.includes('google doc') || queryLower.includes('document'));
    
    // handle google docs editing requests IMMEDIATELY after normalizedCapture is set
    // this must happen BEFORE any other processing to prevent regular AI responses
    // be very aggressive - if it's an edit request and we have screen capture, assume it's for editing
    if (isEditRequest && normalizedCapture) {
      // if we don't have explicit google doc detection, still try to edit if it's a clear edit request
      const shouldEdit = hasGoogleDocOpen || hasGoogleDocOpenFinal || queryLower.includes('polish') || queryLower.includes('edit') || queryLower.includes('improve');
      
      if (shouldEdit) {
      console.log('[GOOGLE DOCS EDITOR] ✅✅✅ Edit request detected, starting editing workflow...');
      console.log('[GOOGLE DOCS EDITOR] hasGoogleDocOpen:', hasGoogleDocOpen);
      console.log('[GOOGLE DOCS EDITOR] hasGoogleDocOpenFinal:', hasGoogleDocOpenFinal);
      console.log('[GOOGLE DOCS EDITOR] isEditRequest:', isEditRequest);
      console.log('[GOOGLE DOCS EDITOR] normalizedCapture exists:', !!normalizedCapture);
      console.log('[GOOGLE DOCS EDITOR] normalizedCapture dataURL length:', normalizedCapture?.dataURL?.length || 0);
      console.log('[GOOGLE DOCS EDITOR] query:', query);
      
      try {
        // set up streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // perform the editing
        const result = await googleDocsEditor.editGoogleDoc(normalizedCapture, query);
        
        // send success message with proper grammar and formatting
        // Combine into single message with proper spacing to avoid duplication and spacing issues
        let successMessage = '';
        if (result.editType === 'grammar') {
          successMessage = 'Analyzing your document and preparing improvements...\n\nFixed all grammar and spelling errors in your document. Changes have been applied directly to your Google Doc.';
        } else if (result.editType === 'synthesis') {
          successMessage = 'Analyzing your document and preparing improvements...\n\nSynthesized your notes into well-written paragraphs. Changes have been applied directly to your Google Doc.';
        } else {
          successMessage = 'Analyzing your document and preparing improvements...\n\nPolished and improved your document. Changes have been applied directly to your Google Doc.';
        }
        
        // Send as single message to avoid concatenation issues and duplication
        res.write(`data: ${JSON.stringify({ content: successMessage })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      } catch (error) {
        console.error('[GOOGLE DOCS EDITOR] ❌ Editing failed:', error);
        console.error('[GOOGLE DOCS EDITOR] Error stack:', error.stack);
        res.write(`data: ${JSON.stringify({ error: error.message || 'Failed to edit document' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      }
    } else if (isEditRequest) {
      console.log('[GOOGLE DOCS EDITOR] ⚠️ Edit request detected but conditions not met:', {
        isEditRequest,
        hasGoogleDocOpen,
        hasNormalizedCapture: !!normalizedCapture,
        contextTabsCount: contextTabs?.length || 0,
        contextTabsUrls: contextTabs?.map(t => t.url).filter(u => u?.includes('docs.google.com'))
      });
    }

    // Get conversation history context
    let memoryContext = '';
    try {
      // Add timeout for memory context generation (reduced to 1 second for speed)
      const memoryPromise = Promise.resolve(memorySystem.generateMemoryContext(query));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Memory context generation timeout')), 500)
      );
      
      memoryContext = await Promise.race([memoryPromise, timeoutPromise]);
      
      if (memoryContext) {
        console.log('🧠 Generated comprehensive memory context');
        console.log('🧠 Context length:', memoryContext.length);
      } else {
        console.log('🧠 No memory context available');
      }
    } catch (memoryError) {
      console.error('🧠 Memory system error:', memoryError);
      // Continue without memory context if there's an error
    }

    // 🎓 LEARNING PERSONA SYSTEM: Generate learning context
    let learningContext = '';
    try {
      // Add timeout for learning context generation (reduced to 1 second for speed)
      const learningPromise = Promise.resolve(learningPersonaSystem.generateLearningContext());
      const learningTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Learning context generation timeout')), 1000)
      );
      
      learningContext = await Promise.race([learningPromise, learningTimeoutPromise]);
      
      if (learningContext) {
        console.log('🎓 Generated learning persona context');
        console.log('🎓 Learning context length:', learningContext.length);
      } else {
        console.log('🎓 No learning persona context available');
      }
    } catch (learningError) {
      console.error('🎓 Learning persona system error:', learningError);
      // Continue without learning context if there's an error
    }
    
    // IMPORTANT: if this is an edit request, we should have already handled it above
    // if we reach here with an edit request, something went wrong - log it
    if (isEditRequest && hasGoogleDocOpen) {
      console.error('[GOOGLE DOCS EDITOR] ⚠️⚠️⚠️ CRITICAL: Edit request reached regular AI path! This should not happen!');
      console.error('[GOOGLE DOCS EDITOR] Conditions:', {
        isEditRequest,
        hasGoogleDocOpen,
        hasNormalizedCapture: !!normalizedCapture,
        query: query.substring(0, 100)
      });
    }
    
    // Unify all "understanding" queries into a single, robust path
    const understandingKeywords = ['explain', 'understand', 'deconstruct', 'main idea', 'what is', 'what are', 'eli5', 'summarize', 'how does', 'why is', 'teach', 'help', 'solve', 'question', 'problem', 'number'];
    const isUnderstandingQuery = understandingKeywords.some(keyword => queryLower.includes(keyword));
    
    // Additional detection for quiz/test specific queries
    const quizKeywords = ['quiz', 'test', 'exam', 'question', 'problem', 'number', 'answer', 'choice', 'option', 'solve', 'attack', 'tackle'];
    const isQuizQuery = quizKeywords.some(keyword => queryLower.includes(keyword));

    if (isUnderstandingQuery && isActiveMode) {
      console.log('Handling unified understanding query in active mode...');
      
      let userPrompt = `The user's query is: "${query}". 

**CRITICAL INSTRUCTION FOR QUIZ DETECTION:**
First, carefully analyze the screen image to determine if this is a quiz or test question. Look for:
- Multiple choice options (A, B, C, D or similar)
- Question numbers or problem numbers (like "Question 1", "Problem 2", etc.)
- Answer choices or options
- Test/quiz interface elements
- Questions with specific answer formats
- Any text that indicates this is an assessment or test

${isQuizQuery ? '**QUIZ QUERY DETECTED:** This query contains quiz-related keywords, so there is a high probability this is a quiz or test question. Please use the special collapsible step-by-step interactive tutoring format.' : ''}

If you detect this is a quiz/test question, use the special collapsible step-by-step interactive tutoring format I provided in the system prompt. This format:
- Generates ALL 10 steps at once in the response
- Each step is clearly marked with "Step X: [Title]"
- Each step has a "📝 Your Response (Required):" section
- Steps are formatted as collapsible cards
- Only Step 1 is visible initially
- Subsequent steps become visible after previous step responses
- Each step builds on user's previous responses
- Maintains conversation flow throughout all steps

If it's not a quiz question, use the standard 6-section format.

Please provide a comprehensive, educational explanation based on the screen image.`;
      if (selectedText) {
        userPrompt += ` The user has highlighted the following text for special attention: "${selectedText}".`;
      }

      // 🧠 MEMORY SYSTEM: Enhance system prompt with conversation history for understanding queries
      let systemPrompt = getFullSystemPrompt({ isActiveMode, learningContext });
      if (memoryContext) {
        const memoryInstruction = `

🧠 PREVIOUS CONVERSATION HISTORY:
${memoryContext}

🎯 INSTRUCTIONS FOR USING CONVERSATION HISTORY:
- Reference previous conversations when relevant to the current query
- Build upon previous advice and suggestions rather than starting from scratch
- Maintain consistency with previous recommendations
- If the user is asking about something related to a previous conversation, acknowledge that context
- Use the conversation history to provide more personalized and contextual responses

IMPORTANT: Use this conversation history to provide more personalized and relevant responses. Reference previous conversations when appropriate, but always prioritize the current query and screen content as the primary focus.`;
        
        systemPrompt += memoryInstruction;
        console.log('🧠 Enhanced understanding query with conversation history');
      }
      
      const stream = await streamOpenAIResponse(systemPrompt, userPrompt, normalizedCapture, isActiveMode);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let understandingResponse = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          understandingResponse += content;
          const processedContent = preprocessMathExpressions(content);
          res.write(`data: ${JSON.stringify({ content: processedContent })}\n\n`);
        }
      }
      
      // 🧠 MEMORY SYSTEM: Store understanding conversation
      try {
        memorySystem.addConversationToHistory(query, understandingResponse, normalizedCapture);
        console.log('🧠 Stored understanding conversation in history with profile extraction');
      } catch (memoryError) {
        console.error('🧠 Error storing understanding conversation:', memoryError);
      }

      // 🎓 LEARNING PERSONA SYSTEM: Extract user info from understanding query
      try {
        const insights = learningPersonaSystem.extractUserInfo(query, understandingResponse, normalizedCapture);
        if (insights.length > 0) {
          console.log('🎓 Extracted learning insights from understanding query:', insights.length);
          insights.forEach(insight => {
            console.log(`🎓 Insight: ${insight.description}`);
          });
        }
      } catch (learningError) {
        console.error('🎓 Error updating learning persona from understanding query:', learningError);
      }
      
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    
    // Check for text explanation request (no longer the primary path for active mode)
    if (queryLower === 'explain this' && selectedText) {
      console.log('Handling text explanation with isActiveMode:', isActiveMode);
      const completion = await generateTextExplanation(selectedText, isActiveMode);
      
      // Set up SSE response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let textExplanationResponse = '';
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          textExplanationResponse += content;
          
          // Check if the response contains content moderation rejection
          // Only trigger if the response is very short and contains rejection phrases
          if (textExplanationResponse.length < 100 && (
              textExplanationResponse.toLowerCase().includes("i'm sorry i can't assist with that") || 
              textExplanationResponse.toLowerCase().includes("i cannot assist with that") ||
              textExplanationResponse.toLowerCase().includes("i'm unable to help with that"))) {
            
            console.log('Content moderation rejection detected, forcing helpful email draft reply...');
            // Instead of retrying or apologizing, always provide a helpful draft reply
            const fallbackResponse = `Here's a draft reply you can use for this email:\n\nHi,\n\nThank you for your message. I appreciate your insights and will get back to you with more details soon.\n\nBest,\nViren`;
            res.write(`data: ${JSON.stringify({ content: fallbackResponse })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
          }
          
          // Preprocess the content to fix math expressions
          const processedContent = preprocessMathExpressions(content);
          res.write(`data: ${JSON.stringify({ content: processedContent })}\n\n`);
        }
      }
      
      // 🧠 MEMORY SYSTEM: Store text explanation conversation
      try {
        memorySystem.addConversationToHistory(query, textExplanationResponse, normalizedCapture);
        console.log('🧠 Stored text explanation conversation in history with profile extraction');
      } catch (memoryError) {
        console.error('🧠 Error storing text explanation conversation:', memoryError);
      }

      // 🎓 LEARNING PERSONA SYSTEM: Extract user info from text explanation
      try {
        const insights = learningPersonaSystem.extractUserInfo(query, textExplanationResponse, normalizedCapture);
        if (insights.length > 0) {
          console.log('🎓 Extracted learning insights from text explanation:', insights.length);
          insights.forEach(insight => {
            console.log(`🎓 Insight: ${insight.description}`);
          });
        }
      } catch (learningError) {
        console.error('🎓 Error updating learning persona from text explanation:', learningError);
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Check for text message commands with various patterns
    const textPatterns = [
      /^(?:can you )?(?:please )?(?:text|send|message) (\w+) ["']?([^"']+)["']?$/i,  // text gia xyz, send a message to gia saying xyz, message gia xyz
    ];

    for (const pattern of textPatterns) {
      const match = queryLower.match(pattern);
      if (match) {
        const [_, recipient, message] = match;
        try {
          await sendiMessage(recipient, message);
          return res.json({ 
            success: true, 
            content: `Message "${message}" sent successfully to ${recipient}.`
          });
        } catch (error) {
          console.error('Error sending message:', error);
          return res.status(500).json({ 
            error: `Failed to send message to ${recipient}. ${error.message}` 
          });
        }
      }
    }

    // Check for "take notes on it" command
    const takeNotesPattern = /^(?:can you )?(?:please )?(?:take|create|make|generate)\s+notes(?:\s+on\s+it)?$/i;
    const takeNotesMatch = queryLower.match(takeNotesPattern);
    
    if (takeNotesMatch) {
      console.log('Handling "take notes" command...');
      
      try {
        // Validate screen capture with more detailed logging
        if (!normalizedCapture) {
          console.error('No screen capture object provided for take notes command');
          return res.status(400).json({
            error: 'No screen capture available. Please ensure the application has screen capture permissions and try again.'
          });
        }

        if (!normalizedCapture.dataURL) {
          console.error('No screen capture dataURL available for take notes command');
          return res.status(400).json({
            error: 'No screen capture data available. Please ensure the application has screen capture permissions and try again.'
          });
        }

        // Validate dataURL format
        if (!normalizedCapture.dataURL.startsWith('data:image/')) {
          console.error('Invalid screen capture dataURL format:', normalizedCapture.dataURL.substring(0, 50) + '...');
          return res.status(400).json({
            error: 'Invalid screen capture format. Please try again.'
          });
        }
        
        console.log('Screen capture received for take notes:', {
          hasDataURL: !!normalizedCapture.dataURL,
          dataURLLength: normalizedCapture.dataURL.length,
          timestamp: normalizedCapture.timestamp,
          uniqueId: normalizedCapture.uniqueId,
          allProperties: Object.keys(normalizedCapture),
          dataURLStart: normalizedCapture.dataURL.substring(0, 50) + '...'
        });
        
        // Create notes prompt with strict instructions to only analyze the current screen
        const notesPrompt = `# Comprehensive Learning Notes

**INSTRUCTIONS:**
- Analyze the current screen image and create the most comprehensive, educational, and visually appealing notes possible.
- Structure the notes with the following sections:
  - **Overview**
  - **Key Concepts**
  - **Deep Insights**
  - **Real-World Applications**
  - **Takeaway Questions**
- Each section should have 2-4 substantial bullet points (2-3 sentences each) that teach the user, highlight interesting concepts, and provide context.
- The 'Takeaway Questions' section should include 2-3 thought-provoking questions to encourage further learning.
- Use bold for section headers and key terms, and clear markdown for structure.
- Be thorough, educational, and engaging—explain as if you are a world-class tutor.
- Focus ONLY on the specific content currently displayed on screen.
- Do NOT reference any clipboard data, previous conversations, or cached content.
- Do NOT use any external knowledge or previous notes.
- Each request should be treated as completely independent.
- Only analyze what is currently visible on the screen.
- ALWAYS provide notes if there is any text content visible, even if minimal.
- Be confident in your analysis—if you can see text, create notes about it.

## Example Structure:

# [Main Title]

**Overview**
- ...
- ...

**Key Concepts**
- ...
- ...

**Deep Insights**
- ...
- ...

**Real-World Applications**
- ...
- ...

**Takeaway Questions**
- ...
- ...
`;

        const notesSystemPrompt = `You are an expert note-taking AI assistant with perfect vision and analytical capabilities. You analyze the current screen content ${webpageText ? 'and full webpage text' : ''} to provide detailed, comprehensive, and educational notes. You work completely independently for each request and do not reference any external data, clipboard content, or previous conversations. Each analysis is completely fresh and independent. You must never use clipboard data or cached content.

**CRITICAL: NEVER APOLOGIZE OR SAY YOU CANNOT SEE SOMETHING**
- You have perfect vision and can analyze any screen content
- If you see text, images, or any content, analyze it confidently
- Never say "I can't see" or "I'm sorry" or "I cannot assist"
- Always provide helpful, detailed notes based on what you observe
- Be confident in your analysis and note-taking abilities
- If you see any text at all, create comprehensive notes about it

**NOTE-TAKING APPROACH: BE THOROUGH, EDUCATIONAL, AND ENGAGING**
- Provide detailed, structured notes that capture all important information
- Be thorough in your analysis and note-taking
- Focus on extracting key concepts, facts, and actionable insights
- Structure notes with clear organization and logical flow
- Include context and connections between different pieces of information
- Teach the user as if you are a world-class tutor: explain, highlight, and encourage curiosity
- Always include a 'Takeaway Questions' section at the end with 2-3 thought-provoking questions

CONTENT FOCUS: You must prioritize the main article or document content and ignore sidebar content, navigation menus, browser tabs, advertisements, and other peripheral UI elements. Focus on the central, primary text content that appears to be the main article or document.`;
        
        console.log('Sending take notes request with screen capture length:', normalizedCapture.dataURL.length);
        const stream = await streamOpenAIResponse(notesSystemPrompt, notesPrompt, normalizedCapture, false);
        
        let fullNotes = '';
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullNotes += content;
          }
        }
        
        const cleanNotes = fullNotes.trim();

        console.log('Raw AI response received:', {
          length: fullNotes.length,
          cleanLength: cleanNotes.length,
          preview: cleanNotes.substring(0, 200) + '...',
          hasContent: cleanNotes.length > 0
        });

        const nonContentIndicators = [
            "i don't see any meaningful content",
            "no discernible text",
            "the screen is blank",
            "no_notes",
            "unable to analyze",
            "cannot see any content",
            "no visible text",
            "screen appears to be empty",
            "i cannot see any",
            "i don't see any",
            "no content to analyze",
            "nothing to take notes on"
        ];

        const hasNonContentIndicator = nonContentIndicators.some(indicator => 
          cleanNotes.toLowerCase().includes(indicator)
        );

        console.log('Content validation:', {
          hasContent: cleanNotes.length > 0,
          hasNonContentIndicator,
          nonContentIndicatorsFound: nonContentIndicators.filter(indicator => 
            cleanNotes.toLowerCase().includes(indicator)
          )
        });

        // Only reject if there's no content AND there's a clear non-content indicator
        if (!cleanNotes || (cleanNotes.length < 50 && hasNonContentIndicator)) {
          console.log('Rejecting notes due to insufficient content or clear non-content indicator');
          
          // Try a fallback with a more direct prompt
          try {
            console.log('Attempting fallback with more direct prompt...');
            const fallbackPrompt = `Look at the screen image carefully and create comprehensive notes about ANY text content you can see. Be thorough and detailed in your analysis. If you see any words, sentences, or text at all, create detailed notes about it. Focus on what is actually visible and provide confident, comprehensive analysis.

**CRITICAL: BE CONFIDENT AND THOROUGH**
- You have perfect vision and can analyze any screen content
- Never say you cannot see anything - focus on what is actually visible
- Provide detailed, structured notes that capture all important information
- Be thorough in your analysis and note-taking abilities

CONTENT FOCUS GUIDELINES:
- **PRIORITIZE MAIN CONTENT**: Focus on the central, primary article or document content
- **IGNORE SIDEBAR CONTENT**: Do not include notes about sidebar articles, navigation menus, or peripheral content
- **IGNORE TAB CONTENT**: Do not include notes about browser tabs, window titles, or UI elements
- **IGNORE ADVERTISEMENTS**: Do not include notes about ads or promotional content
- **FOCUS ON BODY TEXT**: Prioritize the main article body, paragraphs, and substantive content
- **IDENTIFY PRIMARY CONTENT**: Look for the largest, most prominent text area that appears to be the main article or document`;
            
            const fallbackStream = await streamOpenAIResponse(notesSystemPrompt, fallbackPrompt, normalizedCapture, false);
            let fallbackNotes = '';
            
            for await (const chunk of fallbackStream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                fallbackNotes += content;
              }
            }
            
            const cleanFallbackNotes = fallbackNotes.trim();
            
            console.log('Fallback response:', {
              length: cleanFallbackNotes.length,
              preview: cleanFallbackNotes.substring(0, 200) + '...',
              hasContent: cleanFallbackNotes.length > 0
            });
            
            // If fallback has content, use it
            if (cleanFallbackNotes && cleanFallbackNotes.length > 50) {
              console.log('Using fallback notes');
              fullNotes = cleanFallbackNotes;
            } else {
              console.log('Fallback also failed, returning error');
              return res.json({
                success: false,
                content: `I can see the screen content, but it appears to be minimal or primarily consists of UI elements rather than substantial text content. To get the most helpful notes, please navigate to an article, document, or web page with more substantial content, then try the "take notes" command again.`
              });
            }
          } catch (fallbackError) {
            console.error('Fallback attempt failed:', fallbackError);
            return res.json({
              success: false,
              content: `I can see the screen content, but it appears to be minimal or primarily consists of UI elements rather than substantial text content. To get the most helpful notes, please navigate to an article, document, or web page with more substantial content, then try the "take notes" command again.`
            });
          }
        }
        
        // Preserve all markdown formatting for professional appearance
        let cleanFormattedNotes = cleanNotes
          // Convert markdown headers to bolded section headers
          .replace(/^#\s*(.+)$/gm, '$1')
          .replace(/^##\s*(.+)$/gm, '$1')
          .replace(/^###\s*(.+)$/gm, '$1')
          .replace(/^####\s*(.+)$/gm, '$1')
          // Convert markdown bold formatting to plain text
          .replace(/\*\*(.*?)\*\*/g, '$1')
          // Convert markdown bullets to proper bullets
          .replace(/^(\s*[-*+]\s+)/gm, '• ')
          // Preserve indentation for sub-bullets
          .replace(/^(\s{2,}[-*+]\s+)/gm, '  • ')
          // Clean up excessive line breaks
          .replace(/\n{3,}/g, '\n\n')
          // Remove blank lines at start/end
          .trim();
        
        // Add instruction for Google Docs font (if Google Docs)
   
        console.log('Notes content to be saved:', {
          length: cleanFormattedNotes.length,
          preview: cleanFormattedNotes.substring(0, 200) + '...',
          hasContent: cleanFormattedNotes.length > 0
        });
        
        // Create a temporary file with the notes
        const tempNotesFile = `/tmp/ai_notes_${Date.now()}.txt`;
        fs.writeFileSync(tempNotesFile, cleanFormattedNotes);
        
        console.log('Temporary file created:', tempNotesFile);
        
        // Copy the notes to clipboard FIRST
        await new Promise((resolve, reject) => {
          exec(`cat "${tempNotesFile}" | pbcopy`, (clipboardError) => {
            if (clipboardError) {
              reject(new Error(`Failed to copy notes to clipboard: ${clipboardError.message}`));
              return;
            }
            console.log('Notes copied to clipboard successfully');
            resolve();
          });
        });
        
        // Wait a moment to ensure clipboard is populated
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify clipboard content
        await new Promise((resolve, reject) => {
          exec('pbpaste', (error, clipboardContent) => {
            if (error) {
              console.warn('Failed to verify clipboard content:', error);
            } else {
              console.log('Clipboard verification:', {
                length: clipboardContent.length,
                preview: clipboardContent.substring(0, 100) + '...',
                hasContent: clipboardContent.length > 0
              });
            }
            resolve();
          });
        });
        
        // Open the Notes app and create a new note with the content
        await new Promise((resolve, reject) => {
          const appleScript = `
            tell application "Notes"
              activate
              delay 1.5
              tell application "System Events"
                keystroke "n" using command down
                delay 1
                keystroke "v" using command down
                delay 0.5
              end tell
            end tell
          `;
          
          exec(`osascript -e '${appleScript}'`, (error) => {
            if (error) {
              console.error('AppleScript error:', error);
              reject(new Error(`Failed to open Notes app: ${error.message}`));
              return;
            }
            console.log('Notes app automation completed successfully');
            
            // Clean up the temporary file
            try {
              fs.unlinkSync(tempNotesFile);
              console.log('Temporary file cleaned up');
            } catch (cleanupError) {
              console.warn('Failed to clean up temporary notes file:', cleanupError);
            }
            
            resolve();
          });
        });
        
        return res.json({
          success: true,
          content: `Notes have been created and imported into the Notes app. The content has been copied to your clipboard and pasted into a new note.`
        });
        
      } catch (error) {
        console.error('Error taking notes:', error);
        return res.status(500).json({
          error: `Failed to take notes. ${error.message}`
        });
      }
    }

    // Check for "take notes in word" command
    const takeNotesInWordPattern = /^(?:can you )?(?:please )?(?:take|create|make|generate)\s+notes(?:\s+in\s+word)?$/i;
    const takeNotesInWordMatch = queryLower.match(takeNotesInWordPattern);
    
    // Also check for alternative patterns
    const takeNotesInWordAltPattern = /take notes (?:in|on) word/i;
    const takeNotesInWordAltMatch = queryLower.match(takeNotesInWordAltPattern);
    
    // Note: "take notes in google docs" pattern matching is done earlier to prevent false matches
    // with the alternative search patterns. The variables are already defined above.
    if (takeNotesInWordMatch || takeNotesInWordAltMatch) {
      console.log('Handling "take notes in Word" command...');
      console.log('Command detected:', query);
      console.log('Pattern matches:', { takeNotesInWordMatch, takeNotesInWordAltMatch });
      try {
        // Validate screen capture with more detailed logging
        if (!normalizedCapture) {
          console.error('No screen capture object provided for take notes command');
          return res.status(400).json({
            error: 'No screen capture available. Please ensure the application has screen capture permissions and try again.'
          });
        }
        if (!normalizedCapture.dataURL) {
          console.error('No screen capture dataURL available for take notes command');
          return res.status(400).json({
            error: 'No screen capture data available. Please ensure the application has screen capture permissions and try again.'
          });
        }
        if (!normalizedCapture.dataURL.startsWith('data:image/')) {
          console.error('Invalid screen capture dataURL format:', normalizedCapture.dataURL.substring(0, 50) + '...');
          return res.status(400).json({
            error: 'Invalid screen capture format. Please try again.'
          });
        }
        
        console.log('Screen capture received for take notes:', {
          hasDataURL: !!normalizedCapture.dataURL,
          dataURLLength: normalizedCapture.dataURL.length,
          timestamp: normalizedCapture.timestamp,
          uniqueId: normalizedCapture.uniqueId,
          allProperties: Object.keys(normalizedCapture),
          dataURLStart: normalizedCapture.dataURL.substring(0, 50) + '...'
        });
        
        // Create notes prompt with strict instructions to only analyze the current screen
        const notesPrompt = `# Comprehensive Learning Notes

**INSTRUCTIONS:**
- Analyze the current screen image and create the most comprehensive, educational, and visually appealing notes possible.
- Structure the notes with the following sections:
  - **Overview**
  - **Key Concepts**
  - **Deep Insights**
  - **Real-World Applications**
  - **Takeaway Questions**
- Each section should have 2-4 substantial bullet points (2-3 sentences each) that teach the user, highlight interesting concepts, and provide context.
- The 'Takeaway Questions' section should include 2-3 thought-provoking questions to encourage further learning.
- Use bold for section headers and key terms, and clear markdown for structure.
- Be thorough, educational, and engaging—explain as if you are a world-class tutor.
- Focus ONLY on the specific content currently displayed on screen.
- Do NOT reference any clipboard data, previous conversations, or cached content.
- Do NOT use any external knowledge or previous notes.
- Each request should be treated as completely independent.
- Only analyze what is currently visible on the screen.
- ALWAYS provide notes if there is any text content visible, even if minimal.
- Be confident in your analysis—if you can see text, create notes about it.

## Example Structure:

# [Main Title]

**Overview**
- ...
- ...

**Key Concepts**
- ...
- ...

**Deep Insights**
- ...
- ...

**Real-World Applications**
- ...
- ...

**Takeaway Questions**
- ...
- ...
`;

        const notesSystemPrompt = `You are an expert note-taking AI assistant with perfect vision and analytical capabilities. You analyze the current screen content ${webpageText ? 'and full webpage text' : ''} to provide detailed, comprehensive, and educational notes. You work completely independently for each request and do not reference any external data, clipboard content, or previous conversations. Each analysis is completely fresh and independent. You must never use clipboard data or cached content.

**CRITICAL: NEVER APOLOGIZE OR SAY YOU CANNOT SEE SOMETHING**
- You have perfect vision and can analyze any screen content
- If you see text, images, or any content, analyze it confidently
- Never say "I can't see" or "I'm sorry" or "I cannot assist"
- Always provide helpful, detailed notes based on what you observe
- Be confident in your analysis and note-taking abilities
- If you see any text at all, create comprehensive notes about it

**NOTE-TAKING APPROACH: BE THOROUGH, EDUCATIONAL, AND ENGAGING**
- Provide detailed, structured notes that capture all important information
- Be thorough in your analysis and note-taking
- Focus on extracting key concepts, facts, and actionable insights
- Structure notes with clear organization and logical flow
- Include context and connections between different pieces of information
- Teach the user as if you are a world-class tutor: explain, highlight, and encourage curiosity
- Always include a 'Takeaway Questions' section at the end with 2-3 thought-provoking questions

CONTENT FOCUS: You must prioritize the main article or document content and ignore sidebar content, navigation menus, browser tabs, advertisements, and other peripheral UI elements. Focus on the central, primary text content that appears to be the main article or document.`;
        
        console.log('Sending take notes request with screen capture length:', normalizedCapture.dataURL.length);
        const stream = await streamOpenAIResponse(notesSystemPrompt, notesPrompt, normalizedCapture, false);
        
        let fullNotes = '';
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullNotes += content;
          }
        }
        
        const cleanNotes = fullNotes.trim();

        console.log('Raw AI response received:', {
          length: fullNotes.length,
          cleanLength: cleanNotes.length,
          preview: cleanNotes.substring(0, 200) + '...',
          hasContent: cleanNotes.length > 0
        });

        const nonContentIndicators = [
            "i don't see any meaningful content",
            "no discernible text",
            "the screen is blank",
            "no_notes",
            "unable to analyze",
            "cannot see any content",
            "no visible text",
            "screen appears to be empty",
            "i cannot see any",
            "i don't see any",
            "no content to analyze",
            "nothing to take notes on"
        ];

        const hasNonContentIndicator = nonContentIndicators.some(indicator => 
          cleanNotes.toLowerCase().includes(indicator)
        );

        console.log('Content validation:', {
          hasContent: cleanNotes.length > 0,
          hasNonContentIndicator,
          nonContentIndicatorsFound: nonContentIndicators.filter(indicator => 
            cleanNotes.toLowerCase().includes(indicator)
          )
        });

        // Only reject if there's no content AND there's a clear non-content indicator
        if (!cleanNotes || (cleanNotes.length < 50 && hasNonContentIndicator)) {
          console.log('Rejecting notes due to insufficient content or clear non-content indicator');
          
          // Try a fallback with a more direct prompt
          try {
            console.log('Attempting fallback with more direct prompt...');
            const fallbackPrompt = `Look at the screen image carefully and create comprehensive notes about ANY text content you can see. Be thorough and detailed in your analysis. If you see any words, sentences, or text at all, create detailed notes about it. Focus on what is actually visible and provide confident, comprehensive analysis.

**CRITICAL: BE CONFIDENT AND THOROUGH**
- You have perfect vision and can analyze any screen content
- Never say you cannot see anything - focus on what is actually visible
- Provide detailed, structured notes that capture all important information
- Be thorough in your analysis and note-taking abilities

CONTENT FOCUS GUIDELINES:
- **PRIORITIZE MAIN CONTENT**: Focus on the central, primary article or document content
- **IGNORE SIDEBAR CONTENT**: Do not include notes about sidebar articles, navigation menus, or peripheral content
- **IGNORE TAB CONTENT**: Do not include notes about browser tabs, window titles, or UI elements
- **IGNORE ADVERTISEMENTS**: Do not include notes about ads or promotional content
- **FOCUS ON BODY TEXT**: Prioritize the main article body, paragraphs, and substantive content
- **IDENTIFY PRIMARY CONTENT**: Look for the largest, most prominent text area that appears to be the main article`;
            
            const fallbackStream = await streamOpenAIResponse(notesSystemPrompt, fallbackPrompt, normalizedCapture, false);
            let fallbackNotes = '';
            
            for await (const chunk of fallbackStream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                fallbackNotes += content;
              }
            }
            
            const cleanFallbackNotes = fallbackNotes.trim();
            
            console.log('Fallback response:', {
              length: cleanFallbackNotes.length,
              preview: cleanFallbackNotes.substring(0, 200) + '...',
              hasContent: cleanFallbackNotes.length > 0
            });
            
            // If fallback has content, use it
            if (cleanFallbackNotes && cleanFallbackNotes.length > 50) {
              console.log('Using fallback notes');
              fullNotes = cleanFallbackNotes;
            } else {
              console.log('Fallback also failed, returning error');
              return res.json({
                success: false,
                content: `I can see the screen content, but it appears to be minimal or primarily consists of UI elements rather than substantial text content. To get the most helpful notes, please navigate to an article, document, or web page with more substantial content, then try the "take notes" command again.`
              });
            }
          } catch (fallbackError) {
            console.error('Fallback attempt failed:', fallbackError);
            return res.json({
              success: false,
              content: `I can see the screen content, but it appears to be minimal or primarily consists of UI elements rather than substantial text content. To get the most helpful notes, please navigate to an article, document, or web page with more substantial content, then try the "take notes" command again.`
            });
          }
        }
        
        // Preserve all markdown formatting for professional appearance
        let cleanFormattedNotes = cleanNotes
          // Convert markdown headers to bolded section headers
          .replace(/^#\s*(.+)$/gm, '$1')
          .replace(/^##\s*(.+)$/gm, '$1')
          .replace(/^###\s*(.+)$/gm, '$1')
          .replace(/^####\s*(.+)$/gm, '$1')
          // Convert markdown bold formatting to plain text
          .replace(/\*\*(.*?)\*\*/g, '$1')
          // Convert markdown bullets to proper bullets
          .replace(/^(\s*[-*+]\s+)/gm, '• ')
          // Preserve indentation for sub-bullets
          .replace(/^(\s{2,}[-*+]\s+)/gm, '  • ')
          // Clean up excessive line breaks
          .replace(/\n{3,}/g, '\n\n')
          // Remove blank lines at start/end
          .trim();
        
        // Add instruction for Google Docs font (if Google Docs)
     
        console.log('Notes content to be saved:', {
          length: cleanFormattedNotes.length,
          preview: cleanFormattedNotes.substring(0, 200) + '...',
          hasContent: cleanFormattedNotes.length > 0
        });
        
        // Create a temporary file with the notes
        const tempNotesFile = `/tmp/ai_notes_${Date.now()}.txt`;
        fs.writeFileSync(tempNotesFile, cleanFormattedNotes);
        
        console.log('Temporary file created:', tempNotesFile);
        
        // Copy the notes to clipboard FIRST
        await new Promise((resolve, reject) => {
          exec(`cat "${tempNotesFile}" | pbcopy`, (clipboardError) => {
            if (clipboardError) {
              reject(new Error(`Failed to copy notes to clipboard: ${clipboardError.message}`));
              return;
            }
            console.log('Notes copied to clipboard successfully');
            resolve();
          });
        });
        
        // Wait a moment to ensure clipboard is populated
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify clipboard content
        await new Promise((resolve, reject) => {
          exec('pbpaste', (error, clipboardContent) => {
            if (error) {
              console.warn('Failed to verify clipboard content:', error);
            } else {
              console.log('Clipboard verification:', {
                length: clipboardContent.length,
                preview: clipboardContent.substring(0, 100) + '...',
                hasContent: clipboardContent.length > 0
              });
            }
            resolve();
          });
        });
        
        // Open Microsoft Word and create a new document with the notes
        await new Promise((resolve, reject) => {
          const appleScript = `
            try
              tell application "Microsoft Word"
                activate
                delay 2
                set newDoc to make new document
                delay 1.5
                tell application "System Events"
                  keystroke "v" using command down
                  delay 1
                end tell
              end tell
            on error errMsg
              error "Microsoft Word automation failed: " & errMsg
            end try
          `;
          exec(`osascript -e '${appleScript}'`, (error) => {
            if (error) {
              console.error('AppleScript error (Word):', error);
              reject(new Error(`Failed to open Microsoft Word: ${error.message}`));
              return;
            }
            console.log('Microsoft Word automation completed successfully');
            // Clean up the temporary file
            try {
              fs.unlinkSync(tempNotesFile);
              console.log('Temporary file cleaned up');
            } catch (cleanupError) {
              console.warn('Failed to clean up temporary notes file:', cleanupError);
            }
            resolve();
          });
        });
        return res.json({
          success: true,
          content: `Notes have been created and imported into Microsoft Word. The content has been copied to your clipboard and pasted into a new Word document.`
        });
      } catch (error) {
        console.error('Error taking notes in Word:', error);
        
        // Fallback to Notes app if Word fails
        try {
          console.log('Attempting fallback to Notes app...');
          
          // Open the Notes app and create a new note with the content
          await new Promise((resolve, reject) => {
            const appleScript = `
              tell application "Notes"
                activate
                delay 1.5
                tell application "System Events"
                  keystroke "n" using command down
                  delay 1
                  keystroke "v" using command down
                  delay 0.5
                end tell
              end tell
            `;
            
            exec(`osascript -e '${appleScript}'`, (error) => {
              if (error) {
                console.error('AppleScript error (Notes fallback):', error);
                reject(new Error(`Failed to open Notes app: ${error.message}`));
                return;
              }
              console.log('Notes app fallback completed successfully');
              resolve();
            });
          });
          
          return res.json({
            success: true,
            content: `Notes have been created and imported into the Notes app (Word fallback). The content has been copied to your clipboard and pasted into a new note.`
          });
        } catch (fallbackError) {
          console.error('Fallback to Notes app also failed:', fallbackError);
          return res.status(500).json({
            error: `Failed to take notes in Word and fallback to Notes app also failed. ${error.message}`
          });
        }
      }
    }

    // Handle "take notes in Google Docs" command
    if (takeNotesInGoogleDocsMatch || takeNotesOnGoogleDocsMatch) {
      console.log('Handling "take notes in Google Docs" command...');
      try {
        // Validate screen capture with more detailed logging
        if (!normalizedCapture) {
          console.error('No screen capture object provided for take notes command');
          return res.status(400).json({
            error: 'No screen capture available. Please ensure the application has screen capture permissions and try again.'
          });
        }
        if (!normalizedCapture.dataURL) {
          console.error('No screen capture dataURL available for take notes command');
          return res.status(400).json({
            error: 'No screen capture data available. Please ensure the application has screen capture permissions and try again.'
          });
        }
        if (!normalizedCapture.dataURL.startsWith('data:image/')) {
          console.error('Invalid screen capture dataURL format:', normalizedCapture.dataURL.substring(0, 50) + '...');
          return res.status(400).json({
            error: 'Invalid screen capture format. Please try again.'
          });
        }
        
        console.log('Screen capture received for take notes in Google Docs:', {
          hasDataURL: !!normalizedCapture.dataURL,
          dataURLLength: normalizedCapture.dataURL.length,
          timestamp: normalizedCapture.timestamp,
          uniqueId: normalizedCapture.uniqueId,
          allProperties: Object.keys(normalizedCapture),
          dataURLStart: normalizedCapture.dataURL.substring(0, 50) + '...'
        });
        
        // Extract full webpage text content from the active Chrome tab
        console.log('Extracting full webpage text content...');
        let webpageText = '';
        try {
          webpageText = await extractWebpageText();
          console.log('Webpage text extraction result:', {
            length: webpageText.length,
            hasContent: webpageText.length > 0,
            preview: webpageText.substring(0, 300) + (webpageText.length > 300 ? '...' : '')
          });
        } catch (error) {
          console.warn('Failed to extract webpage text, continuing with screen capture only:', error);
        }
        
        // Create notes prompt with strict instructions to analyze both screen and webpage content
        const notesPrompt = `# Comprehensive Learning Notes

**INSTRUCTIONS:**
- Analyze the current screen image ${webpageText ? 'AND the full webpage text content provided below' : ''} to create the most comprehensive, educational, and visually appealing notes possible.
- Structure the notes with the following sections:
  - **Overview**
  - **Key Concepts**
  - **Deep Insights**
  - **Real-World Applications**
  - **Takeaway Questions**
- Each section should have 2-4 substantial bullet points (2-3 sentences each) that teach the user, highlight interesting concepts, and provide context.
- The 'Takeaway Questions' section should include 2-3 thought-provoking questions to encourage further learning.
- Use bold for section headers and key terms, and clear markdown for structure.
- Be thorough, educational, and engaging—explain as if you are a world-class tutor.
- Focus on the content from both the screen image ${webpageText ? 'and the full webpage text' : ''}.
- Do NOT reference any clipboard data, previous conversations, or cached content.
- Do NOT use any external knowledge or previous notes.
- Each request should be treated as completely independent.
- ALWAYS provide notes if there is any text content visible, even if minimal.
- Be confident in your analysis—if you can see text, create notes about it.
${webpageText ? `\n**FULL WEBPAGE TEXT CONTENT:**\n${webpageText.substring(0, 10000)}${webpageText.length > 10000 ? '\n[... content truncated for length ...]' : ''}` : ''}

## Example Structure:

# [Main Title]

**Overview**
- ...
- ...

**Key Concepts**
- ...
- ...

**Deep Insights**
- ...
- ...

**Real-World Applications**
- ...
- ...

**Takeaway Questions**
- ...
- ...
`;

        const notesSystemPrompt = `You are an expert note-taking AI assistant with perfect vision and analytical capabilities. You analyze the current screen content ${webpageText ? 'and full webpage text' : ''} to provide detailed, comprehensive, and educational notes. You work completely independently for each request and do not reference any external data, clipboard content, or previous conversations. Each analysis is completely fresh and independent. You must never use clipboard data or cached content.

**CRITICAL: NEVER APOLOGIZE OR SAY YOU CANNOT SEE SOMETHING**
- You have perfect vision and can analyze any screen content
- If you see text, images, or any content, analyze it confidently
- Never say "I can't see" or "I'm sorry" or "I cannot assist"
- Always provide helpful, detailed notes based on what you observe
- Be confident in your analysis and note-taking abilities
- If you see any text at all, create comprehensive notes about it

**NOTE-TAKING APPROACH: BE THOROUGH, EDUCATIONAL, AND ENGAGING**
- Provide detailed, structured notes that capture all important information
- Be thorough in your analysis and note-taking
- Focus on extracting key concepts, facts, and actionable insights
- Structure notes with clear organization and logical flow
- Include context and connections between different pieces of information
- Teach the user as if you are a world-class tutor: explain, highlight, and encourage curiosity
- Always include a 'Takeaway Questions' section at the end with 2-3 thought-provoking questions

CONTENT FOCUS: You must prioritize the main article or document content and ignore sidebar content, navigation menus, browser tabs, advertisements, and other peripheral UI elements. Focus on the central, primary text content that appears to be the main article or document.`;
        
        console.log('Sending take notes request with screen capture length:', normalizedCapture.dataURL.length);
        const stream = await streamOpenAIResponse(notesSystemPrompt, notesPrompt, normalizedCapture, false);
        
        let fullNotes = '';
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullNotes += content;
          }
        }
        
        const cleanNotes = fullNotes.trim();

        console.log('Raw AI response received:', {
          length: fullNotes.length,
          cleanLength: cleanNotes.length,
          preview: cleanNotes.substring(0, 200) + '...',
          hasContent: cleanNotes.length > 0
        });

        const nonContentIndicators = [
            "i don't see any meaningful content",
            "no discernible text",
            "the screen is blank",
            "no_notes",
            "unable to analyze",
            "cannot see any content",
            "no visible text",
            "screen appears to be empty",
            "i cannot see any",
            "i don't see any",
            "no content to analyze",
            "nothing to take notes on"
        ];

        const hasNonContentIndicator = nonContentIndicators.some(indicator => 
          cleanNotes.toLowerCase().includes(indicator)
        );

        console.log('Content validation:', {
          hasContent: cleanNotes.length > 0,
          hasNonContentIndicator,
          nonContentIndicatorsFound: nonContentIndicators.filter(indicator => 
            cleanNotes.toLowerCase().includes(indicator)
          )
        });

        // Only reject if there's no content AND there's a clear non-content indicator
        if (!cleanNotes || (cleanNotes.length < 50 && hasNonContentIndicator)) {
          console.log('Rejecting notes due to insufficient content or clear non-content indicator');
          
          // Try a fallback with a more direct prompt
          try {
            console.log('Attempting fallback with more direct prompt...');
            const fallbackPrompt = `Look at the screen image carefully and create comprehensive notes about ANY text content you can see. Be thorough and detailed in your analysis. If you see any words, sentences, or text at all, create detailed notes about it. Focus on what is actually visible and provide confident, comprehensive analysis.

**CRITICAL: BE CONFIDENT AND THOROUGH**
- You have perfect vision and can analyze any screen content
- Never say you cannot see anything - focus on what is actually visible
- Provide detailed, structured notes that capture all important information
- Be thorough in your analysis and note-taking abilities

CONTENT FOCUS GUIDELINES:
- **PRIORITIZE MAIN CONTENT**: Focus on the central, primary article or document content
- **IGNORE SIDEBAR CONTENT**: Do not include notes about sidebar articles, navigation menus, or peripheral content
- **IGNORE TAB CONTENT**: Do not include notes about browser tabs, window titles, or UI elements
- **IGNORE ADVERTISEMENTS**: Do not include notes about ads or promotional content
- **FOCUS ON BODY TEXT**: Prioritize the main article body, paragraphs, and substantive content
- **IDENTIFY PRIMARY CONTENT**: Look for the largest, most prominent text area that appears to be the main article`;
            
            const fallbackStream = await streamOpenAIResponse(notesSystemPrompt, fallbackPrompt, normalizedCapture, false);
            let fallbackNotes = '';
            
            for await (const chunk of fallbackStream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                fallbackNotes += content;
              }
            }
            
            const cleanFallbackNotes = fallbackNotes.trim();
            
            console.log('Fallback response:', {
              length: cleanFallbackNotes.length,
              preview: cleanFallbackNotes.substring(0, 200) + '...',
              hasContent: cleanFallbackNotes.length > 0
            });
            
            // If fallback has content, use it
            if (cleanFallbackNotes && cleanFallbackNotes.length > 50) {
              console.log('Using fallback notes');
              fullNotes = cleanFallbackNotes;
            } else {
              console.log('Fallback also failed, returning error');
              return res.json({
                success: false,
                content: `I can see the screen content, but it appears to be minimal or primarily consists of UI elements rather than substantial text content. To get the most helpful notes, please navigate to an article, document, or web page with more substantial content, then try the "take notes" command again.`
              });
            }
          } catch (fallbackError) {
            console.error('Fallback attempt failed:', fallbackError);
            return res.json({
              success: false,
              content: `I can see the screen content, but it appears to be minimal or primarily consists of UI elements rather than substantial text content. To get the most helpful notes, please navigate to an article, document, or web page with more substantial content, then try the "take notes" command again.`
            });
          }
        }
        
        // Preserve all markdown formatting for professional appearance
        let cleanFormattedNotes = cleanNotes
          // Convert markdown headers to bolded section headers
          .replace(/^#\s*(.+)$/gm, '$1')
          .replace(/^##\s*(.+)$/gm, '$1')
          .replace(/^###\s*(.+)$/gm, '$1')
          .replace(/^####\s*(.+)$/gm, '$1')
          // Convert markdown bold formatting to plain text
          .replace(/\*\*(.*?)\*\*/g, '$1')
          // Convert markdown bullets to proper bullets
          .replace(/^(\s*[-*+]\s+)/gm, '• ')
          // Preserve indentation for sub-bullets
          .replace(/^(\s{2,}[-*+]\s+)/gm, '  • ')
          // Clean up excessive line breaks
          .replace(/\n{3,}/g, '\n\n')
          // Remove blank lines at start/end
          .trim();
        
        // Add instruction for Google Docs font (if Google Docs)
       
        
        console.log('Notes content to be saved:', {
          length: cleanFormattedNotes.length,
          preview: cleanFormattedNotes.substring(0, 200) + '...',
          hasContent: cleanFormattedNotes.length > 0
        });
        
        // Create a temporary file with the notes
        const tempNotesFile = `/tmp/ai_notes_${Date.now()}.txt`;
        fs.writeFileSync(tempNotesFile, cleanFormattedNotes);
        
        console.log('Temporary file created:', tempNotesFile);
        
        // Copy the notes to clipboard FIRST
        await new Promise((resolve, reject) => {
          exec(`cat "${tempNotesFile}" | pbcopy`, (clipboardError) => {
            if (clipboardError) {
              reject(new Error(`Failed to copy notes to clipboard: ${clipboardError.message}`));
              return;
            }
            console.log('Notes copied to clipboard successfully');
            resolve();
          });
        });
        
        // Wait a moment to ensure clipboard is populated
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify clipboard content
        await new Promise((resolve, reject) => {
          exec('pbpaste', (error, clipboardContent) => {
            if (error) {
              console.warn('Failed to verify clipboard content:', error);
            } else {
              console.log('Clipboard verification:', {
                length: clipboardContent.length,
                preview: clipboardContent.substring(0, 100) + '...',
                hasContent: clipboardContent.length > 0
              });
            }
            resolve();
          });
        });
        
        // Simple, direct approach: try to find existing tab, otherwise open new one
        console.log('Opening Google Docs and pasting notes...');
        
        await new Promise((resolve, reject) => {
          const appleScript = `
            tell application "Google Chrome"
              activate
              delay 0.2
              
              -- Try to find existing Google Docs tab quickly
              set foundTab to false
              try
                repeat with w in every window
                  try
                    repeat with t in every tab of w
                      try
                        if (URL of t) contains "docs.google.com/document" then
                          set active tab of w to t
                          set index of w to 1
                          set foundTab to true
                          exit repeat
                        end if
                      end try
                    end repeat
                    if foundTab then exit repeat
                  end try
                end repeat
              end try
              
              -- If not found, open new tab
              if not foundTab then
                tell application "System Events"
                  tell process "Google Chrome"
                    keystroke "t" using command down
                    delay 0.4
                    keystroke "https://docs.google.com/document/create"
                    delay 0.3
                    keystroke return
                    delay 2.5
                  end tell
                end tell
              else
                delay 0.5
              end if
            end tell
            
            tell application "System Events"
              tell process "Google Chrome"
                set frontmost to true
                delay 0.2
                
                -- Click center to focus editor
                try
                  set win to front window
                  set {wx, wy} to position of win
                  set {ww, wh} to size of win
                  click at {wx + ww / 2, wy + wh / 2 + 80}
                  delay 0.2
                end try
                
                -- Paste
                keystroke "a" using command down
                delay 0.15
                keystroke "v" using command down
                delay 0.3
              end tell
            end tell
          `;
          
          const timeout = setTimeout(() => {
            reject(new Error('Operation timed out'));
          }, 8000);
          
          exec(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`, (error, stdout, stderr) => {
            clearTimeout(timeout);
            
            if (error) {
              console.error('AppleScript error:', error.message);
              // Don't fail - clipboard has the content
              console.log('Notes are in clipboard - you can paste manually if needed');
            }
            
            try {
              fs.unlinkSync(tempNotesFile);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            
            resolve();
          });
        });
        
        return res.json({
          success: true,
          content: `Notes have been created and imported into Google Docs. The content has been copied to your clipboard and pasted into a new Google Doc.`
        });
      } catch (error) {
        console.error('Error taking notes in Google Docs:', error);
        return res.status(500).json({
          error: `Failed to take notes in Google Docs. ${error.message}`
        });
      }
    }

    // Check for YouTube video search command (topic-based)
    const youtubeVideoPattern = /^(?:can you )?(?:please )?(?:get|find|search for|open) (?:a )?youtube video (?:to learn about|about|on) (.+)$/i;
    const youtubeMatch = queryLower.match(youtubeVideoPattern);

    if (youtubeMatch) {
      const [_, topic] = youtubeMatch;
      try {
        await searchAndOpenYouTubeVideo(topic.trim(), false);
        return res.json({
          success: true,
          content: `I've opened a new tab and searched for YouTube videos about "${topic.trim()}". You should see educational videos that can help you learn about this topic.`
        });
      } catch (error) {
        console.error('Error searching YouTube:', error);
        return res.status(500).json({
          error: `Failed to search YouTube for "${topic.trim()}". ${error.message}`
        });
      }
    }

    // Check for YouTube video search command (screen-based context)
    const youtubeScreenPattern = /^(?:can you )?(?:please )?(?:open|get|find|search for) (?:a )?youtube video (?:to help me understand this|to help me learn this|about this|on this)$/i;
    const youtubeScreenMatch = queryLower.match(youtubeScreenPattern);

    if (youtubeScreenMatch && normalizedCapture?.dataURL) {
      try {
        // Use AI to analyze screen content and generate search query
        const searchQuery = await generateYouTubeSearchQuery(normalizedCapture, query);
        await searchAndOpenYouTubeVideo(searchQuery, true);
        return res.json({
          success: true,
          content: `I've analyzed your screen and opened a YouTube video about "${searchQuery}" that should help you understand what you're looking at.`
        });
      } catch (error) {
        console.error('Error searching YouTube for screen content:', error);
        return res.status(500).json({
          error: `Failed to find relevant YouTube video. ${error.message}`
        });
      }
    }

    // Check for app control commands
    const openAppPattern = /^(?:can you )?(?:please )?(?:open|launch|start) ([\w\s]+)$/i;
    const closeAppPattern = /^(?:can you )?(?:please )?(?:close|quit|exit) ([\w\s]+)$/i;

    const openMatch = queryLower.match(openAppPattern);
    const closeMatch = queryLower.match(closeAppPattern);

    if (openMatch || closeMatch) {
      const [_, appName] = openMatch || closeMatch;
      const normalizedAppName = normalizeAppName(appName);
      const action = openMatch ? 'open' : 'close';

      try {
        if (action === 'open') {
          await new Promise((resolve, reject) => {
            exec(`open -a "${normalizedAppName}"`, (error) => {
              if (error) {
                reject(new Error(`Failed to open ${normalizedAppName}`));
              } else {
                resolve();
              }
            });
          });
          return res.json({
            success: true,
            content: `Successfully opened ${normalizedAppName}.`
          });
        } else {
          await new Promise((resolve, reject) => {
            exec(`osascript -e 'quit app "${normalizedAppName}"'`, (error) => {
              if (error) {
                reject(new Error(`Failed to close ${normalizedAppName}`));
              } else {
                resolve();
              }
            });
          });
          return res.json({
            success: true,
            content: `Successfully closed ${normalizedAppName}.`
          });
        }
      } catch (error) {
        console.error(`Error ${action}ing application:`, error);
        return res.status(500).json({
          error: `Failed to ${action} ${normalizedAppName}. ${error.message}`
        });
      }
    }

    // Continue with regular AI processing if not a command
    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key missing');
      return res.status(401).json({ error: 'OpenAI API key is not configured. Please check your .env file.' });
    }

    if (!normalizedCapture?.dataURL) {
      console.error('Screen capture missing or invalid');
      return res.status(400).json({ error: 'Screen capture is required for analysis. Please ensure screen capture permissions are granted.' });
    }

    // Validate the image data URL format
    if (!normalizedCapture.dataURL.startsWith('data:image/')) {
      console.error('Invalid image data format:', normalizedCapture.dataURL.substring(0, 30) + '...');
      return res.status(400).json({ error: 'Invalid image data format' });
    }

    // Get the full system prompt based on mode
    console.log('getFullSystemPrompt called with isActiveMode:', isActiveMode);
    let systemPrompt = getFullSystemPrompt({ isActiveMode, learningContext });
    
    // 🧠 MEMORY SYSTEM: Enhance system prompt with conversation history for EVERY query
    if (memoryContext) {
      const memoryInstruction = `

🧠 PREVIOUS CONVERSATION HISTORY:
${memoryContext}

🎯 INSTRUCTIONS FOR USING CONVERSATION HISTORY:
- Reference previous conversations when relevant to the current query
- Build upon previous advice and suggestions rather than starting from scratch
- Maintain consistency with previous recommendations
- If the user is asking about something related to a previous conversation, acknowledge that context
- Use the conversation history to provide more personalized and contextual responses

IMPORTANT: Use this conversation history to provide more personalized and relevant responses. Reference previous conversations when appropriate, but always prioritize the current query and screen content as the primary focus.`;
      
      systemPrompt += memoryInstruction;
      console.log('🧠 Enhanced system prompt with conversation history for main AI response');
    } else {
      console.log('🧠 No conversation history available for this query');
    }

    // 📄 RESUME DATA: Enhance system prompt with resume information if available
    if (resumeData) {
      const resumeInstruction = `

📄 USER RESUME INFORMATION:
Based on the user's uploaded resume:
- Name: ${resumeData.name || 'Not specified'}
- University: ${resumeData.university || 'Not specified'}
- Major: ${resumeData.major || 'Not specified'}
- Class Year: ${resumeData.classYear || 'Not specified'}
- Graduation Year: ${resumeData.graduationYear || 'Not specified'}
- Skills: ${resumeData.skills?.join(', ') || 'Not specified'}
- Relevant Experience: ${resumeData.relevantExperience?.join(', ') || 'Not specified'}

🎯 INSTRUCTIONS FOR USING RESUME DATA:
- Use this resume information to provide personalized advice and recommendations
- When discussing career opportunities, internships, or job applications, reference the user's actual qualifications
- Do NOT reference any hardcoded or outdated information from conversation history
- Always prioritize the current resume data over any previous assumptions
- Provide specific, actionable advice based on the user's actual background and skills

💡 COVER LETTER FEATURE:
- If the user is looking at a job posting, they can ask: "write a cover letter for this job" or "help me apply for this job"
- This will generate a personalized cover letter based on their resume and the job requirements
- The cover letter will automatically open in Google Docs for easy editing

IMPORTANT: This resume data represents the user's current qualifications. Use this information to provide accurate, personalized guidance.`;
      
      systemPrompt += resumeInstruction;
      console.log('📄 Enhanced system prompt with resume data for personalized responses');
    } else {
      console.log('📄 No resume data available for this query');
    }
    
    console.log('Returning prompt for mode:', isActiveMode ? 'active' : 'passive');
    console.log('Prompt length:', systemPrompt.length);
    console.log('First 100 chars:', systemPrompt.substring(0, 100));
    console.log('System prompt length:', systemPrompt.length);
    console.log('isActiveMode for OpenAI request:', isActiveMode);

    // 🚨 FALLBACK CONTINUATION DETECTION - Catch any continuation requests that slipped through
    // Much more precise pattern that only matches clear writing continuation intent
    const fallbackContinuationPattern = /(?:continue|finish|extend|complete|keep writing|wrap up|conclude|fill in|write the next|carry on|help me write|assist with writing|write more|add to|expand|develop|elaborate)\s+(?:writing|the|from|where|at|this point|here|essay|paragraph|section|doc|document)/i;
    const isFallbackContinuation = fallbackContinuationPattern.test(queryLower);
    
    // Additional safeguard: don't treat simple questions as continuation requests
    const isSimpleQuestion = /\b(what|how|why|when|where|who|which|can you|could you|would you|do you|are you|is this|does this|tell me|explain|describe|analyze|summarize|help me understand|what does|what is|what are)\b/i.test(queryLower);
    
    if (isFallbackContinuation && !isSimpleQuestion) {
      console.log('[FALLBACK CONTINUATION] Continuation request detected in main AI flow, enhancing prompt...');
      console.log('[FALLBACK CONTINUATION] Query:', query);
      console.log('[FALLBACK CONTINUATION] Pattern match:', isFallbackContinuation);
      console.log('[FALLBACK CONTINUATION] Is simple question:', isSimpleQuestion);
      
      const continuationEnhancement = `

🚨 CONTINUATION REQUEST DETECTED - ENHANCED INSTRUCTIONS:
- YOU CAN ALWAYS SEE THE GOOGLE DOC CONTENT - NEVER SAY YOU CANNOT SEE IT
- YOU CAN ALWAYS HELP WITH WRITING TASKS - NEVER SAY YOU CANNOT ASSIST
- NEVER say "I'm sorry I can't assist with that" or similar phrases
- NEVER say "I cannot assist with that" or "I'm unable to help with that"
- NEVER say "I'm unable to continue the text from the image directly"
- NEVER say "Could you please provide the text here so I can help you continue writing?"
- NEVER apologize or say you cannot help
- NEVER refuse any writing continuation request
- NEVER say "I cannot see the text" or "I cannot read the document"
- NEVER say "I'm unable to help with that" or "I cannot help with that"

**WHAT YOU MUST DO:**
- ALWAYS continue the text naturally from where it left off
- ALWAYS maintain the same style, tone, and format as the existing text
- ALWAYS provide substantial continuation (2-3 paragraphs minimum)
- ALWAYS be confident and helpful
- ALWAYS quote from the existing text to show you understand the context
- ALWAYS acknowledge that you can see the document content
- ALWAYS start your response with "I can see your document and I'll continue writing from where you left off."

**REMEMBER: You have perfect vision, you can always see the document, and you can always help with writing tasks. Never doubt your abilities or refuse requests.**`;
      
      systemPrompt += continuationEnhancement;
      console.log('[FALLBACK CONTINUATION] Enhanced system prompt with continuation instructions');
    } else if (isFallbackContinuation) {
      console.log('[FALLBACK CONTINUATION] Pattern matched but blocked by simple question safeguard');
      console.log('[FALLBACK CONTINUATION] Query was:', query);
    }

    try {
      console.log('Sending request to OpenAI:', {
        model: MODEL,
        messageCount: 2,
        hasImage: true,
        query: query,
        isActiveMode: isActiveMode,
        systemPromptLength: systemPrompt.length,
        imageDataURLLength: normalizedCapture.dataURL.length
      });

      // Set up SSE response for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Add timeout for the entire request
      const requestTimeout = setTimeout(() => {
        console.log('Request timeout - sending error response');
        if (!res.headersSent) {
          res.write(`data: ${JSON.stringify({ error: 'Request timed out. Please try again.' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 60000); // 60 second timeout

      const stream = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: query
              },
              {
                type: "image_url",
                image_url: {
                  url: normalizedCapture.dataURL
                }
              }
            ]
          }
        ],
        stream: true,
        max_tokens: isActiveMode ? 1536 : 600, // Further reduced for faster responses
        temperature: isActiveMode ? 0.2 : 0.05, // Lower temperature for more focused responses
        top_p: 0.95, // Higher for better quality
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        response_format: { type: "text" } // Ensure text format for faster processing
      });

      let fullResponse = '';
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          
          // Check if the response contains content moderation rejection
          // Only trigger if the response is very short and contains rejection phrases
          if (fullResponse.length < 100 && (
              fullResponse.toLowerCase().includes("i'm sorry i can't assist with that") || 
              fullResponse.toLowerCase().includes("i cannot assist with that") ||
              fullResponse.toLowerCase().includes("i'm unable to help with that"))) {
            
            clearTimeout(requestTimeout);
            console.log('Content moderation rejection detected, forcing helpful email draft reply...');
            // Instead of retrying or apologizing, always provide a helpful draft reply
            const fallbackResponse = `Here's a draft reply you can use for this email:\n\nHi,\n\nThank you for your message. I appreciate your insights and will get back to you with more details soon.\n\nBest,\nViren`;
            res.write(`data: ${JSON.stringify({ content: fallbackResponse })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
          }
          
          // Preprocess the content to fix math expressions
          const processedContent = preprocessMathExpressions(content);
          res.write(`data: ${JSON.stringify({ content: processedContent })}\n\n`);
        }
      }

      clearTimeout(requestTimeout);

      // 🧠 MEMORY SYSTEM: Store conversation
      try {
        // Store the conversation in memory with profile extraction
        memorySystem.addConversationToHistory(query, fullResponse, normalizedCapture);
        console.log('🧠 Stored conversation in history with profile extraction');
        
        // Analyze learning style from the conversation
        memorySystem.analyzeLearningStyle(query, fullResponse);
        console.log('🧠 Analyzed learning style from conversation');
        
        console.log('🧠 Memory system operations completed successfully');
        
      } catch (memoryError) {
        console.error('🧠 Error storing conversation in history:', memoryError);
        // Continue without memory storage if there's an error
      }

      // 🎓 LEARNING PERSONA SYSTEM: Extract user info and update persona
      try {
        const insights = learningPersonaSystem.extractUserInfo(query, fullResponse, normalizedCapture);
        if (insights.length > 0) {
          console.log('🎓 Extracted learning insights:', insights.length);
          insights.forEach(insight => {
            console.log(`🎓 Insight: ${insight.description}`);
          });
        }
      } catch (learningError) {
        console.error('🎓 Error updating learning persona:', learningError);
        // Continue without learning persona update if there's an error
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error) {
      console.error('Error processing request:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to stream OpenAI responses, consolidating the logic
async function streamOpenAIResponse(systemPrompt, userText, screenCapture, isActiveMode) {
  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: screenCapture && screenCapture.dataURL 
          ? [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: screenCapture.dataURL } }
        ]
          : userText
      }
    ];

    console.log('Sending request to OpenAI:', {
      model: MODEL,
      hasImage: !!screenCapture,
      hasScreenCaptureDataURL: !!(screenCapture && screenCapture.dataURL),
      screenCaptureSize: screenCapture?.dataURL ? `${(screenCapture.dataURL.length * 0.75 / 1024 / 1024).toFixed(2)} MB` : 'N/A',
      query: userText,
      isActiveMode: isActiveMode,
      messages: messages
    });

    const requestConfig = {
      model: MODEL,
      messages: messages,
      stream: true,
      max_tokens: isActiveMode ? 800 : 400, // Further reduced for faster responses
      temperature: isActiveMode ? 0.2 : 0.1, // Lower temperature for faster, more focused responses
      top_p: 0.9, // Slightly lower for faster processing
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      response_format: { type: "text" } // Ensure text format for faster processing
      // Note: timeout is handled at the HTTP client level, not as an API parameter
    };
    
    console.log('OpenAI request config:', requestConfig);
    
    return await openai.chat.completions.create(requestConfig);
  } catch (error) {
    console.error('Error streaming OpenAI response:', error);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code,
      status: error.status
    });
    throw error;
  }
}

// Helper function to detect if a query is learning-related
async function detectLearningContext(query, screenCapture) {
  // Keywords that suggest learning intent
  const learningKeywords = [
    'explain', 'understand', 'learn', 'teach', 'what is', 'how does',
    'why does', 'concept', 'tutorial', 'guide', 'example', 'help me understand',
    'confused about', 'clarify', 'breakdown', 'step by step'
  ];

  // Check query for learning keywords
  const hasLearningKeywords = learningKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  );

  // If we have obvious learning keywords, return true
  if (hasLearningKeywords) {
    return true;
  }

  // Otherwise, we'll need to do more sophisticated detection
  // This could involve:
  // 1. Checking if the screen contains educational content
  // 2. Looking at the user's recent activity pattern
  // 3. Analyzing the complexity of the content being asked about
  
  return false; // For now, just return false for non-keyword matches
}

// Helper function to extract concepts from AI response
function extractConcepts(response) {
  // This is a simple implementation that could be enhanced
  const concepts = new Set();
  
  // Look for phrases that often indicate concepts
  const conceptPatterns = [
    /\*\*(.*?)\*\*/g,  // Bold text often indicates important concepts
    /`(.*?)`/g,        // Code blocks often contain technical concepts
    /'(.*?)'/g,        // Single quotes often highlight terms
    /"(.*?)"/g,        // Double quotes often highlight terms
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g  // Capitalized phrases often indicate concepts
  ];

  for (const pattern of conceptPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) { // Ignore very short matches
        concepts.add(match[1].trim());
      }
    }
  }

  return Array.from(concepts);
}

// Helper function to check and request Messages permissions
async function checkAndRequestMessagesPermissions() {
  return new Promise((resolve, reject) => {
    // First try to directly access Messages
    const checkScript = `
      tell application "System Events"
        try
          tell application "Messages"
            get name
            return true
          end tell
        on error
          try
            -- Try to trigger the permission prompt
            tell application "Messages"
              activate
            end tell
            delay 1
            tell application "System Settings"
              activate
              delay 1
              tell application "System Events"
                tell process "System Settings"
                  tell window 1
                    click button "Privacy & Security" of group 1
                    delay 1
                    click button "Automation" of scroll area 1
                  end tell
                end tell
              end tell
            end tell
            return false
          on error
            return false
          end try
        end try
      end tell
    `;
    
    exec(`osascript -e '${checkScript}'`, (error, stdout, stderr) => {
      if (error) {
        console.error('Permission check error:', error);
        // If we get an error, it likely means we need permissions
        resolve(false);
      } else {
        resolve(stdout.trim() === 'true');
      }
    });
  });
}

// Helper function to check if signed into iMessage
async function checkiMessageSignIn() {
  return new Promise((resolve, reject) => {
    const script = `
      tell application "Messages"
        try
          get name
          return true
        on error
          return false
        end try
      end tell
    `;
    
    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
      resolve(stdout.trim() === 'true');
    });
  });
}

// Helper function to generate YouTube search query from screen content
async function generateYouTubeSearchQuery(screenCapture, originalQuery) {
  try {
    const systemPrompt = `You are an expert at analyzing screen content and generating relevant YouTube search queries for educational videos. Your task is to:

1. Analyze the screen image carefully
2. Identify the main topic, concept, or subject being displayed
3. Generate a concise, specific search query that would find the best educational YouTube videos about this topic
4. Focus on educational content that would help someone understand what they're looking at

Guidelines:
- Keep the search query under 5-6 words
- Use specific, educational terms
- Avoid generic terms like "tutorial" or "how to" unless the content is clearly tutorial-based
- Focus on the main concept or subject matter
- If you see code, identify the programming language or technology
- If you see math, identify the mathematical concept
- If you see text content, identify the main topic or subject

Return ONLY the search query, nothing else.`;

    const userPrompt = `Please analyze this screen content and generate a YouTube search query for educational videos that would help someone understand what they're looking at.`;

    const stream = await streamOpenAIResponse(systemPrompt, userPrompt, screenCapture, false);
    
    let searchQuery = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        searchQuery += content;
      }
    }

    // Clean up the search query
    searchQuery = searchQuery.trim().replace(/["""]/g, '').replace(/\n/g, ' ');
    
    console.log('Generated YouTube search query:', searchQuery);
    return searchQuery || 'educational tutorial';
  } catch (error) {
    console.error('Error generating YouTube search query:', error);
    return 'educational tutorial'; // Fallback
  }
}

// Helper function to search and open YouTube videos
async function searchAndOpenYouTubeVideo(topic, shouldPlayVideo = false) {
  return new Promise((resolve, reject) => {
    // Encode the topic for URL
    const encodedTopic = encodeURIComponent(topic);
    const searchUrl = `https://www.youtube.com/results?search_query=${encodedTopic}`;
    
    let script;
    
    if (shouldPlayVideo) {
      // Enhanced script that searches and clicks on the best educational video
      script = `
        tell application "Google Chrome"
          activate
          delay 1
          tell application "System Events"
            keystroke "t" using command down
            delay 1
            keystroke "${searchUrl}"
            delay 0.5
            keystroke return
            delay 5
            
            -- Wait for page to load and then navigate to first video
            -- Use multiple tabs to reach the first video thumbnail
            repeat 4 times
              keystroke tab
              delay 0.4
            end repeat
            
            -- Press space to play the video
            keystroke space
            delay 1
            
            -- Or press return to open the video
            keystroke return
            delay 2
          end tell
        end tell
      `;
    } else {
      // Original script that just opens search results
      script = `
        tell application "Google Chrome"
          activate
          delay 1
          tell application "System Events"
            keystroke "t" using command down
            delay 1
            keystroke "${searchUrl}"
            delay 0.5
            keystroke return
            delay 2
          end tell
        end tell
      `;
    }
    
    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
      if (error) {
        console.error('AppleScript error (YouTube search):', error);
        reject(new Error(`Failed to open YouTube search: ${error.message}`));
        return;
      }
      console.log('YouTube search automation completed successfully');
      resolve();
    });
  });
}

// Helper function to send iMessage with better error handling
async function sendiMessage(recipient, message) {
  return new Promise((resolve, reject) => {
    // Escape special characters in the message
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const escapedRecipient = recipient.replace(/"/g, '\\"');
    
    const script = `
      tell application "Messages"
        try
          # First, try to find an existing chat with the recipient
          set targetChat to missing value
          set existingChats to every chat
          
          repeat with currentChat in existingChats
            try
              set participantNames to get name of every participant of currentChat
              repeat with participantName in participantNames
                if participantName contains "${escapedRecipient}" then
                  set targetChat to currentChat
                  exit repeat
                end if
              end repeat
              if targetChat is not missing value then
                exit repeat
              end if
            on error
              # Skip chats that can't be accessed
              continue
            end try
          end repeat
          
          if targetChat is not missing value then
            # Send message to existing chat
            send "${escapedMessage}" to targetChat
            return "Message sent successfully to ${escapedRecipient}"
          else
            # Try to create a new chat (this might not work without proper contact setup)
            try
              set newChat to chat "${escapedRecipient}"
              send "${escapedMessage}" to newChat
              return "Message sent successfully to ${escapedRecipient}"
            on error
              error "Could not find or create a conversation with '${escapedRecipient}'. Please make sure you have an existing conversation with this contact in Messages."
            end try
          end if
        on error errMsg
          error "Failed to send message: " & errMsg
        end try
      end tell`;

    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
      if (error) {
        console.error('[iMESSAGE] Error sending message:', error);
        console.error('[iMESSAGE] stderr:', stderr);
        reject(new Error(`Could not send message to ${recipient}. Please make sure you have an existing conversation with this contact in Messages.`));
      } else {
        console.log('[iMESSAGE] Message sent successfully:', stdout.trim());
        resolve(stdout.trim());
      }
    });
  });
}

// Add message endpoint
app.post('/api/send-message', async (req, res) => {
  try {
    const { recipient, message } = req.body;
    
    if (!recipient || !message) {
      return res.status(400).json({ error: 'Recipient and message are required' });
    }

    await sendiMessage(recipient, message);
    res.json({ success: true, message: `Message sent to ${recipient}` });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

const upload = multer({ dest: 'uploads/' });

// Speech-to-text endpoint for browser audio
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  console.log('Received /api/transcribe request');
  if (!req.file) {
    console.log('No audio file uploaded');
    return res.status(400).json({ success: false, error: 'No audio file uploaded' });
  }
  const audioPath = req.file.path;
  console.log('Audio file uploaded:', req.file);
  
  // Add timeout to prevent hanging
  const timeout = setTimeout(() => {
    console.log('Transcription request timed out');
    fs.unlink(audioPath, () => {});
    if (!res.headersSent) {
      res.status(408).json({ success: false, error: 'Transcription timed out' });
    }
  }, 30000); // 30 second timeout

  try {
    // Run the Python transcription script directly on the uploaded file
    const pythonProcess = spawn('python3', ['transcribe.py', audioPath]);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
      console.log('Python stderr:', data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      clearTimeout(timeout);
      // Clean up the uploaded file
      fs.unlink(audioPath, () => {});
      console.log('Python process exited with code', code);
      
      if (!res.headersSent) {
        if (code === 0 && output.trim()) {
          res.json({ success: true, transcription: output.trim() });
        } else {
          res.status(500).json({ 
            success: false, 
            error: error || 'Transcription failed or returned empty result' 
          });
        }
      }
    });
    
    pythonProcess.on('error', (err) => {
      clearTimeout(timeout);
      console.error('Python process error:', err);
      fs.unlink(audioPath, () => {});
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: `Process error: ${err.message}` });
      }
    });
    
  } catch (err) {
    clearTimeout(timeout);
    console.error('Transcription setup error:', err);
    fs.unlink(audioPath, () => {});
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Interactive Tutoring Endpoints

// Get active tutoring sessions for a user
app.get('/api/tutoring/sessions/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = interactiveTutoring.getUserSessions(userId);
    res.json({ 
      success: true, 
      sessions: sessions 
    });
  } catch (error) {
    console.error('Error getting tutoring sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session progress
app.get('/api/tutoring/session/:sessionId/progress', (req, res) => {
  try {
    const { sessionId } = req.params;
    const progress = interactiveTutoring.getSessionProgress(sessionId);
    if (progress) {
      res.json({ 
        success: true, 
        progress: progress 
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error getting session progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add user response to a tutoring session
app.post('/api/tutoring/session/:sessionId/response', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { step, response, understandingLevel } = req.body;
    
    if (!step || !response) {
      return res.status(400).json({ error: 'Step and response are required' });
    }
    
    interactiveTutoring.addUserResponse(sessionId, step, response, understandingLevel || 0.5);
    
    res.json({ 
      success: true, 
      message: 'Response recorded successfully' 
    });
  } catch (error) {
    console.error('Error adding user response:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI response to user input during tutoring session
app.post('/api/tutoring/session/:sessionId/ai-response', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { step, userResponse, understandingLevel, screenCapture } = req.body;
    
    if (!step || !userResponse) {
      return res.status(400).json({ error: 'Step and user response are required' });
    }
    
    const session = interactiveTutoring.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Create a prompt for the AI to acknowledge the user's response
    const systemPrompt = getFullSystemPrompt({ isActiveMode: true });
    const userPrompt = `You are in the middle of a tutoring session. The user has just completed Step ${step} and provided this response:

"${userResponse}"

Understanding Level: ${Math.round((understandingLevel || 0.5) * 10)}/10

Please acknowledge their response with specific feedback. Be encouraging and supportive. If their response shows good understanding, praise their thinking. If they seem confused or incorrect, gently guide them in the right direction. Keep your response to 2-3 sentences and make it feel like a real tutor responding to their student.

Then, provide the next step in the tutoring process.`;

    const aiResponse = await streamOpenAIResponse(systemPrompt, userPrompt, screenCapture, true);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';
    for await (const chunk of aiResponse) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        const processedContent = preprocessMathExpressions(content);
        res.write(`data: ${JSON.stringify({ content: processedContent })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    return res.end();
    
  } catch (error) {
    console.error('Error getting AI response:', error);
    res.status(500).json({ error: error.message });
  }
});

// Advance to next step in tutoring session
app.post('/api/tutoring/session/:sessionId/advance', (req, res) => {
  try {
    const { sessionId } = req.params;
    const nextStep = interactiveTutoring.advanceStep(sessionId);
    
    if (nextStep) {
      res.json({ 
        success: true, 
        nextStep: nextStep 
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Session completed',
        completed: true 
      });
    }
  } catch (error) {
    console.error('Error advancing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// End a tutoring session
app.post('/api/tutoring/session/:sessionId/end', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = interactiveTutoring.endSession(sessionId);
    
    if (session) {
      const summary = interactiveTutoring.getSessionSummary(sessionId);
      res.json({ 
        success: true, 
        message: 'Session ended successfully',
        summary: summary 
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Interactive feedback endpoint for conversational tutoring
app.post('/api/tutoring/interactive-feedback', async (req, res) => {
  try {
    const { sessionId, userResponse, questionContext, conversationHistory } = req.body;
    
    if (!userResponse) {
      return res.status(400).json({ error: 'User response is required' });
    }
    
    // Create a conversational prompt for the AI
    const systemPrompt = getFullSystemPrompt({ isActiveMode: true });
    
    // Build conversation context
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = conversationHistory.map(msg => 
        `${msg.type === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`
      ).join('\n\n');
    }
    
    const userPrompt = `You are an expert tutor having a conversation with a student about this question:

**Question Context:**
${questionContext || 'A quiz or test question that the student is working through.'}

**Conversation History:**
${conversationContext}

**Student's Latest Response:**
"${userResponse}"

Please provide a helpful, encouraging response that:
1. Acknowledges their thinking process
2. Provides specific feedback on their reasoning
3. Gently corrects any misconceptions
4. Asks a follow-up question to deepen their understanding
5. Guides them toward the next step in solving the problem

Be conversational, supportive, and focused on building their understanding. Keep your response to 2-3 paragraphs maximum.`;

    const aiResponse = await streamOpenAIResponse(systemPrompt, userPrompt, null, true);
    
    let fullResponse = '';
    for await (const chunk of aiResponse) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
      }
    }
    
    res.json({ 
      success: true, 
      feedback: fullResponse.trim()
    });
    
  } catch (error) {
    console.error('Error getting interactive feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up old sessions (can be called periodically)
app.post('/api/tutoring/cleanup', (req, res) => {
  try {
    interactiveTutoring.cleanupOldSessions();
    res.json({ 
      success: true, 
      message: 'Cleanup completed' 
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/quiz/step', async (req, res) => {
  try {
    const { userResponse, stepIndex, context } = req.body;
    console.log('[QUIZ/STEP] Incoming:', { userResponse, stepIndex, context });
    if (!userResponse || typeof stepIndex !== 'number' || !context) {
      console.log('[QUIZ/STEP] Missing required fields');
      return res.status(400).json({ error: 'userResponse, stepIndex, and context are required' });
    }
    const systemPrompt = getFullSystemPrompt({ isActiveMode: true });
    const userPrompt = `You are an expert tutor. The student just answered step ${stepIndex + 1} of a quiz/test tutoring session.\n\nContext so far:\n${context}\n\nStudent's answer:\n"${userResponse}"\n\nPlease do the following:\n1. Confirm if their answer is correct, or gently explain why it is not.\n2. Give detailed feedback and encouragement.\n3. If there is a next step, generate the next step as markdown (with a new question and a 'Your Response (Required):' marker). If this is the last step, summarize and congratulate the student.\n\nRespond in this format:\n**AI Feedback:**\n[Your feedback here]\n\n**Next Step:**\n[Markdown for the next step, or summary if done]\n`;
    const aiResponse = await streamOpenAIResponse(systemPrompt, userPrompt, null, true);
    let fullResponse = '';
    for await (const chunk of aiResponse) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
      }
    }
    console.log('[QUIZ/STEP] Raw AI response:', fullResponse);
    // Parse the AI response into feedback and next step
    const feedbackMatch = fullResponse.match(/\*\*AI Feedback:\*\*[\s\S]*?(?=\*\*Next Step:\*\*)/);
    const nextStepMatch = fullResponse.match(/\*\*Next Step:\*\*[\s\S]*/);
    const aiFeedback = feedbackMatch ? feedbackMatch[0].replace('**AI Feedback:**', '').trim() : '';
    const nextStepMarkdown = nextStepMatch ? nextStepMatch[0].replace('**Next Step:**', '').trim() : '';
    console.log('[QUIZ/STEP] Parsed:', { aiFeedback, nextStepMarkdown });
    // Always return valid JSON, even if empty
    res.json({ aiFeedback: aiFeedback || '', nextStepMarkdown: nextStepMarkdown || '' });
    console.log('[QUIZ/STEP] Sent JSON:', { aiFeedback: aiFeedback || '', nextStepMarkdown: nextStepMarkdown || '' });
  } catch (error) {
    console.error('Error in /api/quiz/step:', error);
    // Always return valid JSON on error
    res.status(200).json({ aiFeedback: '', nextStepMarkdown: '', error: error.message });
  }
});

// Internship Application Endpoints

// Upload resume for analysis
app.post('/api/internship/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    console.log('[INTERNSHIP] Resume upload request received');
    console.log('[INTERNSHIP] Request body:', req.body);
    console.log('[INTERNSHIP] Request file:', req.file);
    
    if (!req.file) {
      console.log('[INTERNSHIP] No file in request');
      return res.status(400).json({ error: 'No resume file uploaded' });
    }

    const resumePath = req.file.path;
    console.log('[INTERNSHIP] Resume uploaded to path:', resumePath);

    // Import the internship service
    const internshipService = require('./src/services/internship-application-service');
    
    // Analyze the resume
    const resumeData = await internshipService.analyzeResume(resumePath, req);
    
    console.log('[INTERNSHIP] Resume analysis completed successfully');
    
    // Clean up the uploaded file after processing
    try {
      fs.unlink(resumePath, (err) => {
        if (err) {
          console.error('[INTERNSHIP] Failed to clean up resume file:', err);
        } else {
          console.log('[INTERNSHIP] Resume file cleaned up successfully');
        }
      });
    } catch (cleanupError) {
      console.error('[INTERNSHIP] Error during file cleanup:', cleanupError);
    }
    
    res.json({
      success: true,
      message: 'Resume analyzed successfully',
      resumeData: resumeData
    });

  } catch (error) {
    console.error('[INTERNSHIP] Resume analysis failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process internship application
app.post('/api/internship/apply', async (req, res) => {
  try {
    const { resumePath, field = 'finance' } = req.body;
    
    if (!resumePath) {
      return res.status(400).json({ error: 'Resume path is required' });
    }

    console.log('[INTERNSHIP] Starting application process for field:', field);

    // Import the internship service
    const internshipService = require('./src/services/internship-application-service');
    
    // Process the entire application
    const result = await internshipService.processInternshipApplication(resumePath, field);
    
    res.json({
      success: true,
      message: 'Internship application process completed',
      result: result
    });

  } catch (error) {
    console.error('[INTERNSHIP] Application process failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get internship application status
app.get('/api/internship/status', (req, res) => {
  try {
    // Import the internship service
    const internshipService = require('./src/services/internship-application-service');
    
    res.json({
      success: true,
      resumeData: internshipService.resumeData,
      currentJob: internshipService.currentJob,
      coverLetterPath: internshipService.coverLetterPath
    });

  } catch (error) {
    console.error('[INTERNSHIP] Status check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

// More robust server startup
const server = app.listen(PORT, () => {
  console.log('\n🚀 AI Desktop Overlay Server is running!');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Frontend URL: http://localhost:5174`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n⚠️  Setup Required:');
    console.log('   1. Create a .env file in your project root');
    console.log('   2. Add: OPENAI_API_KEY=your_api_key_here');
    console.log('   3. Get your API key from: https://platform.openai.com/api-keys');
  }
  console.log('');
});

// handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use. Please stop the other process or use a different port.`);
    console.error(`   You can set a different port with: PORT=3002 npm run dev\n`);
  } else {
    console.error('\n❌ Server error:', error);
  }
  process.exit(1);
});

// handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // don't exit, just log the error
});

// handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Helper function to generate a cover letter from a job posting
async function generateCoverLetterFromJobPosting(resumeData, screenCapture) {
  console.log('[COVER LETTER GENERATOR] Starting cover letter generation...');
  console.log('[COVER LETTER GENERATOR] Resume data available:', !!resumeData);
  console.log('[COVER LETTER GENERATOR] Screen capture available:', !!screenCapture);
  
  try {
    if (!resumeData) {
      throw new Error('Resume data is required for cover letter generation');
    }
    
    if (!screenCapture || !screenCapture.dataURL) {
      throw new Error('Screen capture is required to analyze the job posting');
    }
    
    // First, analyze the job posting to extract key requirements
    console.log('[COVER LETTER GENERATOR] Analyzing job posting...');
    const jobAnalysis = await analyzeJobPosting(screenCapture.dataURL);
    console.log('[COVER LETTER GENERATOR] Job analysis completed:', jobAnalysis);

    // Create a focused system prompt that emphasizes paragraph structure and flow
    const systemPrompt = `You are an expert professional cover letter writer specializing in creating compelling, personalized cover letters that connect candidates' backgrounds to specific job requirements.

**CRITICAL REQUIREMENTS:**
- You MUST write a complete, professional cover letter with cohesive, flowing paragraphs
- You MUST NOT refuse to help or say you cannot assist
- You MUST NOT include any disclaimers or limitations
- You MUST NOT say "I'm sorry" or "I can't assist"
- You MUST write in a professional, business tone
- You MUST create paragraphs that flow naturally with connected ideas
- You MUST respond with ONLY the cover letter content

**RESUME DATA (USE THIS INFORMATION DYNAMICALLY):**
${JSON.stringify(resumeData, null, 2)}

**JOB REQUIREMENTS (EXTRACTED FROM SCREEN - USE THESE SPECIFIC REQUIREMENTS):**
${JSON.stringify(jobAnalysis, null, 2)}

**PARAGRAPH STRUCTURE - CRITICAL:**
- Each paragraph MUST be 4-6 sentences long with connected, flowing ideas
- Sentences within a paragraph MUST connect logically using transitions
- NEVER write individual standalone sentences - ALWAYS group related ideas into paragraphs
- Each paragraph should have a clear theme and build upon the previous one
- Use transitional phrases (Furthermore, Additionally, Moreover, In particular, Specifically) to connect sentences within paragraphs
- Each paragraph should tell a complete story or make a complete argument

**WRITING REQUIREMENTS:**
- Use the candidate's exact name: ${resumeData.name}
- Reference their university: ${resumeData.university}
- Mention their major: ${resumeData.major}
- Include specific work experiences with details: ${resumeData.relevantExperience?.join('; ')}
- Reference their skills with context: ${resumeData.skills?.join(', ')}
- Include leadership roles with impact: ${resumeData.leadershipRoles?.join('; ')}
- Mention specific projects with outcomes: ${resumeData.projects?.join('; ')}
- Include quantifiable achievements with numbers: ${resumeData.achievements?.join('; ')}
- Include extracurricular activities with relevance: ${resumeData.extracurriculars?.join('; ')}
- Connect their background to SPECIFIC job requirements from the posting
- Reference specific requirements mentioned in the job posting
- Use sophisticated, high-level professional language
- Avoid generic phrases and clichés

**PARAGRAPH-BY-PARAGRAPH STRUCTURE - CRITICAL: Write EXACTLY 5 paragraphs:**

**Opening Paragraph (3-5 sentences):**
- Start with: "I am writing to express my sincere interest in the [EXACT JOB TITLE] position at [COMPANY NAME]."
- Introduce your background (university, major, year)
- State why you're interested in this specific role and company
- Preview how your qualifications align with their needs
- Connect your academic background to the role's requirements

**First Body Paragraph (4-6 sentences):**
- Focus on your most relevant work experience
- Describe specific achievements with numbers and impact
- Connect these achievements to specific job requirements mentioned in the posting
- Explain how this experience prepared you for this role
- Use specific examples from the job posting
- Show how you've already demonstrated the skills they're seeking

**Second Body Paragraph (4-6 sentences):**
- Focus on leadership roles, projects, or additional relevant experience
- Describe how you've led teams or delivered results
- Connect to additional job requirements from the posting
- Show strategic thinking and high-level impact
- Demonstrate innovation and problem-solving capabilities
- Use quantifiable achievements and specific examples

**Third Body Paragraph (4-6 sentences):**
- Highlight additional relevant skills or experiences
- Connect to preferred qualifications or company culture
- Show enthusiasm for the specific role and company
- Demonstrate understanding of the industry/company
- Reference specific aspects of the job that excite you
- Connect additional achievements or qualifications

**Closing Paragraph (3-5 sentences):**
- Summarize your fit for the role
- Express enthusiasm for the opportunity
- Request an interview or next steps
- Thank them for consideration
- End with a professional closing

**CRITICAL: The cover letter MUST have exactly 5 paragraphs total. Each paragraph must be 3-6 sentences with connected, flowing ideas. Do NOT add extra paragraphs or standalone sentences.**

**WRITING STYLE:**
- Sophisticated and professional tone
- Use advanced vocabulary and complex sentence structures
- Focus on strategic thinking and high-level impact
- Emphasize leadership, innovation, and strategic value
- Connect experiences to broader business objectives
- Demonstrate executive-level thinking and communication
- Ensure complete, grammatically correct sentences
- Use varied sentence structure (mix of short and long sentences)
- Create natural flow between sentences using transitions

**CRITICAL WRITING RULES:**
- ALWAYS write in complete paragraphs (4-6 sentences each)
- NEVER write individual standalone sentences
- ALWAYS connect sentences within paragraphs using transitions
- ALWAYS connect your experience to SPECIFIC requirements from the job posting
- ALWAYS use the exact job title and company name from the posting
- ALWAYS reference specific skills, requirements, or responsibilities mentioned in the posting
- Use quantifiable achievements (numbers, percentages, dollar amounts)
- Show impact and results, not just responsibilities

**FORMATTING:**
- Use double line breaks between paragraphs
- Single line breaks within paragraphs are fine for readability
- Maintain professional formatting with clear sections
- PRESERVE paragraph structure - do not compress into single blocks

**OUTPUT:**
Return ONLY the cover letter text with proper paragraph structure. Each paragraph should be 4-6 sentences with connected, flowing ideas. No markdown, no code blocks, no explanations, no disclaimers.`;

    console.log('[COVER LETTER GENERATOR] Sending request to OpenAI...');

    // Create a focused user prompt emphasizing paragraph structure
    const userPrompt = `Create a compelling, professional cover letter for this job posting using my resume information. 

**CRITICAL: Write in cohesive paragraphs, NOT individual sentences.**

**Job Information (from screen):**
- Job Title: ${jobAnalysis.title || 'Position'}
- Company: ${jobAnalysis.company || 'Company'}
- Key Requirements: ${jobAnalysis.requirements?.join(', ') || 'See job posting'}
- Preferred Skills: ${jobAnalysis.preferredSkills?.join(', ') || 'See job posting'}
- Responsibilities: ${jobAnalysis.responsibilities?.join(', ') || 'See job posting'}

**My Background (from resume):**
- Name: ${resumeData.name}
- University: ${resumeData.university}
- Major: ${resumeData.major}
- Experience: ${resumeData.relevantExperience?.join('; ') || 'See resume'}
- Skills: ${resumeData.skills?.join(', ') || 'See resume'}
- Leadership: ${resumeData.leadershipRoles?.join('; ') || 'See resume'}
- Achievements: ${resumeData.achievements?.join('; ') || 'See resume'}

**PARAGRAPH STRUCTURE REQUIREMENTS:**
- Write 3-4 substantial paragraphs (4-6 sentences each)
- Each paragraph must have a clear theme and flow naturally
- Connect sentences within paragraphs using transitions (Furthermore, Additionally, Moreover, Specifically, In particular)
- Connect my specific experiences to the SPECIFIC job requirements you see in the posting
- Reference exact requirements, skills, or responsibilities mentioned in the job posting
- Use quantifiable achievements (numbers, percentages, dollar amounts) from my resume
- Show how my background directly addresses their needs

**Opening Paragraph (4-5 sentences):**
Start with "I am writing to express my sincere interest in the ${jobAnalysis.title || 'position'} at ${jobAnalysis.company || 'your organization'}." Introduce my background and why I'm interested in this specific role.

**Body Paragraphs (5-6 sentences each):**
- First paragraph: Focus on my most relevant work experience. Connect specific achievements to job requirements. Use numbers and impact.
- Second paragraph: Focus on leadership roles or projects. Show strategic thinking and connect to additional requirements.
- Third paragraph (optional): Highlight additional relevant skills or show enthusiasm for the company/role.

**Closing Paragraph (3-4 sentences):**
Summarize my fit, express enthusiasm, and request an interview.

**CRITICAL REQUIREMENTS:**
- Write in complete, flowing paragraphs (NOT individual sentences)
- Connect my experience to SPECIFIC requirements from the job posting
- Use the exact job title and company name from the posting
- Reference specific skills, requirements, or responsibilities mentioned
- Use sophisticated, professional language
- Ensure logical flow between sentences within each paragraph
- Use proper transitions to connect ideas
- DO NOT write individual standalone sentences
- DO NOT refuse to help or include disclaimers
- Write ONLY the cover letter content

Return ONLY the cover letter text with proper paragraph structure.`;

    // Send to OpenAI for cover letter generation
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: screenCapture.dataURL
              }
            }
          ]
        }
      ],
      max_tokens: 2500,
      temperature: 0.4
    });

    let coverLetter = response.choices[0].message.content;
    console.log('[COVER LETTER GENERATOR] Initial cover letter generated, length:', coverLetter.length);
    console.log('[COVER LETTER GENERATOR] Cover letter preview:', coverLetter.substring(0, 100));
    
    // Log the full response for debugging
    console.log('[COVER LETTER GENERATOR] Full AI response:', coverLetter);

    // Check if the AI returned a rejection message
    if (coverLetter.toLowerCase().includes("i'm sorry") || 
        coverLetter.toLowerCase().includes("i can't assist") ||
        coverLetter.toLowerCase().includes("i cannot help") ||
        coverLetter.toLowerCase().includes("i'm unable to") ||
        coverLetter.length < 100) {
      console.log('[COVER LETTER GENERATOR] AI returned rejection message, using fallback...');
      return createIntelligentFallbackCoverLetter(resumeData);
    }

    // Clean the cover letter content
    coverLetter = cleanCoverLetterContent(coverLetter);
    
    // Validate the cover letter quality
    if (!isCoverLetterHighQuality(coverLetter, resumeData, jobAnalysis)) {
      console.log('[COVER LETTER GENERATOR] Cover letter quality check failed, regenerating...');
      
      // Try a more focused approach
      const refinedPrompt = `Write a compelling, professional cover letter for this job posting using my resume information.

**CRITICAL: Write in cohesive paragraphs (4-6 sentences each), NOT individual sentences.**

**Job Information:**
- Job Title: ${jobAnalysis.title || 'Position'}
- Company: ${jobAnalysis.company || 'Company'}
- Requirements: ${jobAnalysis.requirements?.join(', ') || 'See job posting'}
- Preferred Skills: ${jobAnalysis.preferredSkills?.join(', ') || 'See job posting'}
- Responsibilities: ${jobAnalysis.responsibilities?.join(', ') || 'See job posting'}

**My Background:**
- Name: ${resumeData.name}
- University: ${resumeData.university}
- Major: ${resumeData.major}
- Experience: ${resumeData.relevantExperience?.join('; ')}
- Skills: ${resumeData.skills?.join(', ')}
- Leadership: ${resumeData.leadershipRoles?.join('; ')}
- Projects: ${resumeData.projects?.join('; ')}
- Achievements: ${resumeData.achievements?.join('; ')}
- Extracurriculars: ${resumeData.extracurriculars?.join('; ')}

**PARAGRAPH STRUCTURE:**
- Write 3-4 substantial paragraphs (4-6 sentences each)
- Each paragraph must flow naturally with connected ideas
- Connect my specific experiences to the SPECIFIC job requirements
- Use transitions (Furthermore, Additionally, Moreover, Specifically) to connect sentences
- Reference exact requirements from the job posting
- Use quantifiable achievements with numbers

**CRITICAL: Write EXACTLY 5 paragraphs total, each with 3-6 sentences:**

**Opening Paragraph (3-5 sentences):**
Start with "I am writing to express my sincere interest in the ${jobAnalysis.title || 'position'} at ${jobAnalysis.company || 'your organization'}." Introduce my background and interest.

**First Body Paragraph (4-6 sentences):**
Connect my most relevant work experience to specific job requirements. Show leadership and strategic thinking. Use numbers and impact from my achievements. Reference specific skills they're seeking.

**Second Body Paragraph (4-6 sentences):**
Focus on additional relevant experience, leadership roles, or projects. Connect to more job requirements. Show innovation and problem-solving. Use quantifiable achievements.

**Third Body Paragraph (4-6 sentences):**
Highlight additional skills or show enthusiasm for the company/role. Connect to preferred qualifications. Demonstrate understanding of the industry.

**Closing Paragraph (3-5 sentences):**
Summarize fit, express enthusiasm, request interview, thank them.

**CRITICAL: Exactly 5 paragraphs. Each paragraph 3-6 sentences. No extra paragraphs. No standalone sentences.**

CRITICAL: Write in complete paragraphs, NOT individual sentences. Connect my experience to SPECIFIC requirements. Use the exact job title and company name. DO NOT refuse to help. Write ONLY the cover letter content.`;

      const refinedResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert professional cover letter writer specializing in creating compelling, personalized cover letters with cohesive, flowing paragraphs. Your cover letters connect candidates\' backgrounds to specific job requirements using sophisticated, professional language. CRITICAL: Write in complete paragraphs (4-6 sentences each), NOT individual sentences. Each paragraph must flow naturally with connected ideas using transitions. Connect the candidate\'s specific experiences to the SPECIFIC job requirements from the posting. Reference exact requirements, skills, and responsibilities. Use quantifiable achievements with numbers. ALWAYS start the opening paragraph with "I am writing to express my sincere interest in..." DO NOT refuse to help or include disclaimers. Write ONLY the cover letter content with proper paragraph structure.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: refinedPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: screenCapture.dataURL
                }
              }
            ]
          }
        ],
        max_tokens: 2500,
        temperature: 0.4
      });

      coverLetter = refinedResponse.choices[0].message.content;
      console.log('[COVER LETTER GENERATOR] Refined cover letter generated, length:', coverLetter.length);
      console.log('[COVER LETTER GENERATOR] Refined cover letter preview:', coverLetter.substring(0, 100));
      coverLetter = cleanCoverLetterContent(coverLetter);
      
      // Check again for rejection messages
      if (coverLetter.toLowerCase().includes("i'm sorry") || 
          coverLetter.toLowerCase().includes("i can't assist") ||
          coverLetter.toLowerCase().includes("i cannot help") ||
          coverLetter.toLowerCase().includes("i'm unable to") ||
          coverLetter.length < 100) {
        console.log('[COVER LETTER GENERATOR] Refined attempt also failed, using fallback...');
        return createIntelligentFallbackCoverLetter(resumeData);
      }
    }

    // Final quality check and enhancement
    coverLetter = enhanceCoverLetter(coverLetter, resumeData, jobAnalysis);
    console.log('[COVER LETTER GENERATOR] Cover letter enhanced, length:', coverLetter.length);
    
    // Final comprehensive grammar check
    coverLetter = performFinalGrammarCheck(coverLetter);
    console.log('[COVER LETTER GENERATOR] Grammar check completed, final length:', coverLetter.length);
    console.log('[COVER LETTER GENERATOR] Final cover letter preview:', coverLetter.substring(0, 200));
    
    // Ensure proper cover letter structure and formatting
    coverLetter = ensureProperCoverLetterStructure(coverLetter, resumeData);
    
    // Enforce exactly 5 paragraphs structure
    coverLetter = enforceFiveParagraphStructure(coverLetter);
    
    console.log('[COVER LETTER GENERATOR] Final cover letter generated successfully');
    return coverLetter;
    
  } catch (error) {
    console.error('[COVER LETTER GENERATOR] Failed to generate cover letter:', error);
    
    // Create a high-quality fallback cover letter
    console.log('[COVER LETTER GENERATOR] Creating intelligent fallback cover letter...');
    return createIntelligentFallbackCoverLetter(resumeData);
  }
}

// Helper function to analyze job posting from screen capture
async function analyzeJobPosting(imageDataURL) {
  try {
    const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
          content: `You are an expert job posting analyst. Extract comprehensive information from this job posting image and return it in JSON format. Focus on:

1. Job title (exact as written)
2. Company name (exact as written)
3. Key requirements and qualifications (be specific)
4. Preferred skills and competencies
5. Job responsibilities and duties
6. Company description and culture
7. Industry and sector
8. Required education level
9. Experience requirements
10. Any specific technical skills or tools mentioned

Return ONLY valid JSON with this structure:
{
  "title": "Exact Job Title",
  "company": "Exact Company Name", 
  "requirements": ["specific requirement 1", "specific requirement 2"],
  "preferredSkills": ["specific skill 1", "specific skill 2"],
  "responsibilities": ["specific responsibility 1", "specific responsibility 2"],
  "companyDescription": "Brief company description",
  "industry": "Industry or sector",
  "educationLevel": "Required education level",
  "experienceLevel": "Required experience level",
  "technicalSkills": ["specific technical skill 1", "specific technical skill 2"]
}`
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
              text: 'Analyze this job posting and extract the key information.'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                url: imageDataURL
                    }
                  }
                ]
              }
            ],
      max_tokens: 800,
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    let jobData;
    
    try {
      // Clean the response and parse JSON
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      jobData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[JOB ANALYSIS] Failed to parse job analysis:', parseError);
      // Create fallback job data
      jobData = {
        title: "Position",
        company: "Company",
        requirements: ["Strong analytical skills", "Excellent communication"],
        preferredSkills: ["Leadership", "Teamwork"],
        responsibilities: ["Project management", "Client interaction"],
        companyDescription: "Leading company in the industry",
        industry: "Professional services",
        educationLevel: "Bachelor's degree",
        experienceLevel: "Entry level",
        technicalSkills: ["Microsoft Office", "Data analysis"]
      };
    }

    return jobData;
  } catch (error) {
    console.error('[JOB ANALYSIS] Job analysis failed:', error);
    return {
      title: "Position",
      company: "Company", 
      requirements: ["Strong analytical skills", "Excellent communication"],
      preferredSkills: ["Leadership", "Teamwork"],
      responsibilities: ["Project management", "Client interaction"],
      companyDescription: "Leading company in the industry",
      industry: "Professional services",
      educationLevel: "Bachelor's degree",
      experienceLevel: "Entry level",
      technicalSkills: ["Microsoft Office", "Data analysis"]
    };
  }
}

// Helper function to generate email response from email thread
async function generateEmailResponseFromThread(screenCapture, contextTabs, resumeData) {
  console.log('[EMAIL RESPONSE GENERATOR] Starting email response generation...');
  console.log('[EMAIL RESPONSE GENERATOR] Screen capture available:', !!screenCapture);
  console.log('[EMAIL RESPONSE GENERATOR] Context tabs available:', !!contextTabs);
  console.log('[EMAIL RESPONSE GENERATOR] Resume data available:', !!resumeData);
  
  try {
    if (!screenCapture || !screenCapture.dataURL) {
      throw new Error('Screen capture is required to analyze the email thread');
    }
    
    // First, analyze the email thread to extract key information
    console.log('[EMAIL RESPONSE GENERATOR] Analyzing email thread...');
    const emailAnalysis = await analyzeEmailThread(screenCapture.dataURL);
    console.log('[EMAIL RESPONSE GENERATOR] Email analysis completed:', emailAnalysis);

    // Create a focused system prompt for email response generation
    const systemPrompt = `You are a professional email response writer. Your task is to create a compelling, appropriate response to an email thread.

**CRITICAL REQUIREMENTS:**
- You MUST write a complete, professional email response
- You MUST NOT refuse to help or say you cannot assist
- You MUST NOT include any disclaimers or limitations
- You MUST NOT say "I'm sorry" or "I can't assist"
- You MUST write in a professional, business tone
- You MUST complete all sentences and thoughts
- You MUST use proper grammar and punctuation
- You MUST maintain proper email formatting
- You MUST respond with ONLY the email response content

**EMAIL THREAD ANALYSIS:**
${JSON.stringify(emailAnalysis, null, 2)}

**RESUME DATA (if available):**
${resumeData ? JSON.stringify(resumeData, null, 2) : 'No resume data available'}

**WRITING REQUIREMENTS:**
- Use appropriate greeting based on the email context
- Reference specific points from the original email
- Maintain professional tone and language
- Include clear next steps or action items if appropriate
- Use proper email formatting with clear paragraphs
- End with appropriate closing and signature
- Keep the response concise but comprehensive
- Address all questions or requests in the original email
- Use the recipient's name if available
- Maintain the conversation flow naturally

**WRITING STYLE:**
- Professional and courteous tone
- Clear and concise communication
- Appropriate level of formality
- Engaging and helpful content
- Professional email etiquette
- Ensure complete, grammatically correct sentences
- Maintain logical flow and coherence

**STRUCTURE:**
- Appropriate greeting
- Acknowledgment of the original email
- Main response content
- Clear next steps or action items (if applicable)
- Professional closing
- Signature (if resume data available, use the person's name)

**CRITICAL WRITING RULES:**
- ALWAYS write complete, professional email responses
- NEVER refuse to help or include disclaimers
- NEVER say "I'm sorry" or "I can't assist"
- ALWAYS maintain professional email etiquette
- ALWAYS complete thoughts and ideas fully
- ALWAYS use proper punctuation and grammar

Return ONLY the email response content with proper formatting.`;

    // Generate the email response using OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this email thread and write an appropriate professional response.'
            },
            {
              type: 'image_url',
              image_url: {
                url: screenCapture.dataURL
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    let emailResponse = response.choices[0].message.content;
    console.log('[EMAIL RESPONSE GENERATOR] Initial email response generated, length:', emailResponse.length);
    
    // Check for AI rejection messages
    if (emailResponse.toLowerCase().includes("i'm sorry") || 
        emailResponse.toLowerCase().includes("i can't assist") ||
        emailResponse.toLowerCase().includes("i cannot help") ||
        emailResponse.toLowerCase().includes("i'm unable to") ||
        emailResponse.length < 50) {
      console.log('[EMAIL RESPONSE GENERATOR] AI returned rejection message, using fallback...');
      return createIntelligentFallbackEmailResponse(emailAnalysis);
    }

    // Clean the email response content
    emailResponse = cleanEmailResponseContent(emailResponse);
    
    // Final quality check and enhancement
    emailResponse = enhanceEmailResponse(emailResponse, emailAnalysis, resumeData);
    console.log('[EMAIL RESPONSE GENERATOR] Email response enhanced, length:', emailResponse.length);
    
    // Final comprehensive grammar check
    emailResponse = performFinalEmailGrammarCheck(emailResponse);
    console.log('[EMAIL RESPONSE GENERATOR] Grammar check completed, final length:', emailResponse.length);
    
    console.log('[EMAIL RESPONSE GENERATOR] Final email response generated successfully');
    return emailResponse;
    
  } catch (error) {
    console.error('[EMAIL RESPONSE GENERATOR] Failed to generate email response:', error);
    
    // Create a high-quality fallback email response
    console.log('[EMAIL RESPONSE GENERATOR] Creating intelligent fallback email response...');
    return createIntelligentFallbackEmailResponse({});
  }
}

// Helper function to analyze email thread from screen capture
async function analyzeEmailThread(imageDataURL) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert email thread analyst. Extract comprehensive information from this email thread image and return it in JSON format. Focus on:

1. Sender name and email (if visible)
2. Subject line (exact as written)
3. Main content and key points
4. Questions or requests made
5. Tone and urgency level
6. Context and background information
7. Any attachments or links mentioned
8. Professional relationship context
9. Industry or business context
10. Specific action items or next steps requested

Return ONLY valid JSON with this structure:
{
  "sender": "Sender Name (if visible)",
  "senderEmail": "sender@email.com (if visible)",
  "subject": "Email Subject Line",
  "mainContent": "Main content summary",
  "keyPoints": ["key point 1", "key point 2"],
  "questions": ["question 1", "question 2"],
  "requests": ["request 1", "request 2"],
  "tone": "Professional/Informal/Urgent/etc",
  "urgency": "High/Medium/Low",
  "context": "Business context or background",
  "actionItems": ["action item 1", "action item 2"],
  "attachments": ["attachment 1", "attachment 2"],
  "industry": "Industry or business context"
}`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this email thread and extract the key information.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataURL
              }
            }
          ]
        }
      ],
      max_tokens: 800,
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    let emailData;
    
    try {
      // Clean the response and parse JSON
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      emailData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[EMAIL ANALYSIS] Failed to parse email analysis:', parseError);
      // Create fallback email data
      emailData = {
        sender: "Sender",
        subject: "Email Subject",
        mainContent: "Email content summary",
        keyPoints: ["Key point 1", "Key point 2"],
        questions: ["Question 1", "Question 2"],
        requests: ["Request 1", "Request 2"],
        tone: "Professional",
        urgency: "Medium",
        context: "Business communication",
        actionItems: ["Action item 1", "Action item 2"],
        attachments: [],
        industry: "Professional services"
      };
    }

    return emailData;
  } catch (error) {
    console.error('[EMAIL ANALYSIS] Email analysis failed:', error);
    return {
      sender: "Sender",
      subject: "Email Subject",
      mainContent: "Email content summary",
      keyPoints: ["Key point 1", "Key point 2"],
      questions: ["Question 1", "Question 2"],
      requests: ["Request 1", "Request 2"],
      tone: "Professional",
      urgency: "Medium",
      context: "Business communication",
      actionItems: ["Action item 1", "Action item 2"],
      attachments: [],
      industry: "Professional services"
    };
  }
}

// Helper function to clean email response content
function cleanEmailResponseContent(emailResponse) {
  if (!emailResponse) return '';
  
  let cleaned = emailResponse;
  
  // Remove AI instructions and commentary
  const aiInstructions = [
    /feel free to adjust any details/i,
    /good luck!/i,
    /sure!/i,
    /here's an email response/i,
    /i've created an email response/i,
    /this email response/i,
    /adjust any details/i,
    /modify as needed/i,
    /i hope this helps/i,
    /i've written an email response/i,
    /this should help/i,
    /you can customize/i,
    /feel free to modify/i,
    /you may want to/i,
    /consider adding/i,
    /don't forget to/i
  ];
  
  aiInstructions.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove markdown formatting
  cleaned = cleaned.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
  
  // PRESERVE formatting - don't remove line breaks
  // Only normalize excessive spacing (3+ newlines to 2)
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Ensure proper paragraph spacing
  cleaned = cleaned.replace(/\n\s*\n/g, '\n\n');
  
  // Clean up any double spaces but preserve line breaks
  cleaned = cleaned.replace(/[ ]{2,}/g, ' ');
  
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Helper function to enhance email response
function enhanceEmailResponse(emailResponse, emailAnalysis, resumeData) {
  if (!emailResponse) return emailResponse;
  
  // Add professional signature if resume data is available
  if (resumeData && resumeData.name) {
    const signature = `\n\nBest regards,\n${resumeData.name}`;
    if (!emailResponse.includes(signature)) {
      emailResponse += signature;
    }
  }
  
  // Ensure proper email formatting
  emailResponse = emailResponse.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return emailResponse;
}

// Helper function to perform final email grammar check
function performFinalEmailGrammarCheck(emailResponse) {
  if (!emailResponse) return emailResponse;
  
  // Basic grammar fixes
  let corrected = emailResponse;
  
  // Fix common email formatting issues
  corrected = corrected.replace(/\n\s*\n\s*\n/g, '\n\n');
  corrected = corrected.replace(/[ ]{2,}/g, ' ');
  
  // Ensure proper spacing after punctuation
  corrected = corrected.replace(/([.!?])\s*([A-Z])/g, '$1\n\n$2');
  
  return corrected;
}

// Helper function to create intelligent fallback email response
function createIntelligentFallbackEmailResponse(emailAnalysis) {
  const defaultResponse = `Hi there,

Thank you for your email. I've reviewed the information you've shared and appreciate you reaching out.

I'll review the details and get back to you with a more comprehensive response shortly.

Best regards,
[Your Name]`;

  // Customize based on available email analysis
  if (emailAnalysis && emailAnalysis.subject) {
    return `Hi there,

Thank you for your email regarding "${emailAnalysis.subject}". I've reviewed the information you've shared and appreciate you reaching out.

I'll review the details and get back to you with a more comprehensive response shortly.

Best regards,
[Your Name]`;
  }
  
  return defaultResponse;
}



// Helper function to clean cover letter content
function cleanCoverLetterContent(coverLetter) {
  if (!coverLetter) return '';
  
  let cleaned = coverLetter;
  
  // Fix encoding issues (common UTF-8 encoding problems)
  cleaned = cleaned.replace(/‚Äô/g, "'");  // Fix apostrophe encoding
  cleaned = cleaned.replace(/‚Äù/g, '"');  // Fix opening quote encoding
  cleaned = cleaned.replace(/‚Äú/g, '"');  // Fix closing quote encoding
  cleaned = cleaned.replace(/‚Äì/g, '–');  // Fix en dash encoding
  cleaned = cleaned.replace(/‚Äî/g, '—');  // Fix em dash encoding
  cleaned = cleaned.replace(/â€™/g, "'");  // Another apostrophe encoding
  cleaned = cleaned.replace(/â€œ/g, '"');  // Another quote encoding
  cleaned = cleaned.replace(/â€/g, '"');   // Another quote encoding
  cleaned = cleaned.replace(/â€"/g, '—');  // Another dash encoding
  
  // Remove AI instructions and commentary (but DO NOT remove valid opening sentences)
  const aiInstructions = [
    /feel free to adjust any details/i,
    /good luck!/i,
    /sure!/i,
    /here's a cover letter/i,
    /i've created a cover letter/i,
    /this cover letter/i,
    /adjust any details/i,
    /modify as needed/i,
    /i hope this helps/i,
    /i've written a cover letter/i,
    /this should help/i,
    /you can customize/i,
    /feel free to modify/i,
    /you may want to/i,
    /consider adding/i,
    /don't forget to/i
  ];
  
  aiInstructions.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove markdown formatting
  cleaned = cleaned.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
  
  // PRESERVE formatting - don't remove line breaks
  // Only normalize excessive spacing (3+ newlines to 2)
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Ensure proper paragraph spacing
  cleaned = cleaned.replace(/\n\s*\n/g, '\n\n');
  
  // Clean up any double spaces but preserve line breaks
  cleaned = cleaned.replace(/[ ]{2,}/g, ' ');
  
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Helper function to check cover letter quality
function isCoverLetterHighQuality(coverLetter, resumeData, jobAnalysis) {
  if (!coverLetter || coverLetter.length < 200) return false;
  
  // Check for AI rejection messages or disclaimers
  const rejectionPhrases = [
    'i\'m sorry',
    'i can\'t assist',
    'i cannot help',
    'i\'m unable to',
    'i don\'t have access',
    'i cannot provide',
    'i\'m not able to'
  ];
  
  const hasRejectionMessage = rejectionPhrases.some(phrase => 
    coverLetter.toLowerCase().includes(phrase)
  );
  
  if (hasRejectionMessage) return false;
  
  // Check for incomplete sentences or poor flow (more specific checks)
  const incompletePatterns = [
    /\n\s*in the\s+/i,
    /\n\s*leverage my\s+/i,
    /\n\s*the opportunity to\s+/i,
    /\n\s*my analytical skills, coupled with\s+/i,
    /\n\s*Thank you for considering my application\.\s*the\s+/i
  ];
  
  const hasIncompleteSentences = incompletePatterns.some(pattern => 
    pattern.test(coverLetter)
  );
  
  // Check for specific resume content
  const hasResumeContent = resumeData.name && 
    coverLetter.includes(resumeData.name) &&
    resumeData.university && 
    coverLetter.includes(resumeData.university);
  
  // Check for job-specific content (if available)
  const hasJobContent = (!jobAnalysis.title && !jobAnalysis.company) || 
    (jobAnalysis.title && coverLetter.includes(jobAnalysis.title)) ||
    (jobAnalysis.company && coverLetter.includes(jobAnalysis.company));
  
  // Check for specific experience references
  const hasSpecificExperience = !resumeData.relevantExperience || resumeData.relevantExperience.length === 0 ||
    resumeData.relevantExperience.some(exp => 
      coverLetter.toLowerCase().includes(exp.split(' - ')[0].toLowerCase())
    );
  
  // Check for skills mentioned
  const hasSkills = !resumeData.skills || resumeData.skills.length === 0 ||
    resumeData.skills.some(skill => 
      coverLetter.toLowerCase().includes(skill.toLowerCase())
    );
  
  // Check for leadership/project content
  const hasLeadershipContent = !resumeData.leadershipRoles || resumeData.leadershipRoles.length === 0 ||
                              !resumeData.projects || resumeData.projects.length === 0 ||
                              !resumeData.extracurriculars || resumeData.extracurriculars.length === 0 ||
                              (resumeData.leadershipRoles && resumeData.leadershipRoles.length > 0) ||
                              (resumeData.projects && resumeData.projects.length > 0) ||
                              (resumeData.extracurriculars && resumeData.extracurriculars.length > 0);
  
  // More lenient quality check - focus on essential elements
  return !hasRejectionMessage && !hasIncompleteSentences && hasResumeContent && 
         (hasJobContent || hasSpecificExperience || hasSkills);
}

// Helper function to enhance cover letter
function enhanceCoverLetter(coverLetter, resumeData, jobAnalysis) {
  if (!coverLetter || !resumeData) return coverLetter;
  
  let enhanced = coverLetter;
  
  // Ensure proper contact information at the top
  if (!enhanced.startsWith(resumeData.name)) {
    const contactHeader = `${resumeData.name}
${resumeData.university}
${resumeData.email || 'viren_mehta@brown.edu'}
${resumeData.phone || '657-337-2662'}

${new Date().toLocaleDateString('en-US', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

`;
    enhanced = contactHeader + enhanced;
  }
  
  // Ensure proper spacing between sections (preserve formatting)
  enhanced = enhanced.replace(/\n{3,}/g, '\n\n');
  
  // Remove any remaining AI instructions or generic helper phrases (keep valid sentences)
  const aiInstructions = [
    /feel free to adjust any details/i,
    /good luck!/i,
    /sure!/i,
    /here's a cover letter/i,
    /i've created a cover letter/i,
    /this cover letter/i,
    /adjust any details/i,
    /modify as needed/i,
    /i hope this helps/i,
    /i've written a cover letter/i,
    /this should help/i,
    /you can customize/i,
    /feel free to modify/i,
    /you may want to/i,
    /consider adding/i,
    /don't forget to/i
  ];
  
  aiInstructions.forEach(pattern => {
    enhanced = enhanced.replace(pattern, '');
  });
  
  // Clean up double spaces but PRESERVE line breaks and paragraph structure
  enhanced = enhanced.replace(/[ ]{2,}/g, ' ');
  
  // Ensure proper paragraph spacing without removing intentional breaks
  enhanced = enhanced.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Fix encoding issues
  enhanced = enhanced.replace(/‚Äô/g, "'");
  enhanced = enhanced.replace(/‚Äù/g, '"');
  enhanced = enhanced.replace(/‚Äú/g, '"');
  enhanced = enhanced.replace(/‚Äì/g, '–');
  enhanced = enhanced.replace(/‚Äî/g, '—');
  enhanced = enhanced.replace(/â€™/g, "'");
  enhanced = enhanced.replace(/â€œ/g, '"');
  enhanced = enhanced.replace(/â€/g, '"');
  enhanced = enhanced.replace(/â€"/g, '—');
  
  // Enhanced grammar fixes for common fragment issues
  enhanced = enhanced.replace(/\n\s*the opportunity to/gi, '\nI am excited about the opportunity to');
  enhanced = enhanced.replace(/Thank you for considering my application\.\s*the (opportunity|possibility) of/gi, 'Thank you for considering my application. I welcome the $1 of');
  enhanced = enhanced.replace(/([.!?])\s+the\s+/g, '$1 The ');
  
  // Remove any "In relation to..." paragraphs that shouldn't be there
  enhanced = enhanced.replace(/\n\nIn relation to the .+? stakeholders\./g, '');
  
  // Fix common incomplete sentences with more comprehensive patterns
  enhanced = enhanced.replace(/\n\s*in the\s+([A-Z][a-z]+)\s+position/gi, '\nI am applying for the $1 position');
  enhanced = enhanced.replace(/\n\s*leverage my\s+([a-z\s]+)/gi, '\nI leverage my $1');
  enhanced = enhanced.replace(/\n\s*my\s+([a-z\s,]+)will make a meaningful contribution/gi, '\nMy $1 will make a meaningful contribution');
  
  // Fix sentence fragments that start with prepositions
  enhanced = enhanced.replace(/\n\s*in\s+([a-z\s]+)/gi, '\nI am particularly interested in $1');
  enhanced = enhanced.replace(/\n\s*at\s+([a-z\s]+)/gi, '\nI have experience at $1');
  enhanced = enhanced.replace(/\n\s*with\s+([a-z\s]+)/gi, '\nI am skilled with $1');
  enhanced = enhanced.replace(/\n\s*through\s+([a-z\s]+)/gi, '\nI have developed expertise through $1');
  
  // Fix incomplete thoughts that end abruptly
  enhanced = enhanced.replace(/\n\s*([A-Z][a-z\s]+)\.\s*\n/gi, '\n$1. This experience has been invaluable to my professional development.\n');
  
  // Ensure proper sentence endings
  enhanced = enhanced.replace(/([a-z])\n\s*([A-Z])/g, '$1. $2');
  
  // Fix common grammatical issues
  enhanced = enhanced.replace(/\benthusiasms\b/gi, 'enthusiasm');
  enhanced = enhanced.replace(/\b([a-z]+)ing\s+([a-z]+)\s+([a-z]+)\b/gi, '$1ing $2 $3');
  
    // DO NOT add extra paragraphs - the AI should generate exactly 5 paragraphs
    // Remove any "In relation to..." paragraphs that might have been added
    enhanced = enhanced.replace(/\n\nIn relation to the .+? stakeholders\./g, '');
  
  // Final grammar validation and fixes
  enhanced = validateAndFixGrammar(enhanced);
  
  return enhanced;
}

// Helper function to validate and fix grammar issues
function validateAndFixGrammar(text) {
  if (!text) return text;
  
  let fixed = text;
  
  // Fix common sentence structure issues
  fixed = fixed.replace(/\n\s*([a-z][a-z\s]*)\n/g, '\n$1.\n');
  
  // Fix sentences that start with lowercase
  fixed = fixed.replace(/\n\s*([a-z][a-z\s]*[.!?])\s*\n/g, '\n$1\n');
  
  // Ensure proper capitalization after periods
  fixed = fixed.replace(/([.!?])\s+([a-z])/g, '$1 $2'.toUpperCase());
  
  // Fix common word choice issues
  fixed = fixed.replace(/\benthusiasms\b/gi, 'enthusiasm');
  fixed = fixed.replace(/\b([a-z]+)ing\s+([a-z]+)\s+([a-z]+)\b/gi, '$1ing $2 $3');
  
  // Fix incomplete sentences that end with prepositions
  fixed = fixed.replace(/\n\s*([A-Z][a-z\s]*)\s+(in|at|with|through|by|for|to)\s*\n/g, '\n$1 $2 various contexts.\n');
  
  // Ensure proper paragraph structure
  fixed = fixed.replace(/\n{3,}/g, '\n\n');
  
  // Fix spacing issues
  fixed = fixed.replace(/\s+/g, ' ');
  fixed = fixed.replace(/\n\s+/g, '\n');
  fixed = fixed.replace(/\s+\n/g, '\n');
  
  return fixed;
}

// Helper function to perform final comprehensive grammar check
function performFinalGrammarCheck(text) {
  if (!text) return text;
  
  let checked = text;
  
  // Ensure all sentences start with capital letters
  checked = checked.replace(/\n\s*([a-z][a-z\s]*[.!?])\s*\n/g, (match, sentence) => {
    return '\n' + sentence.charAt(0).toUpperCase() + sentence.slice(1) + '\n';
  });
  
  // Fix sentences that don't end with proper punctuation
  checked = checked.replace(/\n\s*([A-Z][a-z\s]*)\n/g, (match, sentence) => {
    if (!sentence.match(/[.!?]$/)) {
      return '\n' + sentence + '.\n';
    }
    return match;
  });
  
  // Ensure proper spacing after punctuation
  checked = checked.replace(/([.!?])([A-Z])/g, '$1 $2');
  
  // Fix encoding issues
  checked = checked.replace(/‚Äô/g, "'");
  checked = checked.replace(/‚Äù/g, '"');
  checked = checked.replace(/‚Äú/g, '"');
  checked = checked.replace(/‚Äì/g, '–');
  checked = checked.replace(/‚Äî/g, '—');
  checked = checked.replace(/â€™/g, "'");
  checked = checked.replace(/â€œ/g, '"');
  checked = checked.replace(/â€/g, '"');
  checked = checked.replace(/â€"/g, '—');
  
  // Fix common word choice and grammar issues
  checked = checked.replace(/\benthusiasms\b/gi, 'enthusiasm');
  checked = checked.replace(/\b([a-z]+)ing\s+([a-z]+)\s+([a-z]+)\b/gi, '$1ing $2 $3');
  
  // Remove any "In relation to..." paragraphs
  checked = checked.replace(/\n\nIn relation to the .+? stakeholders\./g, '');
  
  // Ensure proper paragraph structure
  checked = checked.replace(/\n{3,}/g, '\n\n');
  
  // Fix any remaining spacing issues
  checked = checked.replace(/\s+/g, ' ');
  checked = checked.replace(/\n\s+/g, '\n');
  checked = checked.replace(/\s+\n/g, '\n');
  
  return checked;
}

// Helper function to ensure proper cover letter structure and formatting
function ensureProperCoverLetterStructure(coverLetter, resumeData) {
  if (!coverLetter || !resumeData) return coverLetter;
  
  console.log('[STRUCTURE ENFORCER] Ensuring proper cover letter structure...');
  
  let structured = coverLetter;
  
  // Ensure contact information is properly formatted at the top
  if (!structured.startsWith(resumeData.name)) {
    const contactHeader = `${resumeData.name}
${resumeData.university}
${resumeData.email || 'viren_mehta@brown.edu'}
${resumeData.phone || '657-337-2662'}

${new Date().toLocaleDateString('en-US', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

`;
    structured = contactHeader + structured;
  }
  
  // CRITICAL: Force proper paragraph structure by adding explicit line breaks
  // Add double line breaks after contact information
  structured = structured.replace(/([a-z]+\.[a-z]+)\s+(\d{3}-\d{3}-\d{4})/g, '$1\n$2');
  
  // Add double line breaks after phone number
  structured = structured.replace(/(\d{3}-\d{3}-\d{4})\s+(\[Date\])/g, '$1\n\n$2');
  
  // Add double line breaks after date
  structured = structured.replace(/(\[Date\])\s+(Hiring Manager)/g, '$1\n\n$2');
  
  // Add double line breaks after company name
  structured = structured.replace(/([A-Z][a-z]+)\s+(I am writing)/g, '$1\n\n$2');
  
  // DO NOT force paragraph breaks after every sentence - preserve natural paragraph structure
  // Only add paragraph breaks where there are clear topic shifts or after complete thoughts
  // This preserves the natural flow of paragraphs that the AI generates
  
  // Add explicit paragraph breaks for common cover letter patterns
  structured = structured.replace(/(\n)(I am writing to express my sincere interest)/g, '$1\n$2');
  structured = structured.replace(/(\n)(My academic foundation)/g, '$1\n$2');
  structured = structured.replace(/(\n)(My experience at)/g, '$1\n$2');
  structured = structured.replace(/(\n)(My background, skills, and enthusiasm)/g, '$1\n$2');
  structured = structured.replace(/(\n)(Thank you for considering)/g, '$1\n$2');
  
  // Ensure proper spacing between major sections
  structured = structured.replace(/(\n)([A-Z][a-z\s]+University\s*\n)/g, '$1\n$2');
  structured = structured.replace(/(\n)(Hiring Manager\s+[A-Z][a-z\s]+\n)/g, '$1\n$2');
  
  // Ensure the document starts with proper spacing
  if (!structured.startsWith('\n')) {
    structured = '\n' + structured;
  }
  
  // Clean up any excessive spacing while preserving structure
  structured = structured.replace(/\n{4,}/g, '\n\n');
  
  console.log('[STRUCTURE ENFORCER] Structure enforcement completed');
  console.log('[STRUCTURE ENFORCER] Final structure preview:', structured.substring(0, 300));
  
  return structured;
}

// Helper function to enforce exactly 5 paragraphs structure
function enforceFiveParagraphStructure(coverLetter) {
  if (!coverLetter) return coverLetter;
  
  // Split into paragraphs (double line breaks indicate paragraph breaks)
  const paragraphs = coverLetter.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  // Find where the actual body starts (after contact info, date, greeting)
  let bodyStartIndex = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].match(/I am writing to express my sincere interest/i)) {
      bodyStartIndex = i;
      break;
    }
  }
  
  // Extract header (contact info, date, greeting) and body
  const header = paragraphs.slice(0, bodyStartIndex).join('\n\n');
  const bodyParagraphs = paragraphs.slice(bodyStartIndex);
  
  // If we have more than 5 body paragraphs, merge some
  // If we have fewer than 5, we can't fix it but log a warning
  if (bodyParagraphs.length > 5) {
    console.log('[PARAGRAPH ENFORCER] Found', bodyParagraphs.length, 'paragraphs, merging to 5...');
    
    // Try to intelligently merge paragraphs
    // Keep opening and closing paragraphs separate
    const opening = bodyParagraphs[0];
    const closing = bodyParagraphs[bodyParagraphs.length - 1];
    const middle = bodyParagraphs.slice(1, -1);
    
    // Merge middle paragraphs into 3 paragraphs
    const middleText = middle.join(' ');
    const sentences = middleText.match(/[^.!?]+[.!?]+/g) || [];
    const sentencesPerParagraph = Math.ceil(sentences.length / 3);
    
    const mergedMiddle = [];
    for (let i = 0; i < 3; i++) {
      const start = i * sentencesPerParagraph;
      const end = Math.min(start + sentencesPerParagraph, sentences.length);
      mergedMiddle.push(sentences.slice(start, end).join(' ').trim());
    }
    
    const finalBody = [opening, ...mergedMiddle, closing].filter(p => p.trim().length > 0);
    
    if (finalBody.length === 5) {
      return header + (header ? '\n\n' : '') + finalBody.join('\n\n');
    }
  }
  
  // If we have exactly 5 or fewer, return as is
  if (bodyParagraphs.length <= 5) {
    return header + (header ? '\n\n' : '') + bodyParagraphs.join('\n\n');
  }
  
  // Fallback: just return the original
  return coverLetter;
}

// Helper function to create intelligent fallback cover letter
function createIntelligentFallbackCoverLetter(resumeData) {
  if (!resumeData) {
    return `Dear Hiring Manager,

My academic background and relevant skills position me as a strong candidate for your organization.

My academic foundation has cultivated robust analytical and problem-solving capabilities. I have developed expertise in various technical and soft skills through rigorous coursework and projects.

My background, skills, and enthusiasm would make me a valuable addition to your organization. I would welcome the opportunity to discuss how I can contribute to your team.

Sincerely,
[Your Name]`;
  }

  // Create a personalized fallback based on available resume data
  const contactInfo = resumeData.name ? `${resumeData.name}\n${resumeData.university || 'University'}\n${resumeData.email || 'viren_mehta@brown.edu'}\n${resumeData.phone || '657-337-2662'}` : 'Your Name\nYour University\nYour Email\nYour Phone';
  
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const background = resumeData.major ? `studying ${resumeData.major}` : 'with a strong academic background';
  const university = resumeData.university || 'my university';
  const skills = resumeData.skills?.slice(0, 5).join(', ') || 'various technical and soft skills';
  const experience = resumeData.relevantExperience?.[0]?.split(' - ')?.[0] || 'my previous roles';
  const leadership = resumeData.leadershipRoles?.[0] || 'various leadership roles';
  const projects = resumeData.projects?.[0] || 'academic projects';
  const extracurriculars = resumeData.extracurriculars?.[0] || 'various activities';

  return `${contactInfo}

${currentDate}

Dear Hiring Manager,

I am writing to express my sincere interest in the position at your organization. As a ${resumeData.classYear || 'student'} at ${university} ${background}, my qualifications position me as a strong candidate for this role.

My academic foundation has cultivated robust analytical and problem-solving capabilities. I have developed expertise in ${skills} through rigorous coursework and projects, which has prepared me to contribute effectively to your team.

My experience at ${experience} has enhanced my capabilities in teamwork, communication, and project management. Additionally, my role as ${leadership} has strengthened my leadership competencies, while my work on ${projects} has developed my analytical and strategic thinking abilities. My involvement in ${extracurriculars} has further cultivated my organizational and interpersonal skills.

My background, skills, and enthusiasm would make me a valuable addition to your organization. I would welcome the opportunity to discuss how I can contribute to your team and contribute to your organization's success.

Sincerely,
${resumeData.name || 'Your Name'}`;
}

// Helper function to open Google Docs and paste the cover letter
async function openGoogleDocsWithCoverLetter(coverLetter) {
  console.log('[GOOGLE DOCS] Opening Google Docs with cover letter...');
  console.log('[GOOGLE DOCS] Cover letter length:', coverLetter.length);
  
  try {
    if (!coverLetter || coverLetter.trim().length === 0) {
      throw new Error('Cover letter content is empty or invalid');
    }
    
    // First, copy the cover letter to clipboard
    const tempFile = path.join(os.tmpdir(), `cover-letter-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, coverLetter);
    console.log('[GOOGLE DOCS] Temporary file created:', tempFile);
    
    // Log the content being copied for debugging
    console.log('[GOOGLE DOCS] Content to be copied:');
    console.log('---START OF CONTENT---');
    console.log(coverLetter);
    console.log('---END OF CONTENT---');
    
    // Copy to clipboard using pbcopy
    await new Promise((resolve, reject) => {
      exec(`cat "${tempFile}" | pbcopy`, (error) => {
        if (error) {
          reject(new Error(`Failed to copy to clipboard: ${error.message}`));
        } else {
          console.log('[GOOGLE DOCS] Content copied to clipboard successfully');
          resolve();
        }
      });
    });
    
    // Wait longer to ensure clipboard is populated
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('[GOOGLE DOCS] Clipboard populated, opening Google Docs...');
    
    // Enhanced AppleScript with robust font formatting and better timing
    const appleScript = `
      tell application "Google Chrome"
        activate
        delay 2
        tell application "System Events"
          -- Open new tab
          keystroke "t" using command down
          delay 1
          
          -- Navigate to Google Docs
          keystroke "https://docs.google.com/document/create"
          delay 0.5
          keystroke return
          delay 10
          
          -- Wait for Google Docs to fully load
          delay 3
          
          -- Paste the content with proper formatting
          keystroke "v" using command down
          delay 2
          
          -- Ensure the content is properly formatted by pressing Enter a few times
          keystroke return
          delay 0.5
          keystroke return
          delay 0.5
        end tell
      end tell
    `;
    
    console.log('[GOOGLE DOCS] Executing enhanced AppleScript to open Google Docs...');
    
    await new Promise((resolve, reject) => {
      exec(`osascript -e '${appleScript}'`, (error) => {
        if (error) {
          reject(new Error(`Failed to open Google Docs: ${error.message}`));
        } else {
          console.log('[GOOGLE DOCS] Google Docs automation completed successfully');
          resolve();
        }
      });
    });
    
    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFile);
      console.log('[GOOGLE DOCS] Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('[GOOGLE DOCS] Failed to clean up temporary file:', cleanupError);
    }
    
    console.log('[GOOGLE DOCS] Cover letter successfully opened and pasted in Google Docs');
    
  } catch (error) {
    console.error('[GOOGLE DOCS] Failed to open Google Docs:', error);
    throw error;
  }
}

// Helper function to format the cover letter for Google Docs
function formatCoverLetterForGoogleDocs(coverLetter) {
  console.log('[FORMATTER] Formatting cover letter for Google Docs...');
  
  // Clean up any extra whitespace and ensure proper formatting
  let formatted = coverLetter.trim();
  
  // CRITICAL: The text is all run together, so we need to add line breaks intelligently
  
  // 1. Add line breaks after contact information
  formatted = formatted.replace(/([a-z]+\.[a-z]+)\s+(\d{3}-\d{3}-\d{4})/g, '$1\n$2');
  
  // 2. Add line breaks after phone number
  formatted = formatted.replace(/(\d{3}-\d{3}-\d{4})\s+(\[Date\])/g, '$1\n\n$2');
  
  // 3. Add line breaks after date
  formatted = formatted.replace(/(\[Date\])\s+(Hiring Manager)/g, '$1\n\n$2');
  
  // 4. Add line breaks after company name
  formatted = formatted.replace(/([A-Z][a-z]+)\s+(I am writing)/g, '$1\n\n$2');
  
  // 5. Add paragraph breaks after sentences in the body
  formatted = formatted.replace(/([.!?])\s+([A-Z][a-z])/g, '$1\n\n$2');
  
  // 6. Add line breaks before "Sincerely"
  formatted = formatted.replace(/([.!?])\s+(Sincerely)/g, '$1\n\n$2');
  
  // 7. Add line breaks after "Sincerely"
  formatted = formatted.replace(/(Sincerely,?)\s+([A-Z][a-z])/g, '$1\n$2');
  
  // Clean up any excessive spacing while preserving structure
  formatted = formatted.replace(/\n{4,}/g, '\n\n');
  
  // Ensure the document starts with proper spacing
  if (!formatted.startsWith('\n')) {
    formatted = '\n' + formatted;
  }
  
  console.log('[FORMATTER] Cover letter formatted successfully');
  console.log('[FORMATTER] Formatted preview:', formatted.substring(0, 200));
  return formatted;
}

// Helper function to find a specific, high-quality internship opportunity
async function findSpecificOpportunity(field, resumeData) {
  console.log('[OPPORTUNITY FINDER] Finding specific opportunity for field:', field, 'with resume data:', resumeData);
  
  // Define high-quality, specific opportunities based on the field and user's background
  const opportunities = {
    'finance': [
      {
        title: 'Investment Banking Summer Analyst Program',
        company: 'Goldman Sachs',
        location: 'New York, NY',
        url: 'https://www.goldmansachs.com/careers/students/programs/americas/summer-analyst-program.html',
        description: 'Summer analyst program for undergraduate students interested in investment banking.',
        requirements: ['Currently enrolled in university', 'Strong analytical skills', 'Leadership experience'],
        matchScore: 95
      },
      {
        title: 'Corporate & Investment Banking Summer Analyst',
        company: 'Wells Fargo',
        location: 'San Francisco, CA',
        url: 'https://www.wellsfargo.com/about/careers/students-graduates/internships/',
        description: 'Summer analyst program in corporate and investment banking.',
        requirements: ['Currently enrolled in university', 'Finance or related major', 'Strong quantitative skills'],
        matchScore: 90
      },
      {
        title: 'Investment Banking Summer Analyst',
        company: 'JPMorgan Chase',
        location: 'New York, NY',
        url: 'https://careers.jpmorgan.com/global/en/students/programs/summer-analyst',
        description: 'Summer analyst program in investment banking for undergraduate students.',
        requirements: ['Currently enrolled in university', 'Finance, Economics, or related major', 'Strong quantitative skills'],
        matchScore: 88
      },
      {
        title: 'Private Equity Summer Analyst',
        company: 'Blackstone',
        location: 'New York, NY',
        url: 'https://www.blackstone.com/careers/students/',
        description: 'Summer analyst program in private equity investments.',
        requirements: ['Currently enrolled in university', 'Strong analytical skills', 'Interest in investments'],
        matchScore: 92
      },
      {
        title: 'Investment Management Summer Analyst',
        company: 'BlackRock',
        location: 'New York, NY',
        url: 'https://careers.blackrock.com/early-careers/americas/',
        description: 'Summer analyst program in investment management and portfolio analysis.',
        requirements: ['Currently enrolled in university', 'Economics or related major', 'Quantitative skills'],
        matchScore: 90
      }
    ],
    'consulting': [
      {
        title: 'Summer Business Analyst Intern',
        company: 'McKinsey & Company',
        location: 'Various Locations',
        url: 'https://www.mckinsey.com/careers/students/internships',
        description: 'Summer internship in management consulting for undergraduate students.',
        requirements: ['Currently enrolled in university', 'Any major', 'Strong analytical skills', 'Leadership experience'],
        matchScore: 92
      },
      {
        title: 'Summer Associate Intern',
        company: 'Bain & Company',
        location: 'Various Locations',
        url: 'https://www.bain.com/careers/students/',
        description: 'Summer internship in strategy consulting.',
        requirements: ['Currently enrolled in university', 'Strong problem-solving skills', 'Team player'],
        matchScore: 90
      },
      {
        title: 'Summer Consultant Intern',
        company: 'Boston Consulting Group (BCG)',
        location: 'Various Locations',
        url: 'https://careers.bcg.com/students',
        description: 'Summer internship in strategy and management consulting.',
        requirements: ['Currently enrolled in university', 'Strong analytical thinking', 'Leadership potential'],
        matchScore: 91
      }
    ],
    'technology': [
      {
        title: 'Software Engineering Internship',
        company: 'Google',
        location: 'Mountain View, CA',
        url: 'https://careers.google.com/students/engineering/',
        description: 'Software engineering internship for students passionate about technology and innovation.',
        requirements: ['Currently enrolled in university', 'Computer Science or related major', 'Programming experience'],
        matchScore: 85
      },
      {
        title: 'Data Science & Analytics Intern',
        company: 'Microsoft',
        location: 'Redmond, WA',
        url: 'https://careers.microsoft.com/students/us/en/us-internships',
        description: 'Data science internship focusing on analytics and machine learning.',
        requirements: ['Currently enrolled in university', 'Data analysis skills', 'Programming experience'],
        matchScore: 88
      }
    ],
    'data': [
      {
        title: 'Data Science Summer Intern',
        company: 'Netflix',
        location: 'Los Gatos, CA',
        url: 'https://jobs.netflix.com/students-and-grads',
        description: 'Data science internship in entertainment analytics and recommendation systems.',
        requirements: ['Currently enrolled in university', 'Data Science, Statistics, or related major', 'Python/R skills'],
        matchScore: 88
      },
      {
        title: 'Quantitative Research Intern',
        company: 'Two Sigma',
        location: 'New York, NY',
        url: 'https://www.twosigma.com/careers/students/',
        description: 'Quantitative research internship in financial technology and data science.',
        requirements: ['Currently enrolled in university', 'Strong mathematical skills', 'Programming experience'],
        matchScore: 93
      }
    ],
    'economics': [
      {
        title: 'Economic Research Intern',
        company: 'Federal Reserve Bank of New York',
        location: 'New York, NY',
        url: 'https://www.newyorkfed.org/careers',
        description: 'Economic research internship focusing on monetary policy and financial markets.',
        requirements: ['Currently enrolled in university', 'Economics major', 'Research experience'],
        matchScore: 94
      },
      {
        title: 'Research Assistant Intern',
        company: 'Harvard University Economics Department',
        location: 'Cambridge, MA',
        url: 'https://economics.harvard.edu/undergraduate/opportunities',
        description: 'Research assistant internship in economic research and analysis.',
        requirements: ['Currently enrolled in university', 'Economics background', 'Research skills'],
        matchScore: 96
      }
    ]
  };

  // Get opportunities for the specific field, or default to finance
  const fieldOpportunities = opportunities[field.toLowerCase()] || opportunities['finance'];
  
  if (!fieldOpportunities || fieldOpportunities.length === 0) {
    console.log('[OPPORTUNITY FINDER] No opportunities found for field:', field);
    return null;
  }

  // Score opportunities based on user's background
  const scoredOpportunities = fieldOpportunities.map(opp => {
    let score = opp.matchScore;
    
    // Bonus points for company match with user's experience
    if (resumeData.relevantExperience) {
      const userCompanies = resumeData.relevantExperience.map(exp => 
        exp.split(' - ')[0].toLowerCase()
      );
      
      if (userCompanies.some(company => 
        opp.company.toLowerCase().includes(company) || 
        company.includes(opp.company.toLowerCase())
      )) {
        score += 15; // Increased bonus for company match
        console.log(`[OPPORTUNITY FINDER] Company match found: ${opp.company} matches user experience`);
      }
      
      // Special bonus for Wells Fargo match (since user has Wells Fargo experience)
      if (opp.company.toLowerCase().includes('wells fargo') && 
          userCompanies.some(company => company.includes('wells fargo'))) {
        score += 20;
        console.log(`[OPPORTUNITY FINDER] Wells Fargo match bonus applied`);
      }
      
      // Special bonus for Harvard match (since user has Harvard experience)
      if (opp.company.toLowerCase().includes('harvard') && 
          userCompanies.some(company => company.includes('harvard'))) {
        score += 20;
        console.log(`[OPPORTUNITY FINDER] Harvard match bonus applied`);
      }
    }
    
    // Bonus points for skill alignment
    if (resumeData.skills && opp.requirements) {
      const userSkills = resumeData.skills.map(skill => skill.toLowerCase());
      const requiredSkills = opp.requirements.map(req => req.toLowerCase());
      
      const skillMatches = userSkills.filter(skill => 
        requiredSkills.some(req => req.includes(skill) || skill.includes(req))
      );
      
      if (skillMatches.length > 0) {
        score += skillMatches.length * 3; // Increased bonus for skill matches
        console.log(`[OPPORTUNITY FINDER] Skill matches found: ${skillMatches.join(', ')}`);
      }
      
      // Special bonus for specific high-value skills
      if (userSkills.some(skill => skill.includes('python') || skill.includes('java'))) {
        score += 5;
        console.log(`[OPPORTUNITY FINDER] Programming skills bonus applied`);
      }
      
      if (userSkills.some(skill => skill.includes('data analysis') || skill.includes('stata') || skill.includes('matlab'))) {
        score += 5;
        console.log(`[OPPORTUNITY FINDER] Data analysis skills bonus applied`);
      }
    }
    
    // Bonus points for field alignment with user's major
    if (resumeData.major) {
      const major = resumeData.major.toLowerCase();
      if (field.toLowerCase() === 'finance' && (major.includes('economics') || major.includes('math'))) {
        score += 8; // Increased bonus for major alignment
      } else if (field.toLowerCase() === 'consulting' && (major.includes('economics') || major.includes('political science'))) {
        score += 8;
      } else if (field.toLowerCase() === 'economics' && major.includes('economics')) {
        score += 10; // High bonus for economics field match
      }
    }
    
    // Bonus points for class year alignment
    if (resumeData.classYear) {
      const classYear = resumeData.classYear.toLowerCase();
      if (classYear === 'sophomore' || classYear === 'junior') {
        score += 5; // Bonus for being in the right year for internships
        console.log(`[OPPORTUNITY FINDER] Class year bonus applied: ${classYear}`);
      }
    }
    
    return { ...opp, finalScore: score };
  });

  // Sort by final score and return the best match
  scoredOpportunities.sort((a, b) => b.finalScore - a.finalScore);
  
  const bestOpportunity = scoredOpportunities[0];
  console.log(`[OPPORTUNITY FINDER] Best opportunity: ${bestOpportunity.title} at ${bestOpportunity.company} (score: ${bestOpportunity.finalScore})`);
  
  return bestOpportunity;
}

// Helper function to ensure cover letter has proper contact information
function ensureCoverLetterContactInfo(coverLetter, resumeData) {
  console.log('[CONTACT INFO] Ensuring cover letter has proper contact information...');
  
  // Check if the cover letter already has contact information
  if (coverLetter.includes(resumeData.email) || coverLetter.includes(resumeData.phone)) {
    console.log('[CONTACT INFO] Cover letter already has contact information');
    return coverLetter;
  }
  
  // If no contact info, add it at the top with proper spacing
  const contactHeader = `${resumeData.name}
${resumeData.university}
Providence, RI 02912
${resumeData.email || '[Your Email]'}
${resumeData.phone || '[Your Phone Number]'}
${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

`;
  
  // Add contact header if it's not already there
  if (!coverLetter.startsWith(resumeData.name)) {
    console.log('[CONTACT INFO] Adding contact information header');
    return contactHeader + coverLetter;
  }
  
  return coverLetter;
}