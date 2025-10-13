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
 * 영상 삭제 API
 * DELETE /api/videos/delete
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

    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'videoId가 필요합니다.'
      });
    }

    // 영상 존재 확인
    const video = await Video.findOne({ videoId });

    if (!video) {
      return res.status(404).json({
        success: false,
        error: '영상을 찾을 수 없습니다.'
      });
    }

    // 영상 삭제
    await Video.deleteOne({ videoId });

    console.log(`✅ 영상 삭제 완료: ${video.title} (${videoId})`);

    return res.status(200).json({
      success: true,
      message: '영상이 삭제되었습니다.',
      deletedVideo: {
        videoId: video.videoId,
        title: video.title,
        channelName: video.channelName
      }
    });

  } catch (error) {
    console.error('❌ 영상 삭제 오류:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    });
  }
};
