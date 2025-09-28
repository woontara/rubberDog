// 금요일에 성공했던 단순한 YouTube 자막 추출 코드
const { YoutubeTranscript } = require('youtube-transcript');

// 실제 YouTube 자막 추출 함수 (개선된 다중 언어 버전)
async function extractYouTubeSubtitle(videoId) {
  console.log(`🎬 실제 자막 추출 시작 (개선 버전): ${videoId}`);

  // 시도할 언어 옵션들
  const languageOptions = [
    { lang: 'ko', country: 'KR' }, // 한국어 우선
    { lang: 'ko' },
    { lang: 'en' },
    { lang: 'ja' },
    {}, // 기본 옵션
  ];

  let lastError = null;

  // 각 언어 옵션을 순차적으로 시도
  for (const option of languageOptions) {
    try {
      console.log(`🌐 언어 옵션 시도: ${JSON.stringify(option)}`);

      // YouTube Transcript API를 사용하여 실제 자막 추출
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, option);

      if (transcript && transcript.length > 0) {
        console.log(`✅ 자막 추출 성공 (${transcript.length}개):`, JSON.stringify(option));

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

        return {
          success: true,
          subtitle: subtitleText.trim(),
          language: option.lang || 'auto-detected',
          language_code: option.lang || 'auto',
          is_generated: false,
          video_id: videoId,
          language_option: JSON.stringify(option),
          note: '실제 YouTube 자막을 성공적으로 추출했습니다. (개선된 다중 언어 방식)'
        };
      }
    } catch (error) {
      console.log(`⚠️ 언어 옵션 ${JSON.stringify(option)} 실패:`, error.message);
      lastError = error;
      continue; // 다음 옵션 시도
    }
  }

  // 모든 옵션이 실패한 경우
  console.error(`❌ 모든 언어 옵션 실패: ${videoId}`, lastError?.message);

  // 에러 발생 시 사용자 친화적 메시지 반환
  let errorMessage = '자막 추출 중 오류가 발생했습니다.';

  if (lastError && lastError.message) {
    if (lastError.message.includes('No transcripts found') || lastError.message.includes('Could not retrieve')) {
      errorMessage = '이 영상에는 자막이 없습니다.';
    } else if (lastError.message.includes('Video unavailable') || lastError.message.includes('not available')) {
      errorMessage = '영상을 찾을 수 없거나 접근할 수 없습니다.';
    } else if (lastError.message.includes('Could not extract functions')) {
      errorMessage = 'YouTube 보안 정책으로 인해 자막을 추출할 수 없습니다.';
    } else if (lastError.message.includes('Transcript is disabled')) {
      errorMessage = '이 영상의 자막이 비활성화되어 있습니다.';
    }
  }

  return {
    success: false,
    error: errorMessage,
    video_id: videoId,
    detailed_error: lastError?.message || 'Unknown error'
  };
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

    console.log(`🎬 자막 추출 요청 (간단 버전): ${videoId}`);

    const result = await extractYouTubeSubtitle(videoId);
    res.status(200).json(result);

  } catch (error) {
    console.error('자막 추출 API 오류:', error);
    res.status(500).json({
      error: error.message
    });
  }
};