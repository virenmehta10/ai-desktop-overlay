const fs = require('fs');
const path = require('path');

class MemorySystem {
  constructor() {
    this.conversationFile = path.join(__dirname, '../../conversation-history.json');
    this.userProfileFile = path.join(__dirname, '../../user-memory.json');
    this.conversationHistory = this.loadConversationHistory();
    this.userProfile = this.loadUserProfile();
    this.maxHistoryLength = 100; // Keep last 100 conversations
    
    // Analyze all conversation history to build comprehensive user profile
    this.analyzeConversationHistory();
  }

  loadConversationHistory() {
    try {
      if (fs.existsSync(this.conversationFile)) {
        const data = fs.readFileSync(this.conversationFile, 'utf8');
        const parsed = JSON.parse(data);
        console.log('[MEMORY] Loaded conversation history:', parsed.length, 'conversations');
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('[MEMORY] Error loading conversation history:', error);
    }
    console.log('[MEMORY] No existing conversation history found, starting fresh');
    return [];
  }

  loadUserProfile() {
    try {
      if (fs.existsSync(this.userProfileFile)) {
        const data = fs.readFileSync(this.userProfileFile, 'utf8');
        const profile = JSON.parse(data);
        console.log('[MEMORY] Loaded user profile');
        return profile;
      }
    } catch (error) {
      console.error('[MEMORY] Error loading user profile:', error);
    }
    
    // Return default profile structure
    return {
      personal: {
        name: null,
        email: null,
        phone: null,
        location: null,
        age: null
      },
      professional: {
        currentRole: null,
        company: null,
        industry: null,
        yearsOfExperience: null,
        education: null,
        certifications: []
      },
      skills: [],
      experiences: [],
      preferences: {
        learningStyle: 'balanced',
        communicationStyle: 'professional',
        preferredTopics: [],
        avoidTopics: []
      },
      patterns: {
        frequentlyUsedApps: [],
        commonTasks: [],
        workSchedule: null,
        timezone: null
      },
      metadata: {
        totalInteractions: 0,
        firstInteraction: new Date().toISOString(),
        lastInteraction: new Date().toISOString(),
        profileConfidence: 0.0,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  saveConversationHistory() {
    try {
      fs.writeFileSync(this.conversationFile, JSON.stringify(this.conversationHistory, null, 2));
      console.log('[MEMORY] Saved conversation history successfully');
    } catch (error) {
      console.error('[MEMORY] Error saving conversation history:', error);
    }
  }

  saveUserProfile() {
    try {
      this.userProfile.metadata.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.userProfileFile, JSON.stringify(this.userProfile, null, 2));
      console.log('[MEMORY] Saved user profile successfully');
    } catch (error) {
      console.error('[MEMORY] Error saving user profile:', error);
    }
  }

  // Extract facts from text using regex patterns
  extractFacts(text) {
    const facts = [];
    
    // Extract name patterns
    const namePatterns = [
      /(?:my name is|i'm|i am|call me)\s+([a-zA-Z]+)/gi,
      /(?:name:)\s*([a-zA-Z\s]+)/gi
    ];
    
    namePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        facts.push({ type: 'name', value: match[1].trim(), confidence: 0.9 });
      }
    });

    // Extract email patterns
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const emailMatches = text.matchAll(emailPattern);
    for (const match of emailMatches) {
      facts.push({ type: 'email', value: match[1], confidence: 0.95 });
    }

    // Extract phone patterns
    const phonePattern = /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/gi;
    const phoneMatches = text.matchAll(phonePattern);
    for (const match of phoneMatches) {
      facts.push({ type: 'phone', value: match[1], confidence: 0.8 });
    }

    // Extract company/role patterns
    const rolePatterns = [
      /(?:work at|employed at|company:)\s*([a-zA-Z\s&]+)/gi,
      /(?:role|position|job):\s*([a-zA-Z\s]+)/gi,
      /(?:i'm a|i am a)\s+([a-zA-Z\s]+)/gi
    ];
    
    rolePatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        facts.push({ type: 'company', value: match[1].trim(), confidence: 0.8 });
      }
    });

