// yt-dlp를 사용한 YouTube 자막 추출 API (Vercel 최적화)

// 환경 감지
function isVercelEnvironment() {
  return process.env.VERCEL || process.env.NODE_ENV === 'production';
}

// 서버리스 환경 최적화 fetch 함수
async function safeFetch(url, options = {}) {
  console.log('🌐 SafeFetch 요청:', url);

  try {
    // Node.js 18+ 내장 fetch 사용 (Vercel 환경)
    if (typeof fetch !== 'undefined') {
      console.log('✅ 내장 fetch 사용');
      return await fetch(url, options);
    }

    console.log('⚠️ Fallback to HTTPS module');

    // fallback for older Node.js versions
    const https = require('https');
    const { URL } = require('url');

    if (!url) {
      throw new Error('URL is required');
    }

    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(url);
        const requestOptions = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            ...options.headers
          }
        };

        console.log('📡 HTTPS 요청 옵션:', requestOptions);

        const req = https.request(requestOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              text: () => Promise.resolve(data)
            });
          });
        });

        req.on('error', (error) => {
          console.error('HTTPS 요청 오류:', error);
          reject(error);
        });

        req.end();
      } catch (parseError) {
        console.error('URL 파싱 오류:', parseError);
        reject(parseError);
      }
    });
  } catch (error) {
    console.error('SafeFetch error:', error);
    throw error;
  }
}

// XML 자막 파싱 (현대화된 강화 버전)
function parseXMLSubtitles(xmlData) {
  try {
    console.log('🔍 XML 파싱 시작 - 데이터 길이:', xmlData.length);

    const subtitles = [];

    // XML 데이터 사전 처리
    let processedXml = xmlData;

    // 일반적인 문제들 수정
    processedXml = processedXml.replace(/&amp;/g, '&');
    processedXml = processedXml.replace(/&lt;/g, '<');
    processedXml = processedXml.replace(/&gt;/g, '>');
    processedXml = processedXml.replace(/&quot;/g, '"');
    processedXml = processedXml.replace(/&apos;/g, "'");
    processedXml = processedXml.replace(/&#39;/g, "'");

    // 여러 XML 구조 패턴 시도
    const patterns = [
      // 2024년 현재 YouTube 표준 패턴
      /<text start="([0-9.]+)"[^>]*>(.*?)<\/text>/g,
      /<text start='([0-9.]+)'[^>]*>(.*?)<\/text>/g,

      // duration 속성이 있는 패턴
      /<text start="([0-9.]+)" dur="[0-9.]+"[^>]*>(.*?)<\/text>/g,
      /<text start="([0-9.]+)" duration="[0-9.]+"[^>]*>(.*?)<\/text>/g,

      // 속성 순서가 다른 패턴
      /<text[^>]+start="([0-9.]+)"[^>]*>(.*?)<\/text>/g,
      /<text[^>]+start='([0-9.]+)'[^>]*>(.*?)<\/text>/g,

      // CDATA 섹션 패턴
      /<text[^>]*start="([0-9.]+)"[^>]*><!\[CDATA\[(.*?)\]\]><\/text>/g,

      // 중첩된 태그가 있는 복잡한 패턴
      /<text[^>]*start="([0-9.]+)"[^>]*>([\s\S]*?)<\/text>/g,

      // 백업 패턴들
      /<text.*?start="([0-9.]+)".*?>(.*?)<\/text>/gs,
      /<text.*?start='([0-9.]+)'.*?>(.*?)<\/text>/gs
    ];

    let totalMatches = 0;
    let bestPattern = null;
    let bestMatches = 0;

    // 각 패턴을 시도하고 가장 많은 매치를 찾는 패턴 사용
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      pattern.lastIndex = 0; // 정규식 상태 리셋

      let match;
      let patternMatches = 0;
      const tempSubtitles = [];

      while ((match = pattern.exec(processedXml)) !== null) {
        const startTime = parseFloat(match[1]);
        let text = match[2];

        if (isNaN(startTime) || startTime < 0) {
          continue;
        }

        // 내부 HTML 태그 제거
        text = text.replace(/<[^>]*>/g, '');
        text = text.trim();

        if (text && text.length > 0) {
          const minutes = Math.floor(startTime / 60);
          const seconds = Math.floor(startTime % 60);
          const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
          tempSubtitles.push(`${timeStr} ${text}`);
          patternMatches++;
        }

        // 무한 루프 방지
        if (patternMatches > 10000) {
          break;
        }
      }

      console.log(`패턴 ${i + 1}: ${patternMatches}개 매치`);

      if (patternMatches > bestMatches) {
        bestMatches = patternMatches;
        bestPattern = i + 1;
        subtitles.length = 0; // 배열 클리어
        subtitles.push(...tempSubtitles);
      }

      // 충분한 매치를 찾았으면 조기 종료
      if (patternMatches > 50) {
        totalMatches = patternMatches;
        break;
      }
    }

    console.log(`✅ 최고 성능 패턴 ${bestPattern}: ${bestMatches}개 자막 추출`);

    if (subtitles.length === 0) {
      console.log('❌ 모든 패턴 실패');

      // 디버깅 정보 출력
      console.log('XML 구조 확인:');
      console.log('- text 태그 존재:', processedXml.includes('<text'));
      console.log('- start 속성 존재:', processedXml.includes('start='));
      console.log('- 샘플 텍스트 (첫 200자):', processedXml.substring(0, 200));

      // 가능한 텍스트 태그들 찾기
      const textMatches = processedXml.match(/<text[^>]*>/g);
      if (textMatches) {
        console.log('발견된 text 태그들 (최대 3개):', textMatches.slice(0, 3));
      }

      return null;
    }

    // 중복 제거 및 정렬
    const uniqueSubtitles = [...new Set(subtitles)];
    console.log(`🎯 최종 결과: ${uniqueSubtitles.length}개 자막 세그먼트`);

    return uniqueSubtitles.join('\n');

  } catch (error) {
    console.error('❌ XML 파싱 치명적 오류:', error);
    return null;
  }
}

