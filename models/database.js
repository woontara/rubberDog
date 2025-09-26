const mongoose = require('mongoose');
const zlib = require('zlib');

class DatabaseManager {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  // MongoDB Atlas 연결
  async connect(connectionString) {
    try {
      if (!connectionString) {
        // 로컬 개발환경 fallback
        connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/rubberdog';
      }

      await mongoose.connect(connectionString, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 30000,
        connectTimeoutMS: 10000,
      });

      this.isConnected = true;
      console.log('✅ MongoDB Atlas 연결 성공');

      // 연결 상태 모니터링
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB 연결 오류:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB 연결 해제됨');
        this.isConnected = false;
      });

      return true;
    } catch (error) {
      console.error('❌ MongoDB 연결 실패:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  // 연결 상태 확인
  isDbConnected() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  // 데이터베이스 통계 조회
  async getStats() {
    try {
      if (!this.isDbConnected()) return null;

      const stats = await mongoose.connection.db.stats();
      return {
        storageSize: stats.storageSize,
        dataSize: stats.dataSize,
        indexSize: stats.indexSize,
        collections: stats.collections,
        objects: stats.objects,
        // 무료 티어 한계 (512MB = 536,870,912 bytes)
        freeLimit: 536870912,
        usagePercent: Math.round((stats.storageSize / 536870912) * 100)
      };
    } catch (error) {
      console.error('DB 통계 조회 실패:', error);
      return null;
    }
  }
}

// 텍스트 압축 유틸리티
class CompressionUtils {
  // 텍스트 압축 (gzip)
  static compress(text) {
    try {
      const buffer = Buffer.from(text, 'utf8');
      const compressed = zlib.gzipSync(buffer);
      return {
        data: compressed.toString('base64'),
        originalSize: buffer.length,
        compressedSize: compressed.length,
        ratio: Math.round((1 - compressed.length / buffer.length) * 100)
      };
    } catch (error) {
      console.error('압축 실패:', error);
      return { data: text, originalSize: text.length, compressedSize: text.length, ratio: 0 };
    }
  }

  // 텍스트 압축 해제
  static decompress(compressedData) {
    try {
      const buffer = Buffer.from(compressedData, 'base64');
      const decompressed = zlib.gunzipSync(buffer);
      return decompressed.toString('utf8');
    } catch (error) {
      console.error('압축 해제 실패:', error);
      return compressedData; // fallback to original data
    }
  }

  // 압축 필요성 판단 (1KB 이상 텍스트)
  static shouldCompress(text) {
    return typeof text === 'string' && text.length > 1024;
  }
}

// 사용자 스키마
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  salt: { type: String, required: true },
  apiKeys: {
    claude: String,
    youtube: String
  },
  settings: {
    blogGuidelines: String
  },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: Date,
  storageUsed: { type: Number, default: 0 } // bytes
});

// 자막 스키마
const SubtitleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  videoId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  channelName: String,
  duration: String,
  content: {
    raw: String,        // 원본 자막 (압축 가능)
    compressed: String, // 압축된 자막
    isCompressed: { type: Boolean, default: false }
  },
  metadata: {
    language: String,
    wordCount: Number,
    extractedAt: Date
  },
  createdAt: { type: Date, default: Date.now, index: true },
  size: { type: Number, default: 0 } // bytes
});

// 블로그 스키마
const BlogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  videoId: String,
  subtitleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subtitle' },
  title: { type: String, required: true },
  content: {
    raw: String,        // 원본 블로그 (압축 가능)
    compressed: String, // 압축된 블로그
    isCompressed: { type: Boolean, default: false }
  },
  tags: [String],
  metadata: {
    wordCount: Number,
    generatedAt: Date,
    prompt: String
  },
  createdAt: { type: Date, default: Date.now, index: true },
  size: { type: Number, default: 0 } // bytes
});

// 사용량 추적을 위한 미들웨어
SubtitleSchema.pre('save', function(next) {
  if (this.content.raw) {
    this.size = Buffer.byteLength(this.content.raw || '', 'utf8');
  }
  next();
});

BlogSchema.pre('save', function(next) {
  if (this.content.raw) {
    this.size = Buffer.byteLength(this.content.raw || '', 'utf8');
  }
  next();
});

// 텍스트 검색을 위한 인덱스
SubtitleSchema.index({
  title: 'text',
  'content.raw': 'text',
  channelName: 'text'
});

BlogSchema.index({
  title: 'text',
  'content.raw': 'text',
  tags: 'text'
});

// 모델 생성
const User = mongoose.model('User', UserSchema);
const Subtitle = mongoose.model('Subtitle', SubtitleSchema);
const Blog = mongoose.model('Blog', BlogSchema);

module.exports = {
  DatabaseManager,
  CompressionUtils,
  User,
  Subtitle,
  Blog
};