    // Extract skills
    const skillsPattern = /(?:skills?:|proficient in|experience with)\s*([a-zA-Z,\s]+)/gi;
    const skillsMatches = text.matchAll(skillsPattern);
    for (const match of skillsMatches) {
      const skills = match[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
      skills.forEach(skill => {
        facts.push({ type: 'skill', value: skill, confidence: 0.7 });
      });
    }

    // Extract education
    const educationPattern = /(?:education|degree|university|college):\s*([a-zA-Z\s]+)/gi;
    const educationMatches = text.matchAll(educationPattern);
    for (const match of educationMatches) {
      facts.push({ type: 'education', value: match[1].trim(), confidence: 0.8 });
    }

    return facts;
  }

  // Extract user information from text
  extractUserInfoFromText(text) {
    const facts = this.extractFacts(text);
    const userInfo = {};

    facts.forEach(fact => {
      switch (fact.type) {
        case 'name':
          if (!userInfo.name || fact.confidence > 0.8) {
            userInfo.name = fact.value;
          }
          break;
        case 'email':
          userInfo.email = fact.value;
          break;
        case 'phone':
          userInfo.phone = fact.value;
          break;
        case 'company':
          userInfo.company = fact.value;
          break;
        case 'skill':
          if (!userInfo.skills) userInfo.skills = [];
          if (!userInfo.skills.includes(fact.value)) {
            userInfo.skills.push(fact.value);
          }
          break;
        case 'education':
          userInfo.education = fact.value;
          break;
      }
    });

    return userInfo;
  }

  // Extract resume information specifically
  extractResumeInfo(text) {
    const resumeInfo = {};
    
    // Extract work experience
    const experiencePattern = /(?:experience|work history):\s*([^.!?]+)/gi;
    const experienceMatches = text.matchAll(experiencePattern);
    for (const match of experienceMatches) {
      if (!resumeInfo.experiences) resumeInfo.experiences = [];
      resumeInfo.experiences.push(match[1].trim());
    }

    // Extract projects
    const projectPattern = /(?:project|achievement):\s*([^.!?]+)/gi;
    const projectMatches = text.matchAll(projectPattern);
    for (const match of projectMatches) {
      if (!resumeInfo.projects) resumeInfo.projects = [];
      resumeInfo.projects.push(match[1].trim());
    }

    // Extract years of experience
    const yearsPattern = /(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?experience/gi;
    const yearsMatches = text.matchAll(yearsPattern);
    for (const match of yearsMatches) {
      resumeInfo.yearsOfExperience = parseInt(match[1]);
      break;
    }

    return resumeInfo;
  }

  // Update user profile with new information
  updateUserProfile(newInfo, context = {}) {
    let updated = false;

    // Update personal information
    if (newInfo.name && (!this.userProfile.personal.name || context.confidence > 0.8)) {
      this.userProfile.personal.name = newInfo.name;
      updated = true;
    }
    if (newInfo.email) {
      this.userProfile.personal.email = newInfo.email;
      updated = true;
    }
    if (newInfo.phone) {
      this.userProfile.personal.phone = newInfo.phone;
      updated = true;
    }

    // Update professional information
    if (newInfo.company) {
      this.userProfile.professional.company = newInfo.company;
      updated = true;
    }
    if (newInfo.education) {
      this.userProfile.professional.education = newInfo.education;
      updated = true;
    }
    if (newInfo.gpa) {
      this.userProfile.professional.gpa = newInfo.gpa;
      updated = true;
    }
    if (newInfo.yearsOfExperience) {
      this.userProfile.professional.yearsOfExperience = newInfo.yearsOfExperience;
      updated = true;
    }

    // Update skills
    if (newInfo.skills && Array.isArray(newInfo.skills)) {
      newInfo.skills.forEach(skill => {
        if (!this.userProfile.skills.includes(skill)) {
          this.userProfile.skills.push(skill);
          updated = true;
        }
      });
    }

    // Update experiences
    if (newInfo.experiences && Array.isArray(newInfo.experiences)) {
      newInfo.experiences.forEach(experience => {
        if (!this.userProfile.experiences.includes(experience)) {
          this.userProfile.experiences.push(experience);
          updated = true;
        }
      });
    }

    // Update learning style
    if (newInfo.learningStyle) {
      this.userProfile.preferences.learningStyle = newInfo.learningStyle;
      updated = true;
    }

    // Update career interests
    if (newInfo.careerInterests && Array.isArray(newInfo.careerInterests)) {
      if (!this.userProfile.preferences.careerInterests) {
        this.userProfile.preferences.careerInterests = [];
      }
      newInfo.careerInterests.forEach(interest => {
        if (!this.userProfile.preferences.careerInterests.includes(interest)) {
          this.userProfile.preferences.careerInterests.push(interest);
          updated = true;
        }
      });
    }

    // Update metadata
    this.userProfile.metadata.totalInteractions++;
    this.userProfile.metadata.lastInteraction = new Date().toISOString();
    
    if (updated) {
      this.saveUserProfile();
      console.log('[MEMORY] User profile updated with new information');
    }

    return updated;
  }

  // Add a conversation to history
  addConversation(userMessage, aiResponse) {
    if (!userMessage || !aiResponse) {
      console.warn('[MEMORY] Skipping conversation - missing user message or AI response');
      return;
    }

    const conversation = {
      timestamp: new Date().toISOString(),
      user: userMessage,
      ai: aiResponse
    };

    this.conversationHistory.push(conversation);

    // Keep only the last maxHistoryLength conversations
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }

    this.saveConversationHistory();
    console.log('[MEMORY] Added conversation to history. Total conversations:', this.conversationHistory.length);
  }

