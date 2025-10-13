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
 * ISO 8601 duration을 초 단위로 변환
 */
function parseDurationToSeconds(duration) {
  if (!duration) return 0;

  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;

  const hours = parseInt(matches[1] || 0);
  const minutes = parseInt(matches[2] || 0);
  const seconds = parseInt(matches[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * SHORTS 영상 일괄 삭제 API
 * DELETE /api/videos/delete-shorts
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

    console.log('🔍 SHORTS 영상 검색 시작...');

    // 모든 영상 조회
    const allVideos = await Video.find({}).lean();

    // SHORTS 영상 필터링 (60초 이하)
    const shortsVideos = allVideos.filter(video => {
      const seconds = parseDurationToSeconds(video.duration);
      return seconds > 0 && seconds <= 60;
    });

    console.log(`📊 총 ${allVideos.length}개 영상 중 ${shortsVideos.length}개 SHORTS 발견`);

    if (shortsVideos.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'SHORTS 영상이 없습니다.',
        deletedCount: 0
      });
    }

    // SHORTS 영상 ID 추출
    const shortsVideoIds = shortsVideos.map(v => v.videoId);

    // 일괄 삭제
    const deleteResult = await Video.deleteMany({
      videoId: { $in: shortsVideoIds }
    });

    console.log(`✅ ${deleteResult.deletedCount}개 SHORTS 영상 삭제 완료`);

    // 삭제된 영상 목록 (최대 10개만 표시)
    const deletedList = shortsVideos.slice(0, 10).map(v => ({
      videoId: v.videoId,
      title: v.title,
      channelName: v.channelName,
      duration: v.duration,
      seconds: parseDurationToSeconds(v.duration)
    }));

    return res.status(200).json({
      success: true,
      message: `${deleteResult.deletedCount}개의 SHORTS 영상이 삭제되었습니다.`,
      deletedCount: deleteResult.deletedCount,
      totalVideos: allVideos.length,
      deletedSamples: deletedList
    });

  } catch (error) {
    console.error('❌ SHORTS 영상 삭제 오류:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    });
  }
};
