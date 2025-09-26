const { DatabaseManager, CompressionUtils, User, Subtitle, Blog } = require('./database');
const mongoose = require('mongoose');

class MongoStorageManager {
  constructor() {
    this.db = new DatabaseManager();
  }

  // 데이터베이스 연결 확인
  isConnected() {
    return this.db.isDbConnected();
  }

  // 자막 저장 (압축 포함)
  async saveUserSubtitle(userId, subtitleData) {
    try {
      const { content, title, videoId, channelName, duration, metadata = {} } = subtitleData;

      // 텍스트 압축 여부 결정
      const shouldCompress = CompressionUtils.shouldCompress(content);
      let contentData = {
        raw: shouldCompress ? null : content,
        compressed: null,
        isCompressed: shouldCompress
      };

      if (shouldCompress) {
        const compressed = CompressionUtils.compress(content);
        contentData.compressed = compressed.data;
        console.log(`📦 자막 압축: ${compressed.originalSize}B → ${compressed.compressedSize}B (${compressed.ratio}% 절약)`);
      } else {
        contentData.raw = content;
      }

      const subtitle = new Subtitle({
        userId: new mongoose.Types.ObjectId(userId),
        videoId,
        title,
        channelName,
        duration,
        content: contentData,
        metadata: {
          ...metadata,
          language: metadata.language || 'ko',
          wordCount: content ? content.split(/\s+/).length : 0,
          extractedAt: new Date()
        },
        size: Buffer.byteLength(content || '', 'utf8')
      });

      const saved = await subtitle.save();

      // 사용자 스토리지 사용량 업데이트
      await this.updateUserStorageUsage(userId);

      return saved._id.toString();
    } catch (error) {
      console.error('자막 저장 오류:', error);
      return null;
    }
  }

  // 사용자 자막 목록 조회
  async getUserSubtitles(userId, options = {}) {
    try {
      const { page = 1, limit = 20, search = '' } = options;
      const skip = (page - 1) * limit;

      // 검색 조건
      let query = { userId: new mongoose.Types.ObjectId(userId) };
      if (search) {
        query.$text = { $search: search };
      }

      const subtitles = await Subtitle.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-content.compressed') // 압축된 데이터는 제외하고 조회
        .lean();

      // 압축된 내용 복원
      const processedSubtitles = subtitles.map(subtitle => {
        if (subtitle.content.isCompressed && subtitle.content.compressed) {
          // 목록 조회시에는 내용을 자르고 표시
          const decompressed = CompressionUtils.decompress(subtitle.content.compressed);
          subtitle.content.preview = decompressed.substring(0, 200) + '...';
          delete subtitle.content.compressed;
        } else {
          subtitle.content.preview = (subtitle.content.raw || '').substring(0, 200) + '...';
        }
        return subtitle;
      });

      return processedSubtitles;
    } catch (error) {
      console.error('사용자 자막 조회 오류:', error);
      return [];
    }
  }

  // 특정 자막 내용 조회 (전체 내용)
  async getSubtitleContent(userId, subtitleId) {
    try {
      const subtitle = await Subtitle.findOne({
        _id: new mongoose.Types.ObjectId(subtitleId),
        userId: new mongoose.Types.ObjectId(userId)
      }).lean();

      if (!subtitle) {
        return null;
      }

      // 압축된 내용 복원
      if (subtitle.content.isCompressed && subtitle.content.compressed) {
        subtitle.content.raw = CompressionUtils.decompress(subtitle.content.compressed);
        delete subtitle.content.compressed;
      }

      return subtitle;
    } catch (error) {
      console.error('자막 내용 조회 오류:', error);
      return null;
    }
  }

  // 블로그 저장 (압축 포함)
  async saveUserBlog(userId, blogData) {
    try {
      const { content, title, videoId, subtitleId, tags = [], metadata = {} } = blogData;

      // 텍스트 압축 여부 결정
      const shouldCompress = CompressionUtils.shouldCompress(content);
      let contentData = {
        raw: shouldCompress ? null : content,
        compressed: null,
        isCompressed: shouldCompress
      };

      if (shouldCompress) {
        const compressed = CompressionUtils.compress(content);
        contentData.compressed = compressed.data;
        console.log(`📦 블로그 압축: ${compressed.originalSize}B → ${compressed.compressedSize}B (${compressed.ratio}% 절약)`);
      } else {
        contentData.raw = content;
      }

      const blog = new Blog({
        userId: new mongoose.Types.ObjectId(userId),
        videoId,
        subtitleId: subtitleId ? new mongoose.Types.ObjectId(subtitleId) : null,
        title,
        content: contentData,
        tags,
        metadata: {
          ...metadata,
          wordCount: content ? content.split(/\s+/).length : 0,
          generatedAt: new Date()
        },
        size: Buffer.byteLength(content || '', 'utf8')
      });

      const saved = await blog.save();

      // 사용자 스토리지 사용량 업데이트
      await this.updateUserStorageUsage(userId);

      return saved._id.toString();
    } catch (error) {
      console.error('블로그 저장 오류:', error);
      return null;
    }
  }

