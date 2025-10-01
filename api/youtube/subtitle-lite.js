// 베셀 최적화 경량 자막 추출 API
// 무거운 의존성 없이 최적화된 자막 추출

// 간단한 YouTube API를 이용한 자막 추출
async function extractSubtitleLite(videoId) {
  console.log('🎯 Lite API: 경량 자막 추출 시작:', videoId);

  try {
    // 방법 1: YouTube의 공개 API를 직접 호출 (의존성 없음)
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // User-Agent 설정
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    console.log('🌐 Lite API: YouTube 페이지 요청 중...');

    // fetch는 Node.js 18+에서 기본 제공
    const response = await fetch(videoUrl, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log('📄 Lite API: HTML 페이지 로드 완료, 자막 정보 추출 중...');

    // YouTube 페이지에서 자막 정보 추출 (정규식 사용)
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);

    if (captionTracksMatch) {
      try {
        const captionTracks = JSON.parse(captionTracksMatch[1]);
        console.log('✅ Lite API: 자막 트랙 발견:', captionTracks.length);

        // 한국어 자막 우선 검색
        let selectedTrack = captionTracks.find(track =>
          track.languageCode === 'ko' || track.languageCode === 'ko-KR'
        );

        // 한국어가 없으면 첫 번째 자막
        if (!selectedTrack) {
          selectedTrack = captionTracks[0];
        }

        if (selectedTrack && selectedTrack.baseUrl) {
          console.log('🌐 Lite API: 자막 URL 발견:', selectedTrack.languageCode);

          // 자막 XML 다운로드
          const captionResponse = await fetch(selectedTrack.baseUrl, { headers });

          if (!captionResponse.ok) {
            throw new Error(`자막 다운로드 실패: ${captionResponse.status}`);
          }

          const xmlData = await captionResponse.text();
          console.log('📝 Lite API: 자막 XML 다운로드 완료');

          // XML 파싱 (정규식 사용, 외부 의존성 없음)
          const subtitleText = parseXMLSubtitlesLite(xmlData);

          if (subtitleText) {
            console.log('🎉 Lite API: 자막 추출 성공!');
            return {
              success: true,
              subtitle: subtitleText,
              language: selectedTrack.name ? selectedTrack.name.simpleText : 'Unknown',
              language_code: selectedTrack.languageCode,
              is_generated: selectedTrack.kind === 'asr',
              video_id: videoId,
              method: 'lite-youtube-api',
              segments_count: subtitleText.split('\n').length
            };
          }
        }
      } catch (parseError) {
        console.log('⚠️ Lite API: 자막 트랙 파싱 실패:', parseError.message);
      }
    }

    // 방법 2: 다른 자막 패턴 시도
    const playerResponseMatch = html.match(/"playerResponse":\s*({.+?})\s*(?:,|\})/);

    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]);

        if (playerResponse.captions && playerResponse.captions.playerCaptionsTracklistRenderer) {
          const captions = playerResponse.captions.playerCaptionsTracklistRenderer;

          if (captions.captionTracks && captions.captionTracks.length > 0) {
            console.log('✅ Lite API: playerResponse에서 자막 발견');

            let track = captions.captionTracks.find(t =>
              t.languageCode === 'ko' || t.languageCode === 'ko-KR'
            );

            if (!track) {
              track = captions.captionTracks[0];
            }

            if (track && track.baseUrl) {
              const captionResponse = await fetch(track.baseUrl, { headers });
              const xmlData = await captionResponse.text();
              const subtitleText = parseXMLSubtitlesLite(xmlData);

              if (subtitleText) {
                return {
                  success: true,
                  subtitle: subtitleText,
                  language: track.name ? track.name.simpleText : 'Unknown',
                  language_code: track.languageCode,
                  is_generated: track.kind === 'asr',
                  video_id: videoId,
                  method: 'lite-player-response',
                  segments_count: subtitleText.split('\n').length
                };
              }
            }
          }
        }
      } catch (parseError) {
        console.log('⚠️ Lite API: playerResponse 파싱 실패:', parseError.message);
      }
    }

    // 방법 3: 기본 비디오 정보라도 추출
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Unknown';

    console.log('📊 Lite API: 비디오 정보만 추출됨:', title);

    return {
      success: false,
      error: 'NO_CAPTIONS_FOUND_LITE',
      message: '이 영상에는 자막이 없거나 접근할 수 없습니다 (Lite API)',
      video_id: videoId,
      video_title: title,
      method: 'lite-youtube-api'
    };

  } catch (error) {
    console.error('❌ Lite API: 자막 추출 실패:', error.message);
    return {
      success: false,
      error: 'LITE_EXTRACTION_FAILED',
      message: `Lite API 자막 추출 실패: ${error.message}`,
      video_id: videoId,
      method: 'lite-youtube-api'
    };
  }
}

// XML 파싱 함수 (의존성 없는 경량 버전)
function parseXMLSubtitlesLite(xmlData) {
  try {
    // 간단한 정규식을 사용한 XML 파싱
    const textRegex = /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>(.*?)<\/text>/g;
    const subtitles = [];
    let match;

    while ((match = textRegex.exec(xmlData)) !== null) {
      const startTime = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      let text = match[3];

      // HTML 엔티티 디코딩
      text = text
        .replace(/<[^>]*>/g, '') // HTML 태그 제거
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();

      if (text) {
        const minutes = Math.floor(startTime / 60);
        const seconds = Math.floor(startTime % 60);
        const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
        subtitles.push(`${timeStr} ${text}`);
      }
    }

    return subtitles.length > 0 ? subtitles.join('\n') : null;
  } catch (error) {
    console.error('❌ Lite API: XML 파싱 오류:', error);
    return null;
  }
}

// 환경 감지
function isVercelEnvironment() {
  return process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production';
}

// 쿠키 기반 요청 (경량 버전)
async function extractSubtitleLiteWithCookies(videoId, cookies) {
  console.log('🍪 Lite API: 쿠키 기반 자막 추출 시작:', videoId);

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Cookie': cookies, // 쿠키 추가
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com'
    };

    const response = await fetch(videoUrl, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // 기본 추출 로직과 동일
    const result = await extractSubtitleLite(videoId);

    if (result.success) {
      result.method = 'lite-youtube-api-with-cookies';
      console.log('✅ Lite API: 쿠키 기반 자막 추출 성공');
    }

    return result;

  } catch (error) {
    console.error('❌ Lite API: 쿠키 기반 자막 추출 실패:', error.message);
    return {
      success: false,
      error: 'LITE_COOKIE_EXTRACTION_FAILED',
      message: `Lite API 쿠키 기반 자막 추출 실패: ${error.message}`,
      video_id: videoId,
      method: 'lite-youtube-api-with-cookies'
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
    const { videoId, title, cookies } = req.body;
    console.log('🎬 Lite API: 자막 추출 요청:', { videoId, title, hasCookies: !!cookies });
    console.log('🌍 Lite API: 환경:', isVercelEnvironment() ? 'Vercel/Production' : 'Local');

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // 쿠키가 있으면 쿠키 기반, 없으면 기본 방법
    const result = cookies
      ? await extractSubtitleLiteWithCookies(videoId, cookies)
      : await extractSubtitleLite(videoId);

    console.log(`✅ Lite API: 자막 추출 완료: ${videoId}`, result.success ? '성공' : '실패');

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Lite API: 자막 추출 오류:', error);
    res.status(500).json({
      success: false,
      error: 'LITE_SERVER_ERROR',
      message: error.message,
      stack: error.stack
    });
  }
};