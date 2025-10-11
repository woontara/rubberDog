const mongoose = require('mongoose');
const VideoCollector = require('../../services/videoCollector');

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
 * 수동 자막 수집 트리거 API
 * POST /api/admin/trigger-collection
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    console.log('🎬 수동 자막 수집 시작:', new Date().toISOString());

    // MongoDB 연결
    await connectToDatabase();

    const Channel = require('../../models/Channel');
    const collector = new VideoCollector();

    // 수집된 모든 채널 가져오기 (자막 없는 채널 제외, 우선순위 순)
    const channels = await Channel.find({
      status: 'collected',
      $or: [
        { 'subtitleStats.hasAnySubtitles': null },  // 아직 확인 안된 채널
        { 'subtitleStats.hasAnySubtitles': true }   // 자막 있는 채널
      ]
    })
      .sort({ priority: 1, subscriberCount: -1 })
      .limit(10)  // 수동 실행은 10개 채널로 제한
      .lean();

    console.log(`📋 총 ${channels.length}개 채널에서 영상 및 자막 수집 시작`);

    const results = {
      startTime: new Date().toISOString(),
      channelsProcessed: 0,
      totalVideos: 0,
      newVideos: 0,
      updatedVideos: 0,
      subtitlesCollected: 0,
      noSubtitle: 0,
      subtitlesFailed: 0,
      errors: []
    };

    // 각 채널별 영상 및 자막 수집 (최대 5개 채널만 처리)
    const maxChannels = Math.min(channels.length, 5);

    for (let i = 0; i < maxChannels; i++) {
      const channel = channels[i];

      try {
        console.log(`\n🎥 채널 처리 중 (${i+1}/${maxChannels}): ${channel.channelName}`);

        // 채널의 최근 영상 수집 (최대 10개)
        const collectionResult = await collector.collectVideosFromChannel(
          channel.channelId,
          { maxResults: 10 }
        );

        results.channelsProcessed++;
        results.totalVideos += collectionResult.totalVideos || 0;
        results.newVideos += collectionResult.newVideos || 0;
        results.updatedVideos += collectionResult.updatedVideos || 0;
        results.subtitlesCollected += collectionResult.subtitlesCollected || 0;
        results.noSubtitle += collectionResult.noSubtitle || 0;
        results.subtitlesFailed += collectionResult.subtitlesFailed || 0;

        console.log(`✅ 채널 완료: 영상 ${collectionResult.totalVideos}개, 자막 ${collectionResult.subtitlesCollected}개`);

      } catch (error) {
        console.error(`❌ 채널 처리 실패: ${channel.channelName}`, error);
        results.errors.push({
          channel: channel.channelName,
          error: error.message
        });
      }
    }

    results.endTime = new Date().toISOString();
    results.duration = (new Date(results.endTime) - new Date(results.startTime)) / 1000;

    console.log('\n✅ 수동 자막 수집 완료');
    console.log(`📊 요약: 채널 ${results.channelsProcessed}개, 영상 ${results.totalVideos}개, 자막 ${results.subtitlesCollected}개`);

    return res.status(200).json({
      success: true,
      message: '자막 수집이 완료되었습니다',
      summary: results
    });

  } catch (error) {
    console.error('❌ 수동 자막 수집 오류:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
