// 하이브리드 YouTube 자막 추출 API (Python + JavaScript 폴백)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// JavaScript 폴백을 위한 라이브러리들
let YoutubeTranscript;
let ytdl;
let fetch;
let Innertube;
let playwright;

try {
  YoutubeTranscript = require('youtube-transcript').YoutubeTranscript;
  ytdl = require('@distube/ytdl-core');
  fetch = require('node-fetch');
  const { Innertube: InnertubeClass } = require('youtubei.js');
  playwright = require('playwright');
  Innertube = InnertubeClass;
  console.log('✅ 모든 JavaScript 라이브러리 로드 완료 (Innertube + Playwright 포함)');
} catch (e) {
  console.log('⚠️ 일부 JavaScript 라이브러리 로드 실패:', e.message);
}

// JavaScript로 자막 추출 (강력한 5단계 방법)
async function extractSubtitleWithJS(videoId) {
  console.log('🚀 강력한 JavaScript 자막 추출 시작:', videoId);

  // 방법 -1: Playwright 브라우저 자동화로 실제 브라우저처럼 접근
  if (playwright) {
    try {
      console.log('🎯 방법 -1: Playwright 브라우저 자동화 시도');

      const browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      console.log('🌐 Playwright: YouTube 페이지 로딩 중...');
      await page.goto(videoUrl, { waitUntil: 'networkidle' });

      // 쿠키 동의 처리
      try {
        await page.click('[aria-label="Accept all"], button:has-text("Accept all"), button:has-text("모두 허용")', { timeout: 3000 });
      } catch (e) {
        console.log('🍪 쿠키 동의 버튼 없음 또는 이미 처리됨');
      }

      // 자막 버튼 클릭
      console.log('🎬 Playwright: 자막 활성화 시도');
      await page.waitForSelector('video', { timeout: 10000 });

      // 자막 버튼 찾기 및 클릭
      try {
        await page.click('button[aria-label*="Subtitles"], button[aria-label*="자막"], .ytp-subtitles-button', { timeout: 5000 });
        console.log('✅ Playwright: 자막 버튼 클릭 성공');
      } catch (e) {
        console.log('⚠️ Playwright: 자막 버튼을 찾을 수 없음');
      }

      // 잠시 대기 후 자막 텍스트 수집
      await page.waitForTimeout(3000);

      // 페이지에서 자막 관련 데이터 추출
      const subtitleData = await page.evaluate(() => {
        // 자막 DOM 요소들 찾기
        const captionElements = document.querySelectorAll('.caption-window, .ytp-caption-segment, .captions-text, [class*="caption"], [class*="subtitle"]');

        if (captionElements.length > 0) {
          return Array.from(captionElements).map(el => el.textContent.trim()).filter(text => text);
        }

        // 네트워크 요청에서 자막 URL 찾기 (더 고급 방법)
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
          if (script.textContent && script.textContent.includes('captionTracks')) {
            try {
              const match = script.textContent.match(/"captionTracks":\s*(\[.*?\])/);
              if (match) {
                const tracks = JSON.parse(match[1]);
                return { captionTracks: tracks };
              }
            } catch (e) {
              continue;
            }
          }
        }

        return null;
      });

      await browser.close();

      if (subtitleData) {
        if (Array.isArray(subtitleData)) {
          console.log('🎉 Playwright 방법으로 DOM 자막 추출 성공!');
          const formattedSubtitle = subtitleData.map((text, index) => {
            const timeStr = `[${Math.floor(index * 3 / 60).toString().padStart(2, '0')}:${(index * 3 % 60).toString().padStart(2, '0')}]`;
            return `${timeStr} ${text}`;
          }).join('\n');

          return {
            success: true,
            subtitle: formattedSubtitle,
            language: 'auto-detected',
            language_code: 'auto',
            is_generated: true,
            video_id: videoId,
            method: 'playwright-dom-extraction'
          };
        } else if (subtitleData.captionTracks) {
          console.log('🎉 Playwright 방법으로 자막 트랙 발견!');

          // 한국어 우선 검색
          let track = subtitleData.captionTracks.find(t =>
            t.languageCode === 'ko' || t.languageCode === 'ko-KR'
          );

          if (!track) {
            track = subtitleData.captionTracks[0];
          }

          if (track && track.baseUrl) {
            try {
              const response = await fetch(track.baseUrl);
              const xmlData = await response.text();
              const subtitleText = parseXMLSubtitles(xmlData);

              if (subtitleText) {
                return {
                  success: true,
                  subtitle: subtitleText,
                  language: track.name?.simpleText || 'Unknown',
                  language_code: track.languageCode,
                  is_generated: track.kind === 'asr',
                  video_id: videoId,
                  method: 'playwright-caption-tracks'
                };
              }
            } catch (e) {
              console.log('⚠️ Playwright: 자막 URL 페치 실패:', e.message);
            }
          }
        }
      }

    } catch (error) {
      console.log('⚠️ Playwright 방법 실패:', error.message);
    }
  }

  // 방법 0: youtubei.js (Innertube)로 YouTube 내부 API 직접 접근
  if (Innertube) {
    try {
      console.log('🎯 방법 0: youtubei.js Innertube 내부 API 시도');

      const yt = await Innertube.create();
      const info = await yt.getInfo(videoId);

      if (info.captions && info.captions.caption_tracks) {
        console.log('✅ Innertube: 자막 트랙 발견:', info.captions.caption_tracks.length);

        // 한국어 자막 우선 검색
        let caption = info.captions.caption_tracks.find(track =>
          track.language_code === 'ko' || track.language_code === 'ko-KR'
        );

        // 한국어가 없으면 첫 번째 자막
        if (!caption) {
          caption = info.captions.caption_tracks[0];
        }

        if (caption) {
          console.log('🌐 Innertube 자막 트랙 발견:', caption.language_code);

          const transcript = await caption.fetch();
          if (transcript && transcript.length > 0) {
            console.log('🎉 Innertube 방법으로 자막 추출 성공!');

            const formattedSubtitle = transcript.map(item => {
              const startTime = Math.floor(item.start_time / 1000);
              const minutes = Math.floor(startTime / 60);
              const seconds = startTime % 60;
              const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
              return `${timeStr} ${item.text}`;
            }).join('\n');

            return {
              success: true,
              subtitle: formattedSubtitle,
              language: caption.name || 'Unknown',
              language_code: caption.language_code,
              is_generated: caption.kind === 'asr',
              video_id: videoId,
              method: 'youtubei-js-innertube'
            };
          }
        }
      }
    } catch (error) {
      console.log('⚠️ youtubei.js Innertube 방법 실패:', error.message);
    }
  }

  // 방법 1: ytdl-core로 직접 자막 API 접근
  if (ytdl && fetch) {
    try {
      console.log('🎯 방법 1: ytdl-core 직접 자막 추출 시도');

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
            const response = await fetch(captionTrack.baseUrl);
            const xmlData = await response.text();

            // XML 파싱
            const subtitleText = parseXMLSubtitles(xmlData);

            if (subtitleText) {
              console.log('🎉 ytdl-core 방법으로 자막 추출 성공!');
              return {
                success: true,
                subtitle: subtitleText,
                language: captionTrack.name ? captionTrack.name.simpleText : 'Unknown',
                language_code: captionTrack.languageCode,
                is_generated: captionTrack.kind === 'asr',
                video_id: videoId,
                method: 'ytdl-core-direct-api'
              };
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠️ ytdl-core 방법 실패:', error.message);
    }
  }

  // 방법 2: youtube-transcript 다중 언어 시도
  if (YoutubeTranscript) {
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
        { lang: 'de' },
        {}  // 기본 옵션
      ];

      for (const option of languageOptions) {
        try {
          console.log(`🌐 언어 옵션 시도: ${JSON.stringify(option)}`);

          const transcript = await YoutubeTranscript.fetchTranscript(videoId, option);

          if (transcript && transcript.length > 0) {
            console.log('🎉 youtube-transcript 방법으로 자막 추출 성공!');

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
  }

  // 방법 3: ytdl-core 기본 정보로 분석
  if (ytdl) {
    try {
      console.log('🎯 방법 3: ytdl-core 기본 정보 분석');

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const basicInfo = await ytdl.getBasicInfo(videoUrl);

      console.log('📊 비디오 정보:', {
        title: basicInfo.videoDetails.title,
        author: basicInfo.videoDetails.author.name,
        lengthSeconds: basicInfo.videoDetails.lengthSeconds
      });

    } catch (error) {
      console.log('⚠️ ytdl-core 기본 정보 분석 실패:', error.message);
    }
  }

  // 모든 방법 실패
  console.error('❌ 모든 JavaScript 방법 실패');
  return {
    success: false,
    error: 'ALL_JS_METHODS_FAILED',
    message: '모든 JavaScript 자막 추출 방법이 실패했습니다. 이 영상은 자막이 없거나 접근이 제한되어 있습니다.',
    video_id: videoId,
    attempted_methods: ['youtubei-js-innertube', 'ytdl-core-direct', 'youtube-transcript-multi', 'ytdl-core-basic']
  };
}

// XML 자막 파싱 함수
function parseXMLSubtitles(xmlData) {
  try {
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

// Python 스크립트를 사용한 자막 추출 (다중 fallback)
async function extractSubtitleWithPython(videoId) {
  console.log('🐍 API: Python으로 자막 추출 시작:', videoId);

  // 우선순위별 Python 스크립트 목록
  const pythonScripts = [
    {
      name: 'youtube_subtitle_transcript_api.py',
      description: 'YouTube Transcript API (우선 방법)',
      args: [videoId]
    },
    {
      name: 'youtube_subtitle_real.py',
      description: '기존 자막 추출 스크립트',
      args: ['subtitle', videoId]
    }
  ];

  // 각 Python 스크립트를 순차적으로 시도
  for (const script of pythonScripts) {
    const result = await tryPythonScript(script, videoId);
    if (result.success) {
      console.log(`✅ API: ${script.description} 성공`);
      return result;
    } else {
      console.log(`⚠️ API: ${script.description} 실패:`, result.message);
    }
  }

  // 모든 Python 스크립트 실패
  console.log('❌ API: 모든 Python 방법 실패');
  return {
    success: false,
    error: 'ALL_PYTHON_METHODS_FAILED',
    message: '모든 Python 자막 추출 방법이 실패했습니다',
    video_id: videoId
  };
}

// 개별 Python 스크립트 실행 함수
async function tryPythonScript(scriptInfo, videoId) {
  return new Promise((resolve) => {
    const pythonScript = path.join(process.cwd(), scriptInfo.name);

    // 파일 존재 확인
    if (!fs.existsSync(pythonScript)) {
      console.log(`Python 스크립트 ${scriptInfo.name} 파일이 없음`);
      resolve({
        success: false,
        error: 'PYTHON_SCRIPT_NOT_FOUND',
        message: `Python 스크립트 ${scriptInfo.name}을 찾을 수 없음`,
        video_id: videoId
      });
      return;
    }

    console.log(`🎯 API: ${scriptInfo.description} 시도`);

    const pythonProcess = spawn('python', [pythonScript, ...scriptInfo.args], {
      encoding: 'utf8'
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    pythonProcess.on('close', (code) => {
      console.log(`🐍 API: ${scriptInfo.name} 종료. 코드: ${code}`);

      if (code !== 0) {
        console.error(`API: ${scriptInfo.name} 오류:`, stderr);
        resolve({
          success: false,
          error: 'PYTHON_ERROR',
          message: `${scriptInfo.name} 실행 실패: ${stderr || 'Unknown error'}`,
          video_id: videoId
        });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        console.log(`📝 API: ${scriptInfo.name} 결과:`, result.success ? '성공' : '실패');

        if (result.success) {
          resolve({
            success: true,
            subtitle: result.subtitle,
            language: result.language || result.language_name,
            language_code: result.language_code,
            is_generated: result.is_generated,
            video_id: result.video_id,
            method: result.method || `python-${scriptInfo.name}`,
            segments_count: result.segments_count
          });
        } else {
          resolve({
            success: false,
            error: result.error,
            message: result.message || result.error,
            video_id: videoId
          });
        }
      } catch (parseError) {
        console.error(`API: ${scriptInfo.name} JSON 파싱 오류:`, parseError);
        console.error(`API: ${scriptInfo.name} 출력:`, stdout);
        resolve({
          success: false,
          error: 'PARSE_ERROR',
          message: `${scriptInfo.name} 결과 파싱 실패: ${parseError.message}`,
          video_id: videoId
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error(`API: ${scriptInfo.name} 프로세스 오류:`, error);
      resolve({
        success: false,
        error: 'PROCESS_ERROR',
        message: `${scriptInfo.name} 프로세스 실행 실패: ${error.message}`,
        video_id: videoId
      });
    });
  });
}

// 환경 감지 및 최적 방법 선택
function isVercelEnvironment() {
  return process.env.VERCEL || process.env.NODE_ENV === 'production';
}

// 쿠키를 사용한 자막 추출 함수
async function extractSubtitleWithCookies(videoId, cookies) {
  console.log('🍪 쿠키 기반 자막 추출 시작:', videoId);

  const fs = require('fs');
  const os = require('os');
  const tempDir = os.tmpdir();
  const cookieFile = path.join(tempDir, `yt_cookies_${videoId}_${Date.now()}.txt`);

  try {
    // 쿠키 파일 생성
    fs.writeFileSync(cookieFile, cookies, 'utf8');
    console.log('🍪 쿠키 파일 생성 완료:', cookieFile);

    // Python 스크립트로 쿠키 기반 추출 시도
    return new Promise((resolve) => {
      const pythonScript = path.join(__dirname, '../../youtube_subtitle_real.py');
      const ytdlpPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

      console.log('🐍 쿠키 파일과 함께 Python 스크립트 실행');

      const python = spawn('python', [pythonScript, videoId, '--cookies', cookieFile], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        console.log(`🍪 Python 쿠키 추출 완료, 종료 코드: ${code}`);

        // 쿠키 파일 정리
        try {
          fs.unlinkSync(cookieFile);
          console.log('🧹 쿠키 파일 정리 완료');
        } catch (e) {
          console.log('⚠️ 쿠키 파일 정리 실패:', e.message);
        }

        if (code === 0 && output.trim()) {
          try {
            const result = JSON.parse(output.trim());
            console.log('✅ 쿠키 기반 자막 추출 성공');
            resolve({
              success: true,
              subtitles: result.subtitles || result.subtitle || result,
              method: 'python_with_cookies',
              videoId: videoId
            });
            return;
          } catch (parseError) {
            console.log('⚠️ 쿠키 기반 JSON 파싱 실패:', parseError.message);
          }
        }

        console.log('❌ 쿠키 기반 자막 추출 실패');
        console.log('Error output:', errorOutput);
        resolve({
          success: false,
          error: `쿠키 기반 추출 실패: ${errorOutput || '알 수 없는 오류'}`,
          method: 'python_with_cookies'
        });
      });

      python.on('error', (error) => {
        console.log('❌ 쿠키 기반 Python 프로세스 오류:', error.message);

        // 쿠키 파일 정리
        try {
          fs.unlinkSync(cookieFile);
        } catch (e) {}

        resolve({
          success: false,
          error: `쿠키 기반 Python 실행 오류: ${error.message}`,
          method: 'python_with_cookies'
        });
      });
    });

  } catch (error) {
    console.log('❌ 쿠키 파일 생성 오류:', error.message);

    // 쿠키 파일 정리
    try {
      fs.unlinkSync(cookieFile);
    } catch (e) {}

    return {
      success: false,
      error: `쿠키 파일 생성 오류: ${error.message}`,
      method: 'python_with_cookies'
    };
  }
}

// 경량 자막 추출 함수 (Vercel 환경용 - 의존성 없음)
async function extractSubtitleLite(videoId) {
  console.log('🚀 Lite: 경량 자막 추출 시작:', videoId);

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
    };

    console.log('🌐 Lite: YouTube 페이지 요청 중...');
    const response = await fetch(videoUrl, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log('📄 Lite: HTML 로드 완료, 자막 추출 중...');

    // 자막 트랙 정보 추출
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);

    if (captionTracksMatch) {
      try {
        const captionTracks = JSON.parse(captionTracksMatch[1]);
        console.log('✅ Lite: 자막 트랙 발견:', captionTracks.length);

        // 한국어 우선, 없으면 첫 번째
        let track = captionTracks.find(t => t.languageCode === 'ko' || t.languageCode === 'ko-KR') || captionTracks[0];

        if (track && track.baseUrl) {
          console.log('🌐 Lite: 자막 URL 발견:', track.languageCode);

          const captionResponse = await fetch(track.baseUrl, { headers });
          const xmlData = await captionResponse.text();
          const subtitle = parseXMLSubtitlesLite(xmlData);

          if (subtitle) {
            console.log('🎉 Lite: 자막 추출 성공!');
            return {
              success: true,
              subtitle,
              language: track.name?.simpleText || 'Unknown',
              language_code: track.languageCode,
              is_generated: track.kind === 'asr',
              video_id: videoId,
              method: 'lite-youtube-api',
              segments_count: subtitle.split('\n').length
            };
          }
        }
      } catch (parseError) {
        console.log('⚠️ Lite: 자막 파싱 실패:', parseError.message);
      }
    }

    return {
      success: false,
      error: 'NO_CAPTIONS_FOUND_LITE',
      message: '이 영상에는 자막이 없거나 접근할 수 없습니다 (Lite)',
      video_id: videoId,
      method: 'lite-youtube-api'
    };

  } catch (error) {
    console.error('❌ Lite: 자막 추출 실패:', error.message);
    return {
      success: false,
      error: 'LITE_EXTRACTION_FAILED',
      message: `Lite 자막 추출 실패: ${error.message}`,
      video_id: videoId,
      method: 'lite-youtube-api'
    };
  }
}

// 경량 XML 파싱 함수
function parseXMLSubtitlesLite(xmlData) {
  try {
    const textRegex = /<text[^>]*start="([^"]*)"[^>]*>(.*?)<\/text>/g;
    const subtitles = [];
    let match;

    while ((match = textRegex.exec(xmlData)) !== null) {
      const startTime = parseFloat(match[1]);
      let text = match[2]
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
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
    console.error('❌ Lite: XML 파싱 오류:', error);
    return null;
  }
}

// 통합 자막 추출 함수
async function extractSubtitle(videoId, cookies = null) {
  console.log('🎯 API: 환경 감지:', isVercelEnvironment() ? 'Vercel/Production' : 'Local');
  console.log('🍪 API: 쿠키 상태:', cookies ? '제공됨' : '없음');

  // 쿠키가 제공된 경우 쿠키 기반 방법 우선 시도
  if (cookies) {
    console.log('🍪 API: 쿠키 기반 추출 시도');
    const cookieResult = await extractSubtitleWithCookies(videoId, cookies);
    if (cookieResult.success) {
      return cookieResult;
    }
    console.log('⚠️ API: 쿠키 기반 실패, 기본 방법으로 폴백');
  }

  // Vercel 환경에서는 경량 API 우선 시도
  if (isVercelEnvironment()) {
    console.log('☁️ API: Vercel 환경 감지, 경량 API 시도');

    const liteResult = await extractSubtitleLite(videoId);
    if (liteResult.success) {
      console.log('✅ API: 경량 API 성공');
      return liteResult;
    }

    console.log('🔄 API: 경량 API 실패, JavaScript 폴백');
    return await extractSubtitleWithJS(videoId);
  }

  // 로컬 환경에서는 Python 우선, 실패시 JavaScript 폴백
  console.log('🏠 API: 로컬 환경, Python 우선 시도');
  const pythonResult = await extractSubtitleWithPython(videoId);

  if (pythonResult.success) {
    return pythonResult;
  }

  console.log('🔄 API: Python 실패, JavaScript로 폴백');
  return await extractSubtitleWithJS(videoId);
}

// Vercel/Netlify 서버리스 함수
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
    console.log('🎬 API: 자막 추출 요청:', { videoId, title, hasCookies: !!cookies });

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // 환경에 따른 최적 방법으로 자막 추출 (쿠키 포함)
    const result = await extractSubtitle(videoId, cookies);
    console.log(`✅ API: 자막 추출 완료: ${videoId}`, result.success ? '성공' : '실패');

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ API: 자막 추출 오류:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message,
      stack: error.stack
    });
  }
};