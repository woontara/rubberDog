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

// 직접 yt-dlp 바이너리 사용 (진짜 yt-dlp)
async function extractSubtitleDirectYTDLP(videoId) {
  try {
    console.log('🔧 직접 yt-dlp 바이너리로 자막 추출 시도:', videoId);

    const { spawn } = require('child_process');
    const path = require('path');

    // Windows에서는 python, Vercel에서는 python, Linux에서는 python3
    const pythonCmd = 'python';

    return new Promise((resolve, reject) => {
      // yt-dlp로 자막 목록 먼저 확인
      const listProcess = spawn(pythonCmd, [
        '-m', 'yt_dlp',
        '--list-subs',
        '--no-download',
        `https://www.youtube.com/watch?v=${videoId}`
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let listOutput = '';
      let listError = '';

      listProcess.stdout.on('data', (data) => {
        listOutput += data.toString();
      });

      listProcess.stderr.on('data', (data) => {
        listError += data.toString();
      });

      listProcess.on('close', (listCode) => {
        console.log('📋 자막 목록 조회 완료. 종료 코드:', listCode);
        console.log('📄 자막 목록:', listOutput);

        if (listCode !== 0) {
          console.error('❌ 자막 목록 조회 실패:', listError);
          resolve({
            success: false,
            error: 'YTDLP_LIST_ERROR',
            message: `yt-dlp 자막 목록 조회 실패: ${listError}`,
            method: 'yt-dlp-binary'
          });
          return;
        }

        // 사용 가능한 자막 언어 확인
        const koreanAvailable = listOutput.includes('ko') || listOutput.includes('Korean');
        const englishAvailable = listOutput.includes('en') || listOutput.includes('English');

        console.log('🇰🇷 한국어 자막 사용 가능:', koreanAvailable);
        console.log('🇺🇸 영어 자막 사용 가능:', englishAvailable);

        // 자막 다운로드 언어 우선순위: 한국어 > 영어 > auto
        let subLang = 'en';
        if (koreanAvailable) {
          subLang = 'ko';
        } else if (englishAvailable) {
          subLang = 'en';
        }

        console.log('🎯 선택된 자막 언어:', subLang);

        // 실제 자막 다운로드
        const downloadProcess = spawn(pythonCmd, [
          '-m', 'yt_dlp',
          '--write-subs',
          '--write-auto-subs',
          '--sub-lang', subLang,
          '--sub-format', 'vtt',
          '--skip-download',
          '--no-playlist',
          '--output', `temp_subtitle_${videoId}.%(ext)s`,
          `https://www.youtube.com/watch?v=${videoId}`
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let downloadOutput = '';
        let downloadError = '';

        downloadProcess.stdout.on('data', (data) => {
          downloadOutput += data.toString();
        });

        downloadProcess.stderr.on('data', (data) => {
          downloadError += data.toString();
        });

        downloadProcess.on('close', (downloadCode) => {
          console.log('📥 자막 다운로드 완료. 종료 코드:', downloadCode);
          console.log('📄 다운로드 출력:', downloadOutput);

          if (downloadCode !== 0) {
            console.error('❌ 자막 다운로드 실패:', downloadError);
            resolve({
              success: false,
              error: 'YTDLP_DOWNLOAD_ERROR',
              message: `yt-dlp 자막 다운로드 실패: ${downloadError}`,
              method: 'yt-dlp-binary'
            });
            return;
          }

          // 다운로드된 자막 파일 읽기
          const fs = require('fs');
          const subtitleFiles = [
            `temp_subtitle_${videoId}.${subLang}.vtt`,
            `temp_subtitle_${videoId}.vtt`,
            `temp_subtitle_${videoId}.${subLang}.auto.vtt`
          ];

          let subtitleContent = null;
          let usedFile = null;

          for (const filename of subtitleFiles) {
            try {
              if (fs.existsSync(filename)) {
                subtitleContent = fs.readFileSync(filename, 'utf8');
                usedFile = filename;
                console.log('✅ 자막 파일 읽기 성공:', filename);
                break;
              }
            } catch (readError) {
              console.warn('⚠️ 파일 읽기 실패:', filename, readError.message);
            }
          }

          if (!subtitleContent) {
            resolve({
              success: false,
              error: 'NO_SUBTITLE_FILE',
              message: '자막 파일을 찾을 수 없습니다.',
              method: 'yt-dlp-binary',
              attempted_files: subtitleFiles
            });
            return;
          }

          // VTT 파싱
          const parsedSubtitle = parseVTTSubtitles(subtitleContent);

          // 임시 파일 정리
          subtitleFiles.forEach(filename => {
            try {
              if (fs.existsSync(filename)) {
                fs.unlinkSync(filename);
              }
            } catch (cleanupError) {
              console.warn('⚠️ 임시 파일 정리 실패:', filename);
            }
          });

          if (parsedSubtitle) {
            console.log('🎉 yt-dlp 바이너리로 자막 추출 성공!');
            resolve({
              success: true,
              video_id: videoId,
              subtitle: parsedSubtitle,
              method: 'yt-dlp-binary',
              language: subLang === 'ko' ? '한국어' : '영어',
              language_code: subLang,
              format: 'vtt',
              file_used: usedFile,
              timestamp: new Date().toISOString()
            });
          } else {
            resolve({
              success: false,
              error: 'VTT_PARSE_ERROR',
              message: 'VTT 자막 파싱에 실패했습니다.',
              method: 'yt-dlp-binary'
            });
          }
        });
      });
    });

  } catch (error) {
    console.error('❌ yt-dlp 바이너리 오류:', error);
    return {
      success: false,
      error: 'YTDLP_BINARY_ERROR',
      message: `yt-dlp 바이너리 실행 오류: ${error.message}`,
      method: 'yt-dlp-binary'
    };
  }
}

// VTT 자막 파싱 함수
function parseVTTSubtitles(vttData) {
  try {
    console.log('🔍 VTT 파싱 시작 - 데이터 길이:', vttData.length);

    const lines = vttData.split('\n');
    const subtitles = [];
    let currentText = '';
    let inCue = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // VTT 타임스탬프 라인 감지 (예: 00:00:01.000 --> 00:00:05.000)
      if (line.includes('-->')) {
        const timeParts = line.split('-->');
        if (timeParts.length === 2) {
          const startTime = timeParts[0].trim();
          const timeMatch = startTime.match(/(\d{2}):(\d{2}):(\d{2})/);
          if (timeMatch) {
            const minutes = timeMatch[1];
            const seconds = timeMatch[2];
            const timeStr = `[${minutes}:${seconds}]`;
            currentText = timeStr + ' ';
            inCue = true;
          }
        }
      }
      // 자막 텍스트 라인
      else if (inCue && line && !line.match(/^\d+$/)) {
        // HTML 태그 제거 및 텍스트 정리
        const cleanText = line.replace(/<[^>]*>/g, '').trim();
        if (cleanText) {
          currentText += cleanText + ' ';
        }
      }
      // 빈 라인 (자막 구간 종료)
      else if (inCue && !line) {
        if (currentText.trim()) {
          subtitles.push(currentText.trim());
        }
        currentText = '';
        inCue = false;
      }
    }

    // 마지막 자막 처리
    if (currentText.trim()) {
      subtitles.push(currentText.trim());
    }

    console.log(`✅ VTT 파싱 완료: ${subtitles.length}개 자막 세그먼트`);
    return subtitles.length > 0 ? subtitles.join('\n') : null;

  } catch (error) {
    console.error('❌ VTT 파싱 오류:', error);
    return null;
  }
}

// Vercel 서버리스 함수 (AWS Lambda 프록시)
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
    console.log('🎬 자막 추출 요청 (AWS Lambda 프록시):', { videoId, title });

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // Vercel 환경에서는 AWS Lambda 호출
    if (isVercelEnvironment()) {
      console.log('🌩️ AWS Lambda로 요청 전달...');
      const result = await callAWSLambda(videoId, title);
      res.status(200).json(result);
    } else {
      // 로컬 환경에서는 기존 yt-dlp 직접 호출
      console.log('🔄 로컬 환경: yt-dlp 바이너리로 자막 추출 시도...');
      const result = await extractSubtitleDirectYTDLP(videoId);
      res.status(200).json(result);
    }

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

// AWS Lambda 호출 함수
async function callAWSLambda(videoId, title) {
  try {
    console.log('📡 AWS Lambda API 호출 시작...');

    // AWS Lambda API Gateway URL (배포 후 업데이트 필요)
    const lambdaUrl = process.env.AWS_LAMBDA_SUBTITLE_URL ||
                     'https://your-lambda-api-gateway-url.amazonaws.com/prod/extract-subtitle';

    const requestBody = {
      videoId: videoId,
      title: title || `Video_${videoId}`
    };

    console.log('🚀 Lambda 요청 데이터:', requestBody);

    const response = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Lambda API 호출 실패: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Lambda 응답 수신:', result.success ? '성공' : '실패');

    return result;

  } catch (error) {
    console.error('❌ AWS Lambda 호출 오류:', error);
    return {
      success: false,
      error: 'LAMBDA_API_ERROR',
      message: `AWS Lambda 호출 실패: ${error.message}`,
      method: 'aws-lambda-proxy',
      timestamp: new Date().toISOString()
    };
  }
}