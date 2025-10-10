/**
 * 수집된 채널 목록 조회 API
 */

const mongoose = require('mongoose');
const Channel = require('../../models/Channel');

// MongoDB 연결
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
 * Vercel Serverless Function Handler
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

    // 쿼리 파라미터
    const {
      page = 1,
      limit = 20,
      sortBy = 'priority',
      order = 'asc',
      minSubscribers,
      maxSubscribers,
      keyword,
      status
    } = req.query;

    // 필터 조건 구성
    const filter = {};

    if (minSubscribers) {
      filter.subscriberCount = { ...filter.subscriberCount, $gte: parseInt(minSubscribers) };
    }

    if (maxSubscribers) {
      filter.subscriberCount = { ...filter.subscriberCount, $lte: parseInt(maxSubscribers) };
    }

    if (keyword) {
      filter.$or = [
        { channelName: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { searchKeyword: { $regex: keyword, $options: 'i' } }
      ];
    }

    if (status) {
      filter.status = status;
    }

    // 정렬 옵션
    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    // 페이지네이션
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 데이터 조회
    const [channels, total] = await Promise.all([
      Channel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Channel.countDocuments(filter)
    ]);

    // 통계 정보
    const stats = await Channel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalChannels: { $sum: 1 },
          totalSubscribers: { $sum: '$subscriberCount' },
          avgSubscribers: { $avg: '$subscriberCount' },
          totalVideos: { $sum: '$videoCount' },
          totalViews: { $sum: '$viewCount' }
        }
      }
    ]);

    const statistics = stats.length > 0 ? stats[0] : {
      totalChannels: 0,
      totalSubscribers: 0,
      avgSubscribers: 0,
      totalVideos: 0,
      totalViews: 0
    };

    // 응답
    return res.status(200).json({
      success: true,
      data: {
        channels: channels,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / parseInt(limit))
        },
        statistics: {
          totalChannels: statistics.totalChannels,
          totalSubscribers: statistics.totalSubscribers,
          avgSubscribers: Math.round(statistics.avgSubscribers),
          totalVideos: statistics.totalVideos,
          totalViews: statistics.totalViews
        }
      }
    });

  } catch (error) {
    console.error('❌ 채널 목록 조회 오류:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    });
  }
};
