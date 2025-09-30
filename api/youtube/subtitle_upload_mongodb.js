// MongoDB를 활용한 베셀 자막 업로드 API
const { MongoClient } = require('mongodb');

// MongoDB 연결
let db;
let client;

async function connectToMongoDB() {
  if (db) return db;

  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI 환경변수가 설정되지 않았습니다');
    }

    console.log('📦 MongoDB 연결 시도...');
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db('rubberdog');
    console.log('✅ MongoDB 연결 성공');
    return db;
  } catch (error) {
    console.error('❌ MongoDB 연결 실패:', error);
    throw error;
  }
}

// 자막 저장 함수
async function saveSubtitleToMongoDB(videoId, subtitleData) {
  try {
    const database = await connectToMongoDB();
    const collection = database.collection('subtitles');

    const document = {
      video_id: videoId,
      subtitle: subtitleData.subtitle,
      language: subtitleData.language || 'Unknown',
      language_code: subtitleData.language_code || 'unknown',
      format: subtitleData.format || 'text',
      method: 'hybrid-local-to-mongodb',
      source_method: subtitleData.method || 'local-yt-dlp',
      file_downloaded: subtitleData.file_downloaded || null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };

    // 기존 자막이 있으면 업데이트, 없으면 생성
    const result = await collection.replaceOne(
      { video_id: videoId },
      document,
      { upsert: true }
    );

    console.log(`💾 MongoDB에 자막 저장 완료: ${videoId}`);
    return {
      ...document,
      _id: result.upsertedId || 'updated'
    };
  } catch (error) {
    console.error('❌ MongoDB 자막 저장 오류:', error);
    throw error;
  }
}

// 자막 조회 함수
async function getSubtitleFromMongoDB(videoId) {
  try {
    const database = await connectToMongoDB();
    const collection = database.collection('subtitles');

    const result = await collection.findOne({ video_id: videoId });
    return result;
  } catch (error) {
    console.error('❌ MongoDB 자막 조회 오류:', error);
    throw error;
  }
}

// 모든 자막 목록 조회
async function getAllSubtitlesFromMongoDB(limit = 50) {
  try {
    const database = await connectToMongoDB();
    const collection = database.collection('subtitles');

    const results = await collection
      .find({})
      .sort({ uploaded_at: -1 })
      .limit(limit)
      .toArray();

    return results.map(doc => ({
      video_id: doc.video_id,
      language: doc.language,
      uploaded_at: doc.uploaded_at,
      method: doc.method,
      format: doc.format
    }));
  } catch (error) {
    console.error('❌ MongoDB 자막 목록 조회 오류:', error);
    throw error;
  }
}

// Vercel 서버리스 함수
module.exports = async (req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // POST: 자막 업로드
    if (req.method === 'POST') {
      const { videoId, subtitle, language, language_code, format, method, file_downloaded } = req.body;
      console.log('📤 MongoDB 자막 업로드 요청:', { videoId, language, format, method });

      if (!videoId || !subtitle) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_DATA',
          message: 'videoId and subtitle are required'
        });
        return;
      }

      // MongoDB에 자막 저장
      const savedData = await saveSubtitleToMongoDB(videoId, {
        subtitle,
        language,
        language_code,
        format,
        method,
        file_downloaded
      });

      res.status(200).json({
        success: true,
        message: '자막이 MongoDB에 성공적으로 업로드되었습니다.',
        data: savedData,
        storage_type: 'mongodb',
        database: 'rubberdog',
        collection: 'subtitles'
      });
      return;
    }

    // GET: 자막 조회
    if (req.method === 'GET') {
      const { videoId } = req.query;

      // 특정 비디오 자막 조회
      if (videoId) {
        const subtitleData = await getSubtitleFromMongoDB(videoId);

        if (subtitleData) {
          console.log(`📖 MongoDB에서 자막 조회 성공: ${videoId}`);
          res.status(200).json({
            success: true,
            data: subtitleData,
            found: true,
            storage_type: 'mongodb'
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'SUBTITLE_NOT_FOUND',
            message: '해당 비디오의 자막을 MongoDB에서 찾을 수 없습니다.',
            found: false,
            storage_type: 'mongodb'
          });
        }
        return;
      }

      // 전체 자막 목록 조회
      const storedSubtitles = await getAllSubtitlesFromMongoDB();
      console.log(`📋 MongoDB에서 자막 목록 조회: ${storedSubtitles.length}개`);

      res.status(200).json({
        success: true,
        message: `${storedSubtitles.length}개의 저장된 자막을 MongoDB에서 찾았습니다.`,
        data: storedSubtitles,
        count: storedSubtitles.length,
        storage_type: 'mongodb',
        database: 'rubberdog'
      });
      return;
    }

    res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed'
    });

  } catch (error) {
    console.error('❌ MongoDB 자막 API 오류:', error);
    res.status(500).json({
      success: false,
      error: 'MONGODB_ERROR',
      message: error.message,
      timestamp: new Date().toISOString(),
      storage_type: 'mongodb'
    });
  }
};