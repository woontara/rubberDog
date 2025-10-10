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
 * 채널 우선순위 업데이트 API
 * POST /api/channels/update-priority
 * Body: { priorities: [{ channelId: string, priority: number }] }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // MongoDB 연결
    await connectToDatabase();

    const Channel = require('../../models/Channel');
    const { priorities } = req.body;

    if (!priorities || !Array.isArray(priorities)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 요청입니다.'
      });
    }

    // 각 채널의 우선순위 업데이트
    const updatePromises = priorities.map(({ channelId, priority }) => {
      return Channel.updateOne(
        { channelId },
        { $set: { priority } }
      );
    });

    await Promise.all(updatePromises);

    console.log(`✅ ${priorities.length}개 채널의 우선순위가 업데이트되었습니다.`);

    return res.status(200).json({
      success: true,
      message: `${priorities.length}개 채널의 우선순위가 업데이트되었습니다.`
    });

  } catch (error) {
    console.error('우선순위 업데이트 실패:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