  // 사용자 블로그 목록 조회
  async getUserBlogs(userId, options = {}) {
    try {
      const { page = 1, limit = 20, search = '' } = options;
      const skip = (page - 1) * limit;

      // 검색 조건
      let query = { userId: new mongoose.Types.ObjectId(userId) };
      if (search) {
        query.$text = { $search: search };
      }

      const blogs = await Blog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-content.compressed') // 압축된 데이터는 제외하고 조회
        .lean();

      // 압축된 내용 복원
      const processedBlogs = blogs.map(blog => {
        if (blog.content.isCompressed && blog.content.compressed) {
          // 목록 조회시에는 내용을 자르고 표시
          const decompressed = CompressionUtils.decompress(blog.content.compressed);
          blog.content.preview = decompressed.substring(0, 300) + '...';
          delete blog.content.compressed;
        } else {
          blog.content.preview = (blog.content.raw || '').substring(0, 300) + '...';
        }
        return blog;
      });

      return processedBlogs;
    } catch (error) {
      console.error('사용자 블로그 조회 오류:', error);
      return [];
    }
  }

  // 특정 블로그 내용 조회 (전체 내용)
  async getBlogContent(userId, blogId) {
    try {
      const blog = await Blog.findOne({
        _id: new mongoose.Types.ObjectId(blogId),
        userId: new mongoose.Types.ObjectId(userId)
      }).lean();

      if (!blog) {
        return null;
      }

      // 압축된 내용 복원
      if (blog.content.isCompressed && blog.content.compressed) {
        blog.content.raw = CompressionUtils.decompress(blog.content.compressed);
        delete blog.content.compressed;
      }

      return blog;
    } catch (error) {
      console.error('블로그 내용 조회 오류:', error);
      return null;
    }
  }

  // 자막 삭제
  async deleteUserSubtitle(userId, subtitleId) {
    try {
      const result = await Subtitle.deleteOne({
        _id: new mongoose.Types.ObjectId(subtitleId),
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (result.deletedCount > 0) {
        // 사용자 스토리지 사용량 업데이트
        await this.updateUserStorageUsage(userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('자막 삭제 오류:', error);
      return false;
    }
  }

  // 블로그 삭제
  async deleteUserBlog(userId, blogId) {
    try {
      const result = await Blog.deleteOne({
        _id: new mongoose.Types.ObjectId(blogId),
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (result.deletedCount > 0) {
        // 사용자 스토리지 사용량 업데이트
        await this.updateUserStorageUsage(userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('블로그 삭제 오류:', error);
      return false;
    }
  }

  // 사용자 스토리지 통계
  async getUserStorageStats(userId) {
    try {
      const subtitles = await Subtitle.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
      const blogs = await Blog.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });

      // 스토리지 사용량 계산
      const subtitleSize = await Subtitle.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalSize: { $sum: '$size' } } }
      ]);

      const blogSize = await Blog.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalSize: { $sum: '$size' } } }
      ]);

      const totalSize = (subtitleSize[0]?.totalSize || 0) + (blogSize[0]?.totalSize || 0);

      return {
        subtitleCount: subtitles,
        blogCount: blogs,
        totalItems: subtitles + blogs,
        storageUsed: totalSize,
        storageLimit: 536870912, // 512MB in bytes
        storagePercent: Math.round((totalSize / 536870912) * 100)
      };
    } catch (error) {
      console.error('스토리지 통계 조회 오류:', error);
      return { subtitleCount: 0, blogCount: 0, totalItems: 0, storageUsed: 0, storageLimit: 536870912, storagePercent: 0 };
    }
  }

  // 사용자 스토리지 사용량 업데이트
  async updateUserStorageUsage(userId) {
    try {
      const stats = await this.getUserStorageStats(userId);
      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $set: { storageUsed: stats.storageUsed } }
      );
      return stats.storageUsed;
    } catch (error) {
      console.error('스토리지 사용량 업데이트 오류:', error);
      return 0;
    }
  }

  // 전체 검색 (자막 + 블로그)
  async searchUserContent(userId, searchTerm, options = {}) {
    try {
      const { limit = 10 } = options;

      // 자막 검색
      const subtitles = await Subtitle.find({
        userId: new mongoose.Types.ObjectId(userId),
        $text: { $search: searchTerm }
      })
      .limit(limit / 2)
      .select('title videoId createdAt content.raw')
      .lean();

      // 블로그 검색
      const blogs = await Blog.find({
        userId: new mongoose.Types.ObjectId(userId),
        $text: { $search: searchTerm }
      })
      .limit(limit / 2)
      .select('title videoId createdAt content.raw tags')
      .lean();

      return {
        subtitles: subtitles.map(s => ({ ...s, type: 'subtitle' })),
        blogs: blogs.map(b => ({ ...b, type: 'blog' })),
        total: subtitles.length + blogs.length
      };
    } catch (error) {
      console.error('컨텐츠 검색 오류:', error);
      return { subtitles: [], blogs: [], total: 0 };
    }
  }
}

module.exports = MongoStorageManager;