  // Add conversation to history with screen capture context
  addConversationToHistory(userMessage, aiResponse, screenCapture = null) {
    this.addConversation(userMessage, aiResponse);
    
    // Extract information from the conversation
    const extractedInfo = this.extractUserInfoFromText(userMessage + ' ' + aiResponse);
    if (Object.keys(extractedInfo).length > 0) {
      this.updateUserProfile(extractedInfo, { topic: userMessage, confidence: 0.7 });
    }
  }

  // Analyze learning style from conversation
  analyzeLearningStyle(userMessage, aiResponse) {
    const text = (userMessage + ' ' + aiResponse).toLowerCase();
    
    if (text.includes('visual') || text.includes('diagram') || text.includes('chart') || text.includes('picture')) {
      this.userProfile.preferences.learningStyle = 'visual';
    } else if (text.includes('audio') || text.includes('listen') || text.includes('hear')) {
      this.userProfile.preferences.learningStyle = 'auditory';
    } else if (text.includes('practice') || text.includes('hands-on') || text.includes('do it')) {
      this.userProfile.preferences.learningStyle = 'kinesthetic';
    }
    
    this.saveUserProfile();
  }

  // Generate comprehensive memory context
  generateMemoryContext(query = '') {
    let context = '';

    // Add user profile information
    if (this.userProfile.personal.name) {
      context += `🧠 USER PROFILE:\n`;
      context += `Name: ${this.userProfile.personal.name}\n`;
      
      if (this.userProfile.professional.education) {
        context += `Education: ${this.userProfile.professional.education}\n`;
      }
      if (this.userProfile.professional.gpa) {
        context += `GPA: ${this.userProfile.professional.gpa}\n`;
      }
      if (this.userProfile.professional.currentRole) {
        context += `Current Role: ${this.userProfile.professional.currentRole}\n`;
      }
      if (this.userProfile.professional.company) {
        context += `Company: ${this.userProfile.professional.company}\n`;
      }
      if (this.userProfile.professional.yearsOfExperience) {
        context += `Years of Experience: ${this.userProfile.professional.yearsOfExperience}\n`;
      }
      if (this.userProfile.skills.length > 0) {
        context += `Skills: ${this.userProfile.skills.join(', ')}\n`;
      }
      if (this.userProfile.experiences.length > 0) {
        context += `Key Experiences: ${this.userProfile.experiences.slice(0, 3).join('; ')}\n`;
      }
      if (this.userProfile.preferences.careerInterests && this.userProfile.preferences.careerInterests.length > 0) {
        context += `Career Interests: ${this.userProfile.preferences.careerInterests.join(', ')}\n`;
      }
      context += `Learning Style: ${this.userProfile.preferences.learningStyle}\n`;
      context += `Total Interactions: ${this.userProfile.metadata.totalInteractions}\n\n`;
    }

    // Add recent conversation history
    if (this.conversationHistory.length > 0) {
      const recentConversations = this.conversationHistory.slice(-3);
      context += `📝 RECENT CONVERSATION HISTORY:\n\n`;
      
      recentConversations.forEach((conv, index) => {
        if (conv.user && conv.ai) {
          context += `Conversation ${index + 1}:\n`;
          context += `User: ${conv.user.substring(0, 150)}${conv.user.length > 150 ? '...' : ''}\n`;
          context += `AI: ${conv.ai.substring(0, 200)}${conv.ai.length > 200 ? '...' : ''}\n\n`;
        }
      });
    }

    context += `🎯 INSTRUCTIONS: Use this user profile and conversation history to provide highly personalized responses. Reference the user's name, background, skills, and previous conversations when relevant. Tailor your communication style to their learning preferences and professional context.\n\n`;
    
    console.log('[MEMORY] Generated comprehensive context with user profile and conversation history');
    return context;
  }

