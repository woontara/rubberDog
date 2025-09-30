// 베셀 환경에서 자막 업로드 API - 로컬에서 추출한 자막을 베셀에 저장
const fs = require('fs');
const path = require('path');

// 환경 감지
function isVercelEnvironment() {
  return process.env.VERCEL || process.env.NODE_ENV === 'production';
}

// 자막 데이터 저장 (메모리 기반)
const subtitleStorage = new Map();

// 자막 저장 함수
function saveSubtitle(videoId, subtitleData) {
  console.log('💾 베셀에 자막 저장:', videoId);

  const key = `subtitle_${videoId}`;
  const timestamp = new Date().toISOString();

  const storageData = {
    video_id: videoId,
    subtitle: subtitleData.subtitle,
    language: subtitleData.language,
    language_code: subtitleData.language_code,
    format: subtitleData.format,
    method: 'hybrid-local-to-vercel',
    uploaded_at: timestamp,
    file_downloaded: subtitleData.file_downloaded || null,
    source_method: subtitleData.method || 'local-yt-dlp'
  };

  subtitleStorage.set(key, storageData);
  console.log(`✅ 자막 저장 완료: ${videoId} (${subtitleData.language})`);

  return storageData;
}

// 자막 조회 함수
function getSubtitle(videoId) {
  const key = `subtitle_${videoId}`;
  return subtitleStorage.get(key);
}

// 저장된 자막 목록 조회
function getStoredSubtitles() {
  const subtitles = [];
  for (const [key, data] of subtitleStorage.entries()) {
    subtitles.push({
      key,
      video_id: data.video_id,
      language: data.language,
      uploaded_at: data.uploaded_at,
      method: data.method
    });
  }
  return subtitles;
}

// Express.js / Node.js 서버용 핸들러
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
      console.log('📤 자막 업로드 요청:', { videoId, language, format, method });

      if (!videoId || !subtitle) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_DATA',
          message: 'videoId and subtitle are required'
        });
        return;
      }

      // 자막 데이터 저장
      const savedData = saveSubtitle(videoId, {
        subtitle,
        language: language || 'Unknown',
        language_code: language_code || 'unknown',
        format: format || 'text',
        method: method || 'local-yt-dlp',
        file_downloaded
      });

      res.status(200).json({
        success: true,
        message: '자막이 성공적으로 업로드되었습니다.',
        data: savedData,
        storage_key: `subtitle_${videoId}`,
        environment: 'vercel'
      });
      return;
    }

    // GET: 자막 조회 또는 목록 조회
    if (req.method === 'GET') {
      const { videoId } = req.query;

      // 특정 비디오 자막 조회
      if (videoId) {
        const subtitleData = getSubtitle(videoId);

        if (subtitleData) {
          console.log(`📖 자막 조회 성공: ${videoId}`);
          res.status(200).json({
            success: true,
            data: subtitleData,
            found: true
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'SUBTITLE_NOT_FOUND',
            message: '해당 비디오의 자막을 찾을 수 없습니다.',
            found: false
          });
        }
        return;
      }

      // 전체 자막 목록 조회
      const storedSubtitles = getStoredSubtitles();
      console.log(`📋 저장된 자막 목록 조회: ${storedSubtitles.length}개`);

      res.status(200).json({
        success: true,
        message: `${storedSubtitles.length}개의 저장된 자막을 찾았습니다.`,
        data: storedSubtitles,
        count: storedSubtitles.length,
        environment: isVercelEnvironment() ? 'vercel' : 'local'
      });
      return;
    }

    res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed'
    });

  } catch (error) {
    console.error('❌ 자막 업로드 API 오류:', error);
    res.status(500).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: error.message,
      timestamp: new Date().toISOString(),
      environment: isVercelEnvironment() ? 'vercel' : 'local'
    });
  }
};