/**
 * Vercel Cron Job API
 * YouTube 채널 자동 수집
 */

const mongoose = require('mongoose');
const ChannelCollector = require('../../services/channelCollector');
const config = require('../../config/scheduler.config');

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
    console.log('✅ MongoDB 연결 성공');
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Vercel Cron Job 인증 확인 (보안)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET이 설정되어 있으면 인증 체크
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('⚠️ 인증 실패: 잘못된 CRON_SECRET');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: '인증이 필요합니다.'
    });
  }

  const startTime = Date.now();

  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 YouTube 채널 자동 수집 Cron Job 시작');
    console.log('📅 실행 시각:', new Date().toLocaleString('ko-KR'));
    console.log('='.repeat(60));

    // MongoDB 연결
    await connectToDatabase();

    // ChannelCollector 인스턴스 생성
    const collector = new ChannelCollector();

    // 오늘 이미 수집된 채널 수 확인
    const todayCount = await collector.getTodayCollectedCount();
    console.log(`📊 오늘 수집된 채널: ${todayCount}개`);

    // 하루 할당량 체크
    const dailyLimit = config.quota.dailyChannelLimit;
    if (todayCount >= dailyLimit) {
      console.log(`⚠️ 오늘 할당량 초과: ${todayCount}/${dailyLimit}`);
      return res.status(200).json({
        success: true,
        message: '오늘 할당량을 이미 달성했습니다.',
        data: {
          todayCollected: todayCount,
          dailyLimit: dailyLimit,
          newCollected: 0
        }
      });
    }

    // 남은 할당량 계산
    const remainingQuota = dailyLimit - todayCount;
    const collectLimit = Math.min(config.quota.perRunLimit, remainingQuota);

    console.log(`🎯 이번 실행 목표: ${collectLimit}개 채널`);
    console.log(`📈 남은 일일 할당량: ${remainingQuota}/${dailyLimit}`);

    // 채널 수집 실행
    const results = await collector.collectChannels(collectLimit);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Cron Job 완료');
    console.log(`⏱️ 총 소요 시간: ${duration}초`);
    console.log('='.repeat(60) + '\n');

    // 성공 응답
    return res.status(200).json({
      success: true,
      message: '채널 수집이 완료되었습니다.',
      data: {
        newCollected: results.saved,
        totalProcessed: results.total,
        duplicates: results.duplicates,
        errors: results.errors,
        todayTotal: todayCount + results.saved,
        dailyLimit: dailyLimit,
        duration: `${duration}초`,
        timestamp: new Date().toISOString(),
        keywordResults: results.keywords
      }
    });

  } catch (error) {
    console.error('❌ Cron Job 실행 중 오류:', error);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 에러 응답
    return res.status(500).json({
      success: false,
      error: 'CRON_ERROR',
      message: error.message,
      data: {
        duration: `${duration}초`,
        timestamp: new Date().toISOString()
      }
    });

  } finally {
    // MongoDB 연결은 유지 (Vercel에서 재사용)
    console.log('ℹ️ MongoDB 연결 유지 (재사용)');
  }
};
