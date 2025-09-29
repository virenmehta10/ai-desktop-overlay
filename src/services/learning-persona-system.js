const fs = require('fs');
const path = require('path');

class LearningPersonaSystem {
  constructor() {
    this.personaFile = path.join(__dirname, '../../learning-persona.json');
    this.persona = this.loadPersona();
    this.memorySystem = null; // Will be set by the main server
  }

  setMemorySystem(memorySystem) {
    this.memorySystem = memorySystem;
  }

  loadPersona() {
    try {
      if (fs.existsSync(this.personaFile)) {
        const data = fs.readFileSync(this.personaFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading learning persona:', error);
    }
    
    // Return default persona structure
    return {
      userId: null,
      profile: {
        name: null,
        currentRole: null,
        careerGoals: [],
        learningObjectives: [],
        timeConstraints: null,
        preferredLearningTimes: [],
        stressTriggers: [],
        motivationFactors: []
      },
      learningProfile: {
        primaryLearningStyle: "balanced",
        secondaryLearningStyle: null,
        cognitiveLoadCapacity: "medium",
        attentionSpan: "medium",
        processingSpeed: "medium",
        memoryType: "balanced",
        confidenceLevel: "medium",
        anxietyLevel: "low",
        perfectionism: "medium"
      },
      knowledgeMap: {
        masteredConcepts: [],
        strugglingConcepts: [],
        misconceptions: {},
        knowledgeGaps: [],
        prerequisiteGaps: {},
        crossConnections: {}
      },
      learningPatterns: {
        optimalSessionLength: 45,
        preferredBreakPattern: "pomodoro",
        bestTimeOfDay: "morning",
        focusQuality: "medium",
        retentionRate: 0.7,
        applicationRate: 0.6,
        mistakeRecoveryTime: 5,
        conceptMasteryTime: 30
      },
      mistakeProfile: {
        commonMistakes: {},
        mistakePatterns: {},
        recoveryStrategies: {},
        preventionTechniques: {},
        confidenceImpact: {}
      },
      adaptiveStrategies: {
        difficultyAdjustment: "dynamic",
        contentPresentation: "adaptive",
        feedbackStyle: "constructive",
        encouragementLevel: "moderate",
        challengeLevel: "optimal",
        reviewFrequency: "adaptive"
      },
      lifeContext: {
        currentStressors: [],
        availableTime: "moderate",
        supportSystem: "good",
        careerPhase: "growth",
        personalGoals: [],
        workLifeBalance: "balanced"
      },
      progressMetrics: {
        totalLearningSessions: 0,
        averageSessionLength: 0,
        successRate: 0,
        improvementRate: 0,
        confidenceGrowth: 0,
        knowledgeRetention: 0,
        applicationSuccess: 0,
        mistakeReduction: 0
      },
      sessionHistory: [],
      insights: [],
      recommendations: [],
      lastUpdated: new Date().toISOString()
    };
  }

  savePersona() {
    try {
      this.persona.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.personaFile, JSON.stringify(this.persona, null, 2));
      console.log('🧠 Learning persona saved successfully');
    } catch (error) {
      console.error('Error saving learning persona:', error);
    }
  }

  // Extract information from user interactions
  extractUserInfo(userMessage, aiResponse, screenCapture = null) {
    const insights = [];

    // Extract name and role if mentioned
    const nameMatch = userMessage.match(/(?:my name is|i'm|i am|call me)\s+([a-zA-Z]+)/i);
    if (nameMatch && !this.persona.profile.name) {
      this.persona.profile.name = nameMatch[1];
      insights.push({
        timestamp: new Date().toISOString(),
        type: "profile_update",
        description: `Learned user's name: ${nameMatch[1]}`,
        confidence: 0.9,
        actionable: true
      });
    }

    // Extract current role
    const roleMatch = userMessage.match(/(?:i work as|i'm a|i am a|my role is|current role)\s+([^.!?]+)/i);
    if (roleMatch && !this.persona.profile.currentRole) {
      this.persona.profile.currentRole = roleMatch[1].trim();
      insights.push({
        timestamp: new Date().toISOString(),
        type: "profile_update",
        description: `Learned user's current role: ${roleMatch[1].trim()}`,
        confidence: 0.8,
        actionable: true
      });
    }

    // Detect learning style preferences
    if (userMessage.toLowerCase().includes('visual learner') || userMessage.toLowerCase().includes('visual learning')) {
      this.persona.learningProfile.primaryLearningStyle = "visual";
      insights.push({
        timestamp: new Date().toISOString(),
        type: "learning_style",
        description: "User identified as visual learner",
        confidence: 0.9,
        actionable: true
      });
    }

    // Detect stress or anxiety levels
    if (userMessage.toLowerCase().includes('stress') || userMessage.toLowerCase().includes('anxious') || userMessage.toLowerCase().includes('overwhelmed')) {
      this.persona.learningProfile.anxietyLevel = "medium";
      this.persona.lifeContext.currentStressors.push("learning pressure");
      insights.push({
        timestamp: new Date().toISOString(),
        type: "stress_detection",
        description: "Detected learning-related stress",
        confidence: 0.7,
        actionable: true
      });
    }

    // Detect confidence levels
    if (userMessage.toLowerCase().includes('confident') || userMessage.toLowerCase().includes('sure')) {
      this.persona.learningProfile.confidenceLevel = "high";
    } else if (userMessage.toLowerCase().includes('unsure') || userMessage.toLowerCase().includes('doubt') || userMessage.toLowerCase().includes('not sure')) {
      this.persona.learningProfile.confidenceLevel = "low";
    }

    // Track learning sessions
    if (this.isLearningContext(userMessage)) {
      this.persona.progressMetrics.totalLearningSessions++;
      this.persona.sessionHistory.push({
        timestamp: new Date().toISOString(),
        query: userMessage,
        response: aiResponse,
        sessionType: this.classifySessionType(userMessage)
      });
    }

    // Add insights
    if (insights.length > 0) {
      this.persona.insights.push(...insights);
    }

    this.savePersona();
    return insights;
  }

  isLearningContext(message) {
    const learningKeywords = [
      'learn', 'study', 'understand', 'explain', 'help me with', 'how to',
      'practice', 'review', 'test', 'exam', 'quiz', 'assignment', 'homework',
      'concept', 'theory', 'problem', 'solve', 'figure out', 'get better at'
    ];
    
    return learningKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
  }

  classifySessionType(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('test') || lowerMessage.includes('exam') || lowerMessage.includes('quiz')) {
      return 'assessment';
    } else if (lowerMessage.includes('practice') || lowerMessage.includes('exercise')) {
      return 'practice';
    } else if (lowerMessage.includes('review') || lowerMessage.includes('recap')) {
      return 'review';
    } else if (lowerMessage.includes('explain') || lowerMessage.includes('understand')) {
      return 'concept_learning';
    } else {
      return 'general_learning';
    }
  }

  // Generate personalized learning context for AI responses
  generateLearningContext() {
    let context = '';

    // Add profile information
    if (this.persona.profile.name) {
      context += `User's name: ${this.persona.profile.name}\n`;
    }
    if (this.persona.profile.currentRole) {
      context += `Current role: ${this.persona.profile.currentRole}\n`;
    }

    // Add learning style
    context += `Learning style: ${this.persona.learningProfile.primaryLearningStyle}\n`;
    context += `Confidence level: ${this.persona.learningProfile.confidenceLevel}\n`;
    context += `Anxiety level: ${this.persona.learningProfile.anxietyLevel}\n`;

    // Add recent insights
    const recentInsights = this.persona.insights.slice(-3);
    if (recentInsights.length > 0) {
      context += '\nRecent learning insights:\n';
      recentInsights.forEach(insight => {
        context += `- ${insight.description}\n`;
      });
    }

    // Add learning patterns
    context += `\nOptimal session length: ${this.persona.learningPatterns.optimalSessionLength} minutes\n`;
    context += `Best time of day: ${this.persona.learningPatterns.bestTimeOfDay}\n`;
    context += `Retention rate: ${(this.persona.learningPatterns.retentionRate * 100).toFixed(0)}%\n`;

    // Add adaptive strategies
    context += `\nPreferred feedback style: ${this.persona.adaptiveStrategies.feedbackStyle}\n`;
    context += `Encouragement level: ${this.persona.adaptiveStrategies.encouragementLevel}\n`;
    context += `Challenge level: ${this.persona.adaptiveStrategies.challengeLevel}\n`;

    return context;
  }

  // Get persona summary for API endpoint
  getPersonaSummary() {
    return {
      profile: this.persona.profile,
      learningProfile: this.persona.learningProfile,
      progressMetrics: this.persona.progressMetrics,
      recentInsights: this.persona.insights.slice(-5),
      lastUpdated: this.persona.lastUpdated
    };
  }

  // Update learning patterns based on interaction
  updateLearningPatterns(sessionData) {
    if (sessionData.duration) {
      // Update average session length
      const currentAvg = this.persona.progressMetrics.averageSessionLength;
      const totalSessions = this.persona.progressMetrics.totalLearningSessions;
      this.persona.progressMetrics.averageSessionLength = 
        (currentAvg * (totalSessions - 1) + sessionData.duration) / totalSessions;
    }

    if (sessionData.success !== undefined) {
      // Update success rate
      const currentSuccessRate = this.persona.progressMetrics.successRate;
      const totalSessions = this.persona.progressMetrics.totalLearningSessions;
      this.persona.progressMetrics.successRate = 
        (currentSuccessRate * (totalSessions - 1) + (sessionData.success ? 1 : 0)) / totalSessions;
    }

    this.savePersona();
  }

  // Generate personalized recommendations
  generateRecommendations() {
    const recommendations = [];

    // Based on learning style
    if (this.persona.learningProfile.primaryLearningStyle === 'visual') {
      recommendations.push({
        type: 'learning_style',
        title: 'Visual Learning Enhancement',
        description: 'Since you prefer visual learning, try using diagrams, charts, and visual aids when studying new concepts.',
        priority: 'high'
      });
    }

    // Based on confidence level
    if (this.persona.learningProfile.confidenceLevel === 'low') {
      recommendations.push({
        type: 'confidence_building',
        title: 'Confidence Building',
        description: 'Focus on breaking down complex topics into smaller, manageable chunks to build confidence gradually.',
        priority: 'high'
      });
    }

    // Based on anxiety level
    if (this.persona.learningProfile.anxietyLevel === 'high') {
      recommendations.push({
        type: 'stress_management',
        title: 'Stress Management',
        description: 'Consider taking regular breaks and using relaxation techniques during study sessions.',
        priority: 'medium'
      });
    }

    this.persona.recommendations = recommendations;
    this.savePersona();
    return recommendations;
  }
}

module.exports = LearningPersonaSystem; 