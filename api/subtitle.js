const { YoutubeTranscript } = require('youtube-transcript');

// YouTube URL에서 비디오 ID 추출하는 함수
function extractVideoId(url) {
  if (!url) return null;

  // 이미 11자리 ID인 경우
  if (url.length === 11 && !url.includes('/')) {
    return url;
  }

  // YouTube URL 패턴들
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// 자막 텍스트를 시간과 함께 포맷하는 함수
function formatSubtitle(transcriptData) {
  if (!transcriptData || !Array.isArray(transcriptData)) {
    return '';
  }

  return transcriptData.map(entry => {
    const startTime = Math.floor(entry.offset / 1000);
    const minutes = Math.floor(startTime / 60);
    const seconds = startTime % 60;
    const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;

    return `${timestamp} ${entry.text.trim()}`;
  }).join('\n');
}

// 메인 핸들러 함수
export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET과 POST 모두 지원
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only GET and POST methods are allowed'
    });
  }

  try {
    // URL 파라미터 또는 요청 본문에서 비디오 ID/URL 가져오기
    const videoInput = req.method === 'GET'
      ? (req.query.videoId || req.query.url || req.query.v)
      : (req.body?.videoId || req.body?.url || req.body?.v);

    if (!videoInput) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'Video ID or YouTube URL is required',
        usage: {
          get: '/api/subtitle?videoId=VIDEO_ID or /api/subtitle?url=YOUTUBE_URL',
          post: '{ "videoId": "VIDEO_ID" } or { "url": "YOUTUBE_URL" }'
        }
      });
    }

    // 비디오 ID 추출
    const videoId = extractVideoId(videoInput);
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_VIDEO_ID',
        message: 'Invalid YouTube video ID or URL',
        provided: videoInput
      });
    }

    console.log(`🎬 Vercel API: 자막 추출 시작 - ${videoId}`);

    // 언어 옵션 (한국어 우선, 그 다음 영어, 마지막에 자동)
    const languageOptions = [
      { lang: 'ko' },
      { lang: 'ko-KR' },
      { lang: 'en' },
      { lang: 'en-US' },
      { lang: 'ja' },
      { lang: 'auto' },
      {} // 언어 지정 없음
    ];

    let lastError = null;

    // 각 언어 옵션을 시도
    for (const langOption of languageOptions) {
      try {
        const langCode = langOption.lang || 'auto';
        console.log(`🌐 ${langCode} 언어로 시도 중...`);

        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, langOption);

        if (transcriptData && transcriptData.length > 0) {
          const formattedSubtitle = formatSubtitle(transcriptData);

          console.log(`✅ 자막 추출 성공: ${langCode} (${transcriptData.length}개 세그먼트)`);

          return res.status(200).json({
            success: true,
            subtitle: formattedSubtitle,
            language: langCode === 'auto' ? 'Auto-detected' : langCode,
            language_code: langCode,
            video_id: videoId,
            segments_count: transcriptData.length,
            method: 'youtube-transcript-js',
            note: `Vercel API로 자막 추출 성공 (${langCode})`
          });
        }
      } catch (error) {
        lastError = error;
        console.log(`❌ ${langOption.lang || 'auto'} 언어 실패: ${error.message}`);
        continue;
      }
    }

    // 모든 언어 시도 실패
    const errorMessage = lastError?.message || 'Unknown error';

    console.log(`❌ 모든 언어 시도 실패: ${videoId}`);

    // 구체적인 오류 유형 판단
    if (errorMessage.includes('Transcript is disabled') || errorMessage.includes('No transcript found')) {
      return res.status(404).json({
        success: false,
        error: 'NO_TRANSCRIPT',
        message: '이 영상에는 자막이 없습니다.',
        video_id: videoId,
        detailed_error: errorMessage
      });
    } else if (errorMessage.includes('Video unavailable') || errorMessage.includes('private')) {
      return res.status(403).json({
        success: false,
        error: 'VIDEO_UNAVAILABLE',
        message: '영상을 사용할 수 없습니다. (비공개, 삭제됨, 또는 지역 제한)',
        video_id: videoId,
        detailed_error: errorMessage
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'EXTRACTION_FAILED',
        message: '자막 추출 중 오류가 발생했습니다.',
        video_id: videoId,
        detailed_error: errorMessage
      });
    }

  } catch (error) {
    console.error('❌ API 오류:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: '서버 오류가 발생했습니다.',
      detailed_error: error.message
    });
  }
}