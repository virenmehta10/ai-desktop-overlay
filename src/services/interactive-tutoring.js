class InteractiveTutoringService {
  constructor() {
    this.activeSessions = new Map(); // sessionId -> sessionData
    this.sessionCounter = 0;
  }

  createSession(userId, questionType, initialContext) {
    const sessionId = `tutoring_${Date.now()}_${this.sessionCounter++}`;
    
    const session = {
      id: sessionId,
      userId: userId,
      questionType: questionType,
      currentStep: 1,
      totalSteps: 10,
      context: initialContext,
      userResponses: [],
      understandingCheckpoints: [],
      startTime: new Date(),
      lastActivity: new Date(),
      status: 'active'
    };

    this.activeSessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.lastActivity = new Date();
    }
    return session;
  }

  addUserResponse(sessionId, step, response, understandingLevel) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.userResponses.push({
        step: step,
        response: response,
        understandingLevel: understandingLevel,
        timestamp: new Date()
      });
      
      // Update understanding checkpoint
      session.understandingCheckpoints.push({
        step: step,
        level: understandingLevel,
        timestamp: new Date()
      });
    }
  }

  getNextStep(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      return session.currentStep + 1;
    }
    return 1;
  }

  advanceStep(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session && session.currentStep < session.totalSteps) {
      session.currentStep++;
      session.lastActivity = new Date();
      return session.currentStep;
    }
    return null;
  }

  getSessionProgress(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      return {
        currentStep: session.currentStep,
        totalSteps: session.totalSteps,
        progress: (session.currentStep / session.totalSteps) * 100,
        understandingLevel: this.calculateOverallUnderstanding(sessionId)
      };
    }
    return null;
  }

  calculateOverallUnderstanding(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session && session.understandingCheckpoints.length > 0) {
      const levels = session.understandingCheckpoints.map(cp => cp.level);
      const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
      return Math.round(average * 100) / 100;
    }
    return 0;
  }

  isSessionActive(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    
    // Check if session is still active (within 30 minutes of last activity)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return session.lastActivity > thirtyMinutesAgo && session.status === 'active';
  }

  endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endTime = new Date();
      return session;
    }
    return null;
  }

  getSessionSummary(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      return {
        id: session.id,
        questionType: session.questionType,
        totalSteps: session.totalSteps,
        completedSteps: session.currentStep,
        understandingLevel: this.calculateOverallUnderstanding(sessionId),
        duration: session.endTime ? 
          (session.endTime - session.startTime) / 1000 / 60 : // minutes
          (new Date() - session.startTime) / 1000 / 60,
        userResponses: session.userResponses.length,
        status: session.status
      };
    }
    return null;
  }

  // Clean up old sessions
  cleanupOldSessions() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.lastActivity < oneHourAgo) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  // Get all active sessions for a user
  getUserSessions(userId) {
    const userSessions = [];
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId === userId && this.isSessionActive(sessionId)) {
        userSessions.push({
          sessionId: sessionId,
          ...this.getSessionSummary(sessionId)
        });
      }
    }
    return userSessions;
  }
}

module.exports = InteractiveTutoringService; 