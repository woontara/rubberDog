const crypto = require('crypto');

class UserManager {
  constructor() {
    this.users = new Map(); // In production, this would be a database
    this.sessions = new Map();
  }

  // Generate unique user ID
  generateUserId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Hash password with salt
  hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  // Create new user
  createUser(email, password, name) {
    // Check if user already exists
    for (const user of this.users.values()) {
      if (user.email === email) {
        throw new Error('사용자가 이미 존재합니다');
      }
    }

    const userId = this.generateUserId();
    const salt = crypto.randomBytes(32).toString('hex');
    const hashedPassword = this.hashPassword(password, salt);

    const user = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      salt,
      createdAt: new Date().toISOString(),
      apiKeys: {
        claude: null,
        youtube: null
      },
      settings: {
        blogGuidelines: ''
      }
    };

    this.users.set(userId, user);
    return { id: userId, email, name, createdAt: user.createdAt };
  }

  // Authenticate user
  authenticateUser(email, password) {
    for (const user of this.users.values()) {
      if (user.email === email) {
        const hashedPassword = this.hashPassword(password, user.salt);
        if (hashedPassword === user.password) {
          return { id: user.id, email: user.email, name: user.name };
        }
      }
    }
    return null;
  }

  // Get user by ID
  getUserById(userId) {
    const user = this.users.get(userId);
    if (user) {
      const { password, salt, ...publicUser } = user;
      return publicUser;
    }
    return null;
  }

  // Update user API keys
  updateUserApiKeys(userId, apiKeys) {
    const user = this.users.get(userId);
    if (user) {
      user.apiKeys = { ...user.apiKeys, ...apiKeys };
      return true;
    }
    return false;
  }

  // Update user settings
  updateUserSettings(userId, settings) {
    const user = this.users.get(userId);
    if (user) {
      user.settings = { ...user.settings, ...settings };
      return true;
    }
    return false;
  }

  // Create session
  createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  // Validate session
  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      return session.userId;
    }
    return null;
  }

  // Remove session
  removeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  // Clean expired sessions
  cleanExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Extend session (for active users)
  extendSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      session.expiresAt = Date.now() + (24 * 60 * 60 * 1000); // Extend by 24 hours
      return true;
    }
    return false;
  }

  // Get user sessions count
  getUserSessionCount(userId) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        count++;
      }
    }
    return count;
  }

  // Cleanup user sessions (for logout all devices)
  cleanupUserSessions(userId) {
    const sessionsToDelete = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        sessionsToDelete.push(sessionId);
      }
    }
    sessionsToDelete.forEach(sessionId => this.sessions.delete(sessionId));
    return sessionsToDelete.length;
  }

  // Start session cleanup interval
  startSessionCleanup() {
    // Clean expired sessions every hour
    setInterval(() => {
      this.cleanExpiredSessions();
    }, 60 * 60 * 1000);
  }
}

module.exports = new UserManager();