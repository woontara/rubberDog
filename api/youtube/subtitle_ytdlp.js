// 강력한 JavaScript YouTube 자막 추출 API (ytdl-core + youtube-transcript)
const ytdl = require('@distube/ytdl-core');
const { YoutubeTranscript } = require('youtube-transcript');

// 다중 방법으로 자막 추출 시도
async function extractSubtitleAdvanced(videoId) {
  console.log('🔧 고급 자막 추출 시작:', videoId);

  // 방법 1: ytdl-core로 자막 정보 가져오기
  try {
    console.log('🎯 방법 1: ytdl-core로 자막 추출 시도');

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(videoUrl);

    if (info.player_response && info.player_response.captions) {
      const captions = info.player_response.captions.playerCaptionsTracklistRenderer;

      if (captions && captions.captionTracks) {
        console.log('✅ ytdl-core: 자막 트랙 발견:', captions.captionTracks.length);

        // 한국어 자막 우선 검색
        let captionTrack = captions.captionTracks.find(track =>
          track.languageCode === 'ko' || track.languageCode === 'ko-KR'
        );

        // 한국어가 없으면 다른 언어
        if (!captionTrack) {
          captionTrack = captions.captionTracks[0];
        }

        if (captionTrack && captionTrack.baseUrl) {
          console.log('🌐 자막 URL 발견:', captionTrack.languageCode);

          // 자막 URL에서 직접 다운로드
          const fetch = require('node-fetch');
          const response = await fetch(captionTrack.baseUrl);
          const xmlData = await response.text();

          // XML 파싱 (간단한 방법)
          const subtitleText = parseXMLSubtitles(xmlData);

          if (subtitleText) {
            return {
              success: true,
              subtitle: subtitleText,
              language: captionTrack.name ? captionTrack.name.simpleText : 'Unknown',
              language_code: captionTrack.languageCode,
              is_generated: captionTrack.kind === 'asr',
              video_id: videoId,
              method: 'ytdl-core-direct'
            };
          }
        }
      }
    }
  } catch (error) {
    console.log('⚠️ ytdl-core 방법 실패:', error.message);
  }

  // 방법 2: youtube-transcript 다중 언어 시도 (기존 방법)
  try {
    console.log('🎯 방법 2: youtube-transcript 다중 언어 시도');

    const languageOptions = [
      { lang: 'ko', country: 'KR' },
      { lang: 'ko' },
      { lang: 'en' },
      { lang: 'ja' },
      { lang: 'zh' },
      { lang: 'es' },
      { lang: 'fr' },
      {}  // 기본 옵션
    ];

    for (const option of languageOptions) {
      try {
        console.log(`🌐 언어 옵션 시도: ${JSON.stringify(option)}`);

        const transcript = await YoutubeTranscript.fetchTranscript(videoId, option);

        if (transcript && transcript.length > 0) {
          console.log('✅ youtube-transcript 성공:', transcript.length);

          const formattedSubtitle = transcript.map(item => {
            const minutes = Math.floor(item.offset / 60000);
            const seconds = Math.floor((item.offset % 60000) / 1000);
            const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
            return `${timeStr} ${item.text}`;
          }).join('\n');

          return {
            success: true,
            subtitle: formattedSubtitle,
            language: option.lang || 'auto-detected',
            language_code: option.lang || 'auto',
            is_generated: true,
            video_id: videoId,
            method: 'youtube-transcript-multi',
            language_option: JSON.stringify(option)
          };
        }
      } catch (error) {
        console.log(`⚠️ 언어 옵션 ${JSON.stringify(option)} 실패:`, error.message);
        continue;
      }
    }
  } catch (error) {
    console.log('⚠️ youtube-transcript 방법 실패:', error.message);
  }

  // 방법 3: ytdl-core로 비디오 정보만 가져와서 분석
  try {
    console.log('🎯 방법 3: ytdl-core 정보 분석');

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const basicInfo = await ytdl.getBasicInfo(videoUrl);

    console.log('📊 비디오 정보:', {
      title: basicInfo.videoDetails.title,
      author: basicInfo.videoDetails.author.name,
      lengthSeconds: basicInfo.videoDetails.lengthSeconds
    });

    // 추가 정보로 자막 가능성 체크
    if (basicInfo.videoDetails && basicInfo.videoDetails.keywords) {
      console.log('🏷️ 키워드:', basicInfo.videoDetails.keywords.slice(0, 5));
    }

  } catch (error) {
    console.log('⚠️ ytdl-core 정보 분석 실패:', error.message);
  }

  // 모든 방법 실패
  return {
    success: false,
    error: 'ALL_ADVANCED_METHODS_FAILED',
    message: '모든 고급 추출 방법이 실패했습니다. 이 영상은 자막이 없거나 접근이 제한되어 있습니다.',
    video_id: videoId
  };
}

// XML 자막 파싱 함수
function parseXMLSubtitles(xmlData) {
  try {
    // 간단한 XML 파싱 (정규식 사용)
    const textRegex = /<text[^>]*start="([^"]*)"[^>]*>(.*?)<\/text>/g;
    const subtitles = [];
    let match;

    while ((match = textRegex.exec(xmlData)) !== null) {
      const startTime = parseFloat(match[1]);
      const text = match[2]
        .replace(/<[^>]*>/g, '') // HTML 태그 제거
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
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
    console.error('XML 파싱 오류:', error);
    return null;
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
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    console.log('🚀 고급 자막 추출 요청:', { videoId, title });

    const result = await extractSubtitleAdvanced(videoId);
    console.log(`✅ 고급 자막 추출 완료: ${videoId}`, result.success ? '성공' : '실패');

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ 고급 자막 추출 오류:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message,
      stack: error.stack
    });
  }
};