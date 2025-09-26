const crypto = require('crypto');
const { DatabaseManager, CompressionUtils, User, Subtitle, Blog } = require('./database');

class MongoUserManager {
  constructor() {
    this.db = new DatabaseManager();
    this.sessions = new Map(); // 세션은 여전히 메모리에 저장 (빠른 액세스)
  }

  // 데이터베이스 연결
  async connect(connectionString) {
    return await this.db.connect(connectionString);
  }

  // 연결 상태 확인
  isConnected() {
    return this.db.isDbConnected();
  }

  // 고유 사용자 ID 생성
  generateUserId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // 비밀번호 해싱
  hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  // 사용자 생성
  async createUser(email, password, name) {
    try {
      // 이미 존재하는 사용자 확인
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('사용자가 이미 존재합니다');
      }

      const salt = crypto.randomBytes(32).toString('hex');
      const hashedPassword = this.hashPassword(password, salt);

      const user = new User({
        email,
        name,
        password: hashedPassword,
        salt,
        apiKeys: {
          claude: null,
          youtube: null
        },
        settings: {
          blogGuidelines: ''
        },
        createdAt: new Date(),
        storageUsed: 0
      });

      const savedUser = await user.save();

      // 민감 정보 제외하고 반환
      const { password: _, salt: __, ...publicUser } = savedUser.toObject();
      return publicUser;

    } catch (error) {
      console.error('사용자 생성 오류:', error);
      throw error;
    }
  }

  // 사용자 인증
  async authenticateUser(email, password) {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return null;
      }

      const hashedPassword = this.hashPassword(password, user.salt);
      if (hashedPassword === user.password) {
        // 마지막 로그인 시간 업데이트
        await User.updateOne(
          { _id: user._id },
          { lastLoginAt: new Date() }
        );

        const { password: _, salt: __, ...publicUser } = user.toObject();
        return publicUser;
      }

      return null;
    } catch (error) {
      console.error('사용자 인증 오류:', error);
      return null;
    }
  }

  // 사용자 ID로 조회
  async getUserById(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return null;
      }

      const { password: _, salt: __, ...publicUser } = user.toObject();
      return publicUser;
    } catch (error) {
      console.error('사용자 조회 오류:', error);
      return null;
    }
  }

  // 사용자 API 키 업데이트
  async updateUserApiKeys(userId, apiKeys) {
    try {
      const result = await User.updateOne(
        { _id: userId },
        { $set: { apiKeys: { ...apiKeys } } }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('API 키 업데이트 오류:', error);
      return false;
    }
  }

  // 사용자 설정 업데이트
  async updateUserSettings(userId, settings) {
    try {
      const result = await User.updateOne(
        { _id: userId },
        { $set: { settings: { ...settings } } }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('설정 업데이트 오류:', error);
      return false;
    }
  }

  // 사용자 스토리지 사용량 업데이트
  async updateUserStorageUsage(userId) {
    try {
      // 사용자의 자막과 블로그 크기 합계 계산
      const subtitleSize = await Subtitle.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, totalSize: { $sum: '$size' } } }
      ]);

      const blogSize = await Blog.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, totalSize: { $sum: '$size' } } }
      ]);

      const totalSize = (subtitleSize[0]?.totalSize || 0) + (blogSize[0]?.totalSize || 0);

      await User.updateOne(
        { _id: userId },
        { $set: { storageUsed: totalSize } }
      );

      return totalSize;
    } catch (error) {
      console.error('스토리지 사용량 업데이트 오류:', error);
      return 0;
    }
  }

  // === 세션 관리 (메모리 기반 유지) ===

  // 세션 생성
  createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      userId: userId.toString(), // ObjectId를 문자열로 변환
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24시간
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  // 세션 검증
  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      return session.userId;
    }
    return null;
  }

  // 세션 제거
  removeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  // 만료된 세션 정리
  cleanExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // 세션 연장
  extendSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      session.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
      return true;
    }
    return false;
  }

  // 사용자별 세션 정리
  cleanupUserSessions(userId) {
    const sessionsToDelete = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId.toString()) {
        sessionsToDelete.push(sessionId);
      }
    }
    sessionsToDelete.forEach(sessionId => this.sessions.delete(sessionId));
    return sessionsToDelete.length;
  }

  // 세션 정리 시작
  startSessionCleanup() {
    setInterval(() => {
      this.cleanExpiredSessions();
    }, 60 * 60 * 1000); // 1시간마다
  }

  // 데이터베이스 통계 조회
  async getDatabaseStats() {
    try {
      const stats = await this.db.getStats();
      const userCount = await User.countDocuments();
      const subtitleCount = await Subtitle.countDocuments();
      const blogCount = await Blog.countDocuments();

      return {
        ...stats,
        collections: {
          users: userCount,
          subtitles: subtitleCount,
          blogs: blogCount
        }
      };
    } catch (error) {
      console.error('DB 통계 조회 오류:', error);
      return null;
    }
  }
}

module.exports = MongoUserManager;