// Vercel Serverless Function for YouTube Subtitle Extraction
const { YoutubeTranscript } = require('youtube-transcript');

// 실제 YouTube 자막 추출 함수
async function extractYouTubeSubtitle(videoId) {
  console.log(`🎬 실제 자막 추출 시작: ${videoId}`);

  try {
    // YouTube Transcript API를 사용하여 실제 자막 추출
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'ko', // 한국어 우선
      country: 'KR'
    });

    // 자막 텍스트 포맷팅
    let subtitleText = '';
    transcript.forEach(entry => {
      const startTime = Math.floor(entry.offset / 1000);
      const minutes = Math.floor(startTime / 60);
      const seconds = startTime % 60;
      const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;

      if (entry.text && entry.text.trim()) {
        subtitleText += `${timestamp} ${entry.text.trim()}\n`;
      }
    });

    console.log(`📝 실제 자막 추출 성공: ${videoId}`);

    return {
      success: true,
      subtitle: subtitleText.trim(),
      language: 'Korean',
      language_code: 'ko',
      is_generated: false,
      video_id: videoId,
      note: '실제 YouTube 자막을 성공적으로 추출했습니다.'
    };

  } catch (error) {
    console.error(`❌ 자막 추출 실패: ${videoId}`, error.message);

    // 에러 발생 시 사용자 친화적 메시지 반환
    let errorMessage = '자막 추출 중 오류가 발생했습니다.';

    if (error.message.includes('No transcripts found') || error.message.includes('Could not retrieve')) {
      errorMessage = '이 영상에는 자막이 없습니다.';
    } else if (error.message.includes('Video unavailable') || error.message.includes('not available')) {
      errorMessage = '영상을 찾을 수 없거나 접근할 수 없습니다.';
    }

    return {
      success: false,
      error: errorMessage,
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

    console.log(`🎬 자막 추출 요청: ${videoId}`);

    const result = await extractYouTubeSubtitle(videoId);
    res.status(200).json(result);

  } catch (error) {
    console.error('자막 추출 API 오류:', error);
    res.status(500).json({
      error: error.message
    });
  }
};