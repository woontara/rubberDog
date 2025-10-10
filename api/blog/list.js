const mongoose = require('mongoose');

// MongoDB 연결 캐싱
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI 환경변수가 설정되지 않았습니다.');
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    cachedDb = mongoose.connection;
    return cachedDb;

  } catch (error) {
    console.error('❌ MongoDB 연결 실패:', error);
    throw error;
  }
}

/**
 * 블로그 글 목록 조회 API
 * GET /api/blog/list
 */
module.exports = async (req, res) => {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // MongoDB 연결
    await connectToDatabase();

    const BlogPost = require('../../models/BlogPost');

    // 쿼리 파라미터
    const {
      page = 1,
      limit = 12,
      sortBy = 'createdAt',
      order = 'desc',
      keyword,
      blogPostId
    } = req.query;

    // 특정 블로그 글 조회
    if (blogPostId) {
      const blogPost = await BlogPost.findById(blogPostId).lean();

      if (!blogPost) {
        return res.status(404).json({
          success: false,
          error: '블로그 글을 찾을 수 없습니다.'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          blogPost: blogPost
        }
      });
    }

    // 필터 조건 구성
    const filter = {};

    if (keyword) {
      filter.$or = [
        { videoTitle: { $regex: keyword, $options: 'i' } },
        { channelName: { $regex: keyword, $options: 'i' } },
        { blogContent: { $regex: keyword, $options: 'i' } }
      ];
    }

    // 정렬 옵션
    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    // 페이지네이션
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 데이터 조회
    const [blogPosts, total] = await Promise.all([
      BlogPost.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      BlogPost.countDocuments(filter)
    ]);

    // 통계 정보
    const stats = await BlogPost.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalInputTokens: { $sum: '$usage.inputTokens' },
          totalOutputTokens: { $sum: '$usage.outputTokens' }
        }
      }
    ]);

    const statistics = stats.length > 0 ? stats[0] : {
      totalPosts: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0
    };

    // 응답
    return res.status(200).json({
      success: true,
      data: {
        blogPosts: blogPosts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / parseInt(limit))
        },
        statistics: {
          totalPosts: statistics.totalPosts,
          totalInputTokens: statistics.totalInputTokens,
          totalOutputTokens: statistics.totalOutputTokens,
          totalTokens: statistics.totalInputTokens + statistics.totalOutputTokens
        }
      }
    });

  } catch (error) {
    console.error('❌ 블로그 목록 조회 오류:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    });
  }
};