// 웹 API를 통한 자막 추출 (yt-dlp 스타일)
async function extractSubtitleWebAPI(videoId) {
  console.log('🌐 웹 API 방식으로 자막 추출 시작:', videoId);

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log('📡 YouTube 페이지 요청:', videoUrl);

    const response = await safeFetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    console.log('📄 HTML 응답 크기:', html.length);

    // 여러 패턴으로 자막 정보 찾기 (강화된 패턴)
    const patterns = [
      // 2024년 최신 YouTube 구조 패턴들 (강화)
      /"captionTracks":\s*(\[[\s\S]*?\])/,
      /"captions":\s*\{[^}]*"playerCaptionsTracklistRenderer":\s*\{[^}]*"captionTracks":\s*(\[.*?\])/,
      /captionTracks":\s*(\[.*?\])/,

      // baseUrl 확인 패턴들 (실제 사용 가능한 자막)
      /"captionTracks":\s*(\[[\s\S]*?baseUrl[\s\S]*?\])/,
      /playerCaptionsTracklistRenderer.*?"captionTracks":\s*(\[[\s\S]*?baseUrl[\s\S]*?\])/,
      /"captions":\s*\{[\s\S]*?"captionTracks":\s*(\[[\s\S]*?baseUrl[\s\S]*?\])/,

      // 더 유연한 매칭 패턴들
      /captionTracks["\s]*:\s*(\[[\s\S]*?\])/,
      /"captions["\s]*:\s*\{[\s\S]*?captionTracks["\s]*:\s*(\[[\s\S]*?\])/,
      /playerCaptionsTracklistRenderer[\s\S]*?captionTracks["\s]*:\s*(\[[\s\S]*?\])/,

      // 대안 구조 패턴들
      /"trackName"[\s\S]*?"baseUrl"[\s\S]*?"languageCode"[\s\S]*?\]/,
      /\[[\s\S]*?"baseUrl"[\s\S]*?"languageCode"[\s\S]*?\]/,
      /"timedtext[^"]*"/,

      // 백업 및 추가 패턴들
      /captionTracks.*?(\[[\s\S]*?\])/,
      /"tracks":\s*(\[[\s\S]*?\])/,
      /"subtitles":\s*(\[.*?\])/,

      // 최후 수단 패턴들
      /\[[\s\S]*?"baseUrl".*?"timedtext"[\s\S]*?\]/,
      /\{[\s\S]*?"baseUrl"[\s\S]*?"languageCode"[\s\S]*?\}/
    ];

    let captionTracks = null;
    let matchedPattern = null;

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log('✅ 자막 패턴 매치:', pattern.toString());
        try {
          captionTracks = JSON.parse(match[1]);
          matchedPattern = pattern.toString();
          break;
        } catch (parseError) {
          console.warn('JSON 파싱 실패:', parseError.message);
          continue;
        }
      }
    }

    if (!captionTracks) {
      // 디버깅 정보 수집
      const hasCaption = html.includes('captionTracks') || html.includes('captions') || html.includes('subtitles');
      const hasBaseUrl = html.includes('baseUrl');
      console.log('🔍 자막 키워드 존재:', hasCaption);
      console.log('🔗 baseUrl 키워드 존재:', hasBaseUrl);

      // 추가 디버깅: HTML에서 자막 관련 섹션 찾기
      const captionSection = html.match(/.{0,200}caption.{0,200}/gi);
      const baseUrlSection = html.match(/.{0,100}baseUrl.{0,100}/gi);

      // 자막용 baseUrl 찾기 (timedtext 포함)
      const timedtextSection = html.match(/.{0,200}timedtext.{0,200}/gi);
      const subtitleBaseUrl = html.match(/.{0,150}baseUrl.*?timedtext.{0,150}/gi);

      if (captionSection) {
        console.log('📝 자막 관련 섹션 샘플:', captionSection.slice(0, 2));
      }
      if (baseUrlSection) {
        console.log('🔗 baseUrl 관련 섹션 샘플:', baseUrlSection.slice(0, 2));
      }
      if (timedtextSection) {
        console.log('⏰ timedtext 섹션 샘플:', timedtextSection.slice(0, 2));
      }
      if (subtitleBaseUrl) {
        console.log('🎯 자막용 baseUrl 샘플:', subtitleBaseUrl.slice(0, 2));
      }

      return {
        success: false,
        error: 'NO_CAPTIONS_FOUND',
        message: '이 영상에는 자막이 비활성화되어 있거나 사용할 수 없습니다.',
        video_id: videoId,
        method: 'web-api',
        debug_info: {
          hasCaption,
          hasBaseUrl,
          hasTimedtext: !!timedtextSection,
          htmlLength: html.length,
          patterns_tested: patterns.length,
          captionSections: captionSection ? captionSection.length : 0,
          baseUrlSections: baseUrlSection ? baseUrlSection.length : 0,
          timedtextSections: timedtextSection ? timedtextSection.length : 0,
          subtitleBaseUrlSections: subtitleBaseUrl ? subtitleBaseUrl.length : 0,
          captionSamples: captionSection ? captionSection.slice(0, 1) : [],
          timedtextSamples: timedtextSection ? timedtextSection.slice(0, 1) : [],
          subtitleBaseUrlSamples: subtitleBaseUrl ? subtitleBaseUrl.slice(0, 1) : []
        },
        suggestion: '다른 동영상을 시도해보세요. 자막이 있는 동영상에서는 정상 작동합니다.'
      };
    }

    console.log('📊 발견된 자막 트랙 수:', captionTracks.length);
    console.log('📄 전체 자막 트랙 정보:', JSON.stringify(captionTracks, null, 2));

    if (captionTracks.length === 0) {
      return {
        success: false,
        error: 'NO_CAPTION_TRACKS',
        message: '이 영상에는 자막 트랙이 없습니다.',
        video_id: videoId,
        method: 'web-api'
      };
    }

    // 언어 우선순위: 한국어 > 영어 > 첫 번째
    let selectedTrack = captionTracks.find(track =>
      track.languageCode === 'ko' || track.languageCode === 'ko-KR'
    );

    if (!selectedTrack) {
      selectedTrack = captionTracks.find(track =>
        track.languageCode === 'en' || track.languageCode === 'en-US'
      );
    }

    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }

    console.log('🎯 선택된 자막:', selectedTrack.languageCode, selectedTrack.name?.simpleText || 'Unknown');
    console.log('📄 선택된 자막 전체 정보:', JSON.stringify(selectedTrack, null, 2));

    // 다양한 URL 필드 시도
    const subtitleUrl = selectedTrack.baseUrl ||
                       selectedTrack.url ||
                       selectedTrack.downloadUrl ||
                       selectedTrack.captionsUrl ||
                       selectedTrack.vttUrl ||
                       selectedTrack.srtUrl;

    console.log('🔗 자막 URL:', subtitleUrl);

    // 자막 URL 검증
    if (!subtitleUrl) {
      console.error('❌ 자막 URL이 없습니다.');
      console.log('🔍 사용 가능한 속성들:', Object.keys(selectedTrack));
      return {
        success: false,
        error: 'NO_SUBTITLE_URL',
        message: '자막 URL을 찾을 수 없습니다.',
        video_id: videoId,
        method: 'web-api-yt-dlp-style',
        debug_info: {
          selectedTrack,
          availableKeys: Object.keys(selectedTrack)
        }
      };
    }

    // 자막 데이터 다운로드
    const subtitleResponse = await safeFetch(subtitleUrl);
    if (!subtitleResponse.ok) {
      throw new Error(`자막 다운로드 실패: ${subtitleResponse.status}`);
    }

    const xmlData = await subtitleResponse.text();
    console.log('📄 XML 데이터 샘플 (처음 500자):', xmlData.substring(0, 500));
    console.log('📊 XML 데이터 전체 길이:', xmlData.length);

    // XML 구조 분석
    if (xmlData.includes('<transcript>')) {
      console.log('✅ transcript 태그 발견');
    }
    if (xmlData.includes('<text')) {
      console.log('✅ text 태그 발견');
    }
    if (xmlData.includes('start=')) {
      console.log('✅ start 속성 발견');
    }

    const parsedSubtitle = parseXMLSubtitles(xmlData);

    if (parsedSubtitle) {
      console.log('🎉 자막 추출 성공!');
      return {
        success: true,
        subtitle: parsedSubtitle,
        language: selectedTrack.name?.simpleText || 'Unknown',
        language_code: selectedTrack.languageCode,
        is_generated: selectedTrack.kind === 'asr',
        video_id: videoId,
        method: 'web-api-yt-dlp-style',
        matched_pattern: matchedPattern,
        available_languages: captionTracks.map(track => ({
          language: track.languageCode,
          name: track.name?.simpleText || track.languageCode
        }))
      };
    } else {
      return {
        success: false,
        error: 'PARSE_ERROR',
        message: '자막 데이터 파싱에 실패했습니다.',
        video_id: videoId,
        method: 'web-api-yt-dlp-style'
      };
    }

  } catch (error) {
    console.error('❌ 웹 API 자막 추출 오류:', error);
    return {
      success: false,
      error: 'WEB_API_ERROR',
      message: `웹 API 방식 실패: ${error.message}`,
      video_id: videoId,
      method: 'web-api'
    };
  }
}