  // Get user profile
  getUserProfile() {
    return this.userProfile;
  }

  // Get conversation history
  getConversationHistory() {
    return this.conversationHistory;
  }

  // Get memory summary for API endpoint
  getMemorySummary() {
    return {
      totalConversations: this.conversationHistory.length,
      recentConversations: this.conversationHistory.slice(-5),
      userProfile: this.userProfile,
      lastUpdated: this.conversationHistory.length > 0 ? this.conversationHistory[this.conversationHistory.length - 1].timestamp : null
    };
  }

  // Clear all memory
  clearMemory() {
    this.conversationHistory = [];
    this.userProfile = this.loadUserProfile(); // Reset to default
    this.saveConversationHistory();
    this.saveUserProfile();
    console.log('[MEMORY] All memory cleared');
  }

  // Get the last few conversations for quick reference
  getRecentConversations(count = 5) {
    return this.conversationHistory.slice(-count);
  }

  // Analyze entire conversation history to extract user information
  analyzeConversationHistory() {
    if (this.conversationHistory.length === 0) {
      console.log('[MEMORY] No conversation history to analyze');
      return;
    }

    console.log('[MEMORY] Analyzing entire conversation history to build user profile...');
    
    let allText = '';
    let learningStyleHints = [];
    let professionalInfo = [];
    let personalInfo = [];
    let skills = [];
    let experiences = [];

    // Combine all conversations into one text for analysis
    this.conversationHistory.forEach(conv => {
      if (conv.user && conv.ai) {
        allText += ' ' + conv.user + ' ' + conv.ai;
      }
    });

    // Extract comprehensive information from all conversations
    const extractedInfo = this.extractComprehensiveUserInfo(allText);
    
    // Update profile with extracted information
    if (Object.keys(extractedInfo).length > 0) {
      this.updateUserProfile(extractedInfo, { 
        source: 'conversation_history_analysis', 
        confidence: 0.9 
      });
    }

    // Analyze learning style from all conversations
    this.analyzeLearningStyleFromHistory();
    
    console.log('[MEMORY] Completed conversation history analysis');
  }

