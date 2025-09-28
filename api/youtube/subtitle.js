const fetch = require('node-fetch');

// YouTube 자막 추출 함수 (Node.js 전용)
async function extractYouTubeSubtitle(videoId) {
  try {
    // YouTube 자막 데이터를 가져오는 URL 패턴
    const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ko&fmt=json3`;
    const captionUrlEn = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;

    let response;
    let language = 'ko';

    // 한국어 자막 시도
    try {
      response = await fetch(captionUrl);
      if (!response.ok) {
        // 영어 자막으로 시도
        response = await fetch(captionUrlEn);
        language = 'en';
      }
    } catch (error) {
      // 영어 자막으로 시도
      response = await fetch(captionUrlEn);
      language = 'en';
    }

    if (!response.ok) {
      throw new Error('자막을 찾을 수 없습니다');
    }

    const data = await response.json();

    if (!data.events) {
      throw new Error('자막 데이터가 없습니다');
    }

    // 자막 텍스트 추출 및 포맷팅
    let subtitle = '';
    for (const event of data.events) {
      if (event.segs) {
        const startTime = Math.floor(event.tStartMs / 1000);
        const minutes = Math.floor(startTime / 60);
        const seconds = startTime % 60;
        const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;

        let text = '';
        for (const seg of event.segs) {
          if (seg.utf8) {
            text += seg.utf8;
          }
        }

        if (text.trim()) {
          subtitle += `${timestamp} ${text.trim()}\n`;
        }
      }
    }

    return {
      success: true,
      subtitle: subtitle.trim(),
      language: language === 'ko' ? 'Korean' : 'English',
      language_code: language,
      is_generated: true,
      video_id: videoId
    };

  } catch (error) {
    console.error('자막 추출 오류:', error.message);
    return {
      success: false,
      error: error.message,
      video_id: videoId
    };
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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { videoId, title } = req.body;

    if (!videoId) {
      res.status(400).json({ error: 'videoId is required' });
      return;
    }

    console.log(`🎬 자막 추출 시작: ${videoId}`);

    const result = await extractYouTubeSubtitle(videoId);

    if (result.success) {
      console.log(`📝 자막 추출 결과: 성공`);
      res.status(200).json(result);
    } else {
      console.log(`❌ 자막 추출 실패: ${result.error}`);
      res.status(500).json(result);
    }

  } catch (error) {
    console.error('API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};