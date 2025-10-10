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
 * Vercel Cron Job: 자막 자동 수집
 * 스케줄: 매일 2회 (UTC 00:00, 12:00 = 한국시간 09:00, 21:00)
 */
module.exports = async (req, res) => {
  // Vercel Cron Job 인증 확인
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  try {
    console.log('🎬 자막 수집 Cron Job 시작:', new Date().toISOString());

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
      .sort({ priority: 1, subscriberCount: -1 })  // 우선순위 낮은 숫자부터, 그 다음 구독자 순
      .lean();

    console.log(`📋 총 ${channels.length}개 채널에서 영상 및 자막 수집 시작 (자막 없는 채널 제외)`);

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

    // 각 채널별 영상 및 자막 수집
    for (const channel of channels) {
      try {
        console.log(`\n🎥 채널 처리 중: ${channel.channelName}`);

        // 1. 채널의 모든 영상 수집
        const videos = await collector.getChannelVideos(channel.channelId, channel.channelName);

        // 2. 영상 저장 및 자막 수집
        for (const videoData of videos) {
          // 영상 저장
          const saveResult = await collector.saveVideo(videoData);

          if (saveResult.saved) {
            results.newVideos++;
          } else if (saveResult.updated) {
            results.updatedVideos++;
          }

          results.totalVideos++;

          // 자막 수집 (새 영상이거나 자막이 없는 경우)
          if (saveResult.saved || (!saveResult.video.hasSubtitle && saveResult.video.subtitleStatus === 'pending')) {
            const subtitleResult = await collector.collectSubtitle(videoData.videoId);

            if (subtitleResult.success) {
              // 자막 업데이트
              await saveResult.video.updateSubtitle(subtitleResult);
              results.subtitlesCollected++;
              console.log(`✅ 자막 수집 완료: ${videoData.title}`);
            } else if (subtitleResult.error === 'NO_SUBTITLE') {
              // 자막 없음 처리
              await saveResult.video.markNoSubtitle();
              results.noSubtitle++;
              console.log(`📝 자막 없음: ${videoData.title}`);
            } else {
              // 자막 수집 실패
              await saveResult.video.markSubtitleFailed(subtitleResult.error);
              results.subtitlesFailed++;
              console.log(`❌ 자막 수집 실패: ${videoData.title}`);
            }
          }

          // API 호출 제한을 위한 딜레이
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 채널 자막 통계 업데이트
        const channelDoc = await Channel.findOne({ channelId: channel.channelId });
        if (channelDoc) {
          await channelDoc.updateSubtitleStats();
          console.log(`📊 채널 자막 통계 업데이트: ${channel.channelName}`);
        }

        results.channelsProcessed++;

        // 채널 간 딜레이
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ 채널 처리 실패 (${channel.channelName}):`, error.message);
        results.errors.push({
          channel: channel.channelName,
          error: error.message
        });
      }
    }

    results.endTime = new Date().toISOString();
    results.duration = new Date(results.endTime) - new Date(results.startTime);

    console.log('\n📊 자막 수집 완료 요약:');
    console.log(`⏱️  소요 시간: ${(results.duration / 1000).toFixed(2)}초`);
    console.log(`📺 처리 채널: ${results.channelsProcessed}개`);
    console.log(`🎬 총 영상: ${results.totalVideos}개`);
    console.log(`✨ 신규 영상: ${results.newVideos}개`);
    console.log(`🔄 업데이트: ${results.updatedVideos}개`);
    console.log(`📝 자막 수집: ${results.subtitlesCollected}개`);
    console.log(`🚫 자막 없음: ${results.noSubtitle}개`);
    console.log(`❌ 수집 실패: ${results.subtitlesFailed}개`);

    return res.status(200).json({
      success: true,
      message: '자막 수집이 완료되었습니다.',
      results
    });

  } catch (error) {
    console.error('❌ 자막 수집 Cron Job 실패:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
