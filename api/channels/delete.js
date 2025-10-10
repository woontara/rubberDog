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
 * 채널 삭제 API
 * DELETE /api/channels/delete
 * Body: { channelId: string }
 */
module.exports = async (req, res) => {
  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // MongoDB 연결
    await connectToDatabase();

    const Channel = require('../../models/Channel');
    const Video = require('../../models/Video');
    const { channelId } = req.body;

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: '채널 ID가 필요합니다.'
      });
    }

    // 채널 존재 확인
    const channel = await Channel.findOne({ channelId });
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: '채널을 찾을 수 없습니다.'
      });
    }

    // 관련된 모든 영상 삭제
    const deletedVideos = await Video.deleteMany({ channelId });

    // 채널 삭제
    await Channel.deleteOne({ channelId });

    console.log(`✅ 채널 삭제 완료: ${channel.channelName}`);
    console.log(`   - 삭제된 영상 수: ${deletedVideos.deletedCount}개`);

    return res.status(200).json({
      success: true,
      message: `채널 "${channel.channelName}"이(가) 삭제되었습니다.`,
      deletedVideos: deletedVideos.deletedCount
    });

  } catch (error) {
    console.error('채널 삭제 실패:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
