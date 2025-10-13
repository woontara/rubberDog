const mongoose = require('mongoose');
const Video = require('../../models/Video');

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
 * 수집 실패한 영상 일괄 삭제 API
 * DELETE /api/videos/delete-failed
 */
module.exports = async (req, res) => {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // MongoDB 연결
    await connectToDatabase();

    console.log('🔍 수집 실패한 영상 검색 시작...');

    // 수집 실패한 영상 조회
    const failedVideos = await Video.find({
      subtitleStatus: 'failed'
    }).lean();

    console.log(`📊 ${failedVideos.length}개의 수집 실패 영상 발견`);

    if (failedVideos.length === 0) {
      return res.status(200).json({
        success: true,
        message: '수집 실패한 영상이 없습니다.',
        deletedCount: 0
      });
    }

    // 일괄 삭제
    const deleteResult = await Video.deleteMany({
      subtitleStatus: 'failed'
    });

    console.log(`✅ ${deleteResult.deletedCount}개 수집 실패 영상 삭제 완료`);

    // 삭제된 영상 목록 (최대 10개만 표시)
    const deletedList = failedVideos.slice(0, 10).map(v => ({
      videoId: v.videoId,
      title: v.title,
      channelName: v.channelName
    }));

    return res.status(200).json({
      success: true,
      message: `${deleteResult.deletedCount}개의 수집 실패 영상이 삭제되었습니다.`,
      deletedCount: deleteResult.deletedCount,
      deletedSamples: deletedList
    });

  } catch (error) {
    console.error('❌ 수집 실패 영상 삭제 오류:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    });
  }
};
