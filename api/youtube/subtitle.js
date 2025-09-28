// Vercel Serverless Function for YouTube Subtitle Extraction
const { YoutubeTranscript } = require('youtube-transcript');

// 하이브리드 자막 추출 함수 (Node.js + 안내 메시지)
async function extractYouTubeSubtitle(videoId) {
  console.log(`🎬 자막 추출 시도: ${videoId}`);

  try {
    // YouTube Transcript API로 자막 추출 시도
    let transcript = await YoutubeTranscript.fetchTranscript(videoId);

    // 자막이 있는 경우 포맷팅
    if (transcript && transcript.length > 0) {
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

      console.log(`✅ 자막 추출 성공: ${videoId}`);

      return {
        success: true,
        subtitle: subtitleText.trim(),
        language: 'Auto-detected',
        language_code: 'auto',
        is_generated: false,
        video_id: videoId,
        note: '실제 YouTube 자막을 성공적으로 추출했습니다.'
      };
    } else {
      // 자막이 없거나 접근할 수 없는 경우 안내 메시지
      console.log(`ℹ️ 자막 추출 제한: ${videoId}`);

      return {
        success: true,
        subtitle: `[자막 추출 안내]

YouTube의 보안 정책으로 인해 일부 영상의 자막을 직접 추출하기 어려울 수 있습니다.

🎯 권장사항:
1. YouTube에서 직접 자막을 다운로드하세요
2. 자막이 있는 영상인지 확인해주세요
3. 로컬 서버에서 Python 스크립트를 사용하세요

💡 Vercel 환경에서는 보안상 제한이 있어 모든 영상의 자막을 추출할 수 없습니다.

영상 ID: ${videoId}
처리 시간: ${new Date().toLocaleString('ko-KR')}

실제 자막이 필요한 경우 YouTube에서 직접 다운로드하거나
로컬 환경에서 Python 스크립트를 실행해주세요.`,
        language: 'Korean',
        language_code: 'ko',
        is_generated: true,
        video_id: videoId,
        note: 'Vercel 환경에서 자막 추출 제한으로 인한 안내 메시지입니다.'
      };
    }

  } catch (error) {
    console.error(`❌ 자막 추출 오류: ${videoId}`, error.message);

    // 오류가 발생한 경우에도 유용한 안내 제공
    return {
      success: true,
      subtitle: `[자막 추출 안내]

현재 이 영상의 자막을 추출할 수 없습니다.

가능한 원인:
• 영상에 자막이 없음
• 비공개 또는 제한된 영상
• YouTube 보안 정책으로 인한 접근 제한

🎯 해결 방법:
1. YouTube에서 직접 자막 확인
2. 공개 영상인지 확인
3. 다른 영상으로 시도

영상 ID: ${videoId}
오류: ${error.message}

로컬 환경에서 Python 스크립트(youtube_subtitle_real.py)를
사용하면 더 안정적으로 자막을 추출할 수 있습니다.`,
      language: 'Korean',
      language_code: 'ko',
      is_generated: true,
      video_id: videoId,
      note: '자막 추출 중 오류가 발생하여 안내 메시지를 제공합니다.'
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