// youtube-transcript 라이브러리 사용 (백업 방법)
async function extractSubtitleTranscriptAPI(videoId) {
  try {
    console.log('📚 youtube-transcript 라이브러리로 자막 추출 시도:', videoId);

    const { YoutubeTranscript } = require('youtube-transcript');
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (transcript && transcript.length > 0) {
      // 자막 텍스트 추출
      const subtitleText = transcript.map(item => item.text).join(' ');

      return {
        success: true,
        video_id: videoId,
        subtitle: subtitleText,
        method: 'youtube-transcript-api',
        language: 'auto-detected',
        language_code: 'auto',
        format: 'text',
        segment_count: transcript.length,
        duration: transcript[transcript.length - 1]?.offset || 0,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: false,
      error: 'NO_TRANSCRIPT_DATA',
      message: '자막 추출에 실패했습니다. 이 동영상은 자막이 비활성화되어 있을 수 있습니다.',
      method: 'youtube-transcript-api',
      suggestion: '업로더가 자막을 활성화한 다른 동영상을 시도해보세요.'
    };

  } catch (error) {
    console.warn('⚠️ youtube-transcript API 실패:', error.message);
    return {
      success: false,
      error: 'TRANSCRIPT_API_ERROR',
      message: `youtube-transcript 오류: ${error.message}`,
      method: 'youtube-transcript-api'
    };
  }
}

// Vercel 서버리스 함수 (다중 방법 시도)
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
    console.log('🎬 자막 추출 요청:', { videoId, title, environment: isVercelEnvironment() ? 'vercel' : 'local' });

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // 다중 방법 시도: 웹 API 먼저, 실패시 youtube-transcript API
    console.log('🔄 방법 1: 웹 API 시도...');
    let result = await extractSubtitleWebAPI(videoId);

    if (!result.success) {
      console.log('⚠️ 웹 API 실패, 방법 2: youtube-transcript API 시도...');
      const fallbackResult = await extractSubtitleTranscriptAPI(videoId);

      if (fallbackResult.success) {
        console.log('✅ youtube-transcript API로 자막 추출 성공!');
        result = fallbackResult;
      } else {
        console.log('❌ 모든 방법 실패');
        // 웹 API 결과에 fallback 시도 정보 추가
        result.fallback_attempted = true;
        result.fallback_error = fallbackResult.error;
        result.fallback_message = fallbackResult.message;
      }
    }

    console.log(`🎯 최종 결과: ${videoId}`, result.success ? '성공' : '실패', `(방법: ${result.method})`);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ API 오류:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message,
      timestamp: new Date().toISOString(),
      environment: isVercelEnvironment() ? 'vercel' : 'local'
    });
  }
};