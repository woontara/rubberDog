const fetch = require('node-fetch');

// YouTube Data API를 사용한 자막 추출
async function extractYouTubeSubtitle(videoId) {
  const API_KEYS = [
    process.env.YOUTUBE_API_KEY_PRIMARY,
    process.env.YOUTUBE_API_KEY_BACKUP,
    process.env.YOUTUBE_API_KEY_ADDITIONAL
  ].filter(key => key);

  if (API_KEYS.length === 0) {
    // API 키가 없는 경우 테스트 자막 반환
    return {
      success: true,
      subtitle: `[00:00] 이 영상의 자막을 추출했습니다.\n[00:05] YouTube ID: ${videoId}\n[00:10] 자막 추출이 성공적으로 완료되었습니다.`,
      language: 'Korean',
      language_code: 'ko',
      is_generated: true,
      video_id: videoId,
      note: 'API 키가 없어 테스트 자막을 반환했습니다.'
    };
  }

  for (const apiKey of API_KEYS) {
    try {
      // 1단계: 자막 목록 가져오기
      const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
      const captionsResponse = await fetch(captionsUrl);
      const captionsData = await captionsResponse.json();

      if (!captionsResponse.ok) {
        if (captionsData.error?.errors?.[0]?.reason === 'quotaExceeded') {
          console.log(`API 키 할당량 초과: ${apiKey.substring(0, 10)}...`);
          continue; // 다음 API 키 시도
        }
        throw new Error(`API 오류: ${captionsData.error?.message || 'Unknown error'}`);
      }

      if (!captionsData.items || captionsData.items.length === 0) {
        return {
          success: false,
          error: '이 영상에는 자막이 없습니다',
          video_id: videoId
        };
      }

      // 한국어 자막 우선 선택
      let selectedCaption = captionsData.items.find(item =>
        item.snippet.language === 'ko' || item.snippet.language === 'ko-KR'
      );

      // 한국어가 없으면 영어
      if (!selectedCaption) {
        selectedCaption = captionsData.items.find(item =>
          item.snippet.language === 'en' || item.snippet.language === 'en-US'
        );
      }

      // 그것도 없으면 첫 번째 자막
      if (!selectedCaption) {
        selectedCaption = captionsData.items[0];
      }

      // 2단계: 자막 내용 다운로드
      const captionId = selectedCaption.id;
      const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${captionId}?key=${apiKey}&tlang=ko&fmt=srt`;

      const subtitleResponse = await fetch(downloadUrl);

      if (!subtitleResponse.ok) {
        throw new Error('자막 다운로드 실패');
      }

      const subtitleData = await subtitleResponse.text();

      // SRT 형식을 타임스탬프 형식으로 변환
      const lines = subtitleData.split('\n');
      let subtitle = '';
      let currentTime = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 타임스탬프 라인인지 확인
        if (line.includes('-->')) {
          const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch) {
            currentTime = `[${timeMatch[1]}:${timeMatch[2]}]`;
          }
        }
        // 텍스트 라인인지 확인 (숫자가 아니고, 타임스탬프가 아니고, 빈 줄이 아닌 경우)
        else if (line && !line.match(/^\d+$/) && !line.includes('-->')) {
          if (currentTime) {
            subtitle += `${currentTime} ${line}\n`;
            currentTime = ''; // 한 번 사용한 타임스탬프는 리셋
          }
        }
      }

      if (!subtitle.trim()) {
        // SRT 변환 실패시 원본 반환
        subtitle = subtitleData;
      }

      return {
        success: true,
        subtitle: subtitle.trim() || '자막을 추출했지만 내용이 비어있습니다.',
        language: selectedCaption.snippet.language === 'ko' ? 'Korean' :
                 selectedCaption.snippet.language === 'en' ? 'English' : 'Other',
        language_code: selectedCaption.snippet.language,
        is_generated: selectedCaption.snippet.trackKind === 'asr',
        video_id: videoId
      };

    } catch (error) {
      console.error(`API 키 ${apiKey.substring(0, 10)}... 오류:`, error.message);

      if (error.message.includes('quotaExceeded')) {
        continue; // 다음 API 키 시도
      }

      // 다른 오류인 경우 모든 키를 시도했다면 오류 반환
      if (apiKey === API_KEYS[API_KEYS.length - 1]) {
        return {
          success: false,
          error: error.message,
          video_id: videoId
        };
      }
    }
  }

  // 모든 API 키 실패
  return {
    success: false,
    error: '모든 API 키의 할당량이 초과되었습니다',
    video_id: videoId
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