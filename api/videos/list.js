const mongoose = require('mongoose');

// MongoDB 연결 캐싱
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI 환경 변수가 설정되지 않았습니다.');
  }

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  cachedDb = mongoose.connection;
  return cachedDb;
}

/**
 * 수집된 영상 목록 조회 API
 * GET /api/videos/list?page=1&limit=20&channelId=xxx&hasSubtitle=true&sortBy=publishedAt&order=desc
 */
module.exports = async (req, res) => {
  try {
    // MongoDB 연결
    await connectToDatabase();

    const Video = require('../../models/Video');

    // 쿼리 파라미터 파싱
    const {
      page = 1,
      limit = 20,
      channelId,
      hasSubtitle,
      subtitleStatus,
      sortBy = 'publishedAt',
      order = 'desc',
      keyword = ''
    } = req.query;

    // 페이지 및 제한 정수 변환
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // 필터 조건 구성
    const filter = {};

    if (channelId) {
      filter.channelId = channelId;
    }

    if (hasSubtitle !== undefined) {
      filter.hasSubtitle = hasSubtitle === 'true';
    }

    if (subtitleStatus) {
      filter.subtitleStatus = subtitleStatus;
    }

    // 기본적으로 자막 없는 영상 제외 (명시적으로 포함하지 않는 한)
    // subtitleStatus 필터가 없고, hasSubtitle 필터도 없을 때만 적용
    const excludeNoSubtitle = req.query.excludeNoSubtitle !== 'false';
    if (excludeNoSubtitle && !subtitleStatus && !hasSubtitle) {
      filter.subtitleStatus = { $ne: 'no_subtitle' };
    }

    if (keyword) {
      filter.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { channelName: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      ];
    }

    // 정렬 조건
    const sortOrder = order === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // 영상 목록 조회
    const [videos, totalCount] = await Promise.all([
      Video.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Video.countDocuments(filter)
    ]);

    // 통계 정보 수집
    const [statistics] = await Video.aggregate([
      {
        $group: {
          _id: null,
          totalVideos: { $sum: 1 },
          videosWithSubtitle: {
            $sum: { $cond: [{ $eq: ['$hasSubtitle', true] }, 1, 0] }
          },
          videosNoSubtitle: {
            $sum: { $cond: [{ $eq: ['$subtitleStatus', 'no_subtitle'] }, 1, 0] }
          },
          videosFailed: {
            $sum: { $cond: [{ $eq: ['$subtitleStatus', 'failed'] }, 1, 0] }
          },
          videosPending: {
            $sum: { $cond: [{ $eq: ['$subtitleStatus', 'pending'] }, 1, 0] }
          },
          totalViews: { $sum: '$viewCount' },
          totalLikes: { $sum: '$likeCount' },
          totalComments: { $sum: '$commentCount' }
        }
      }
    ]);

    // 채널별 통계
    const channelStats = await Video.aggregate([
      {
        $group: {
          _id: '$channelId',
          channelName: { $first: '$channelName' },
          videoCount: { $sum: 1 },
          subtitleCount: {
            $sum: { $cond: [{ $eq: ['$hasSubtitle', true] }, 1, 0] }
          }
        }
      },
      { $sort: { videoCount: -1 } },
      { $limit: 10 }
    ]);

    // 페이지네이션 정보
    const totalPages = Math.ceil(totalCount / limitNum);

    return res.status(200).json({
      success: true,
      data: {
        videos,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        },
        statistics: statistics || {
          totalVideos: 0,
          videosWithSubtitle: 0,
          videosNoSubtitle: 0,
          videosFailed: 0,
          videosPending: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0
        },
        channelStats
      }
    });

  } catch (error) {
    console.error('영상 목록 조회 실패:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