  // Extract comprehensive user information from text
  extractComprehensiveUserInfo(text) {
    const userInfo = {};
    const lowerText = text.toLowerCase();

    // Extract name patterns (more comprehensive)
    const namePatterns = [
      /(?:my name is|i'm|i am|call me)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/gi,
      /(?:name:)\s*([a-zA-Z\s]+)/gi,
      /(?:i'm|i am)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/gi,
      /(?:this is|from)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/gi
    ];
    
    for (const pattern of namePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const name = match[1].trim();
          if (name.length > 1 && name.length < 50) {
            userInfo.name = name;
            break;
          }
        }
      }
      if (userInfo.name) break;
    }

    // Extract education information
    const educationPatterns = [
      /(?:at|studying at|student at|attending)\s+([a-zA-Z\s&]+(?:university|college|school))/gi,
      /(?:brown university|harvard|stanford|mit|yale|princeton|columbia|upenn|dartmouth|cornell)/gi,
      /(?:bachelor|master|phd|degree)\s+(?:of|in)\s+([a-zA-Z\s]+)/gi,
      /(?:gpa|grade point average)\s*(?:of|:)?\s*(\d+\.?\d*)/gi
    ];

    for (const pattern of educationPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          if (pattern.source.includes('gpa')) {
            userInfo.gpa = match[1];
          } else {
            userInfo.education = match[1].trim();
          }
        }
      }
    }

    // Extract work experience
    const workPatterns = [
      /(?:at|worked at|work at|employed at|intern at)\s+([a-zA-Z\s&]+(?:capital|bank|company|inc|corp|llc))/gi,
      /(?:wells fargo|mckinsey|bain|bcg|goldman sachs|morgan stanley|jpmorgan|blackrock|avalerian)/gi,
      /(?:united nations|un academic impact|millennium fellow)/gi,
      /(?:sophomore discovery fellow|private equity analyst|president of)/gi
    ];

    for (const pattern of workPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (!userInfo.experiences) userInfo.experiences = [];
        const experience = match[1] || match[0];
        if (!userInfo.experiences.includes(experience)) {
          userInfo.experiences.push(experience);
        }
      }
    }

    // Extract skills and interests
    const skillPatterns = [
      /(?:skills?:|proficient in|experience with|good at)\s*([a-zA-Z,\s]+)/gi,
      /(?:data analysis|consulting|investment banking|private equity|research|leadership|teamwork)/gi,
      /(?:mathematics|economics|political science|applied math)/gi,
      /(?:visual learner|learning style|prefer visual)/gi
    ];

    for (const pattern of skillPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (!userInfo.skills) userInfo.skills = [];
        const skill = match[1] || match[0];
        if (!userInfo.skills.includes(skill)) {
          userInfo.skills.push(skill);
        }
      }
    }

    // Extract learning preferences
    if (lowerText.includes('visual learner') || lowerText.includes('visual learning') || 
        lowerText.includes('prefer visual') || lowerText.includes('visual tools')) {
      userInfo.learningStyle = 'visual';
    }

    // Extract career interests
    if (lowerText.includes('consulting') || lowerText.includes('mckinsey') || 
        lowerText.includes('bain') || lowerText.includes('bcg')) {
      if (!userInfo.careerInterests) userInfo.careerInterests = [];
      userInfo.careerInterests.push('consulting');
    }

    if (lowerText.includes('investment banking') || lowerText.includes('private equity') || 
        lowerText.includes('finance')) {
      if (!userInfo.careerInterests) userInfo.careerInterests = [];
      userInfo.careerInterests.push('finance');
    }

    return userInfo;
  }

  // Analyze learning style from entire conversation history
  analyzeLearningStyleFromHistory() {
    let visualCount = 0;
    let auditoryCount = 0;
    let kinestheticCount = 0;

    this.conversationHistory.forEach(conv => {
      const text = (conv.user + ' ' + conv.ai).toLowerCase();
      
      if (text.includes('visual') || text.includes('diagram') || text.includes('chart') || 
          text.includes('picture') || text.includes('see') || text.includes('look')) {
        visualCount++;
      }
      if (text.includes('audio') || text.includes('listen') || text.includes('hear') || 
          text.includes('sound') || text.includes('speak')) {
        auditoryCount++;
      }
      if (text.includes('practice') || text.includes('hands-on') || text.includes('do it') || 
          text.includes('try') || text.includes('experiment')) {
        kinestheticCount++;
      }
    });

    // Determine dominant learning style
    if (visualCount > auditoryCount && visualCount > kinestheticCount) {
      this.userProfile.preferences.learningStyle = 'visual';
    } else if (auditoryCount > visualCount && auditoryCount > kinestheticCount) {
      this.userProfile.preferences.learningStyle = 'auditory';
    } else if (kinestheticCount > visualCount && kinestheticCount > auditoryCount) {
      this.userProfile.preferences.learningStyle = 'kinesthetic';
    }

    this.saveUserProfile();
  }
}

module.exports = MemorySystem; 