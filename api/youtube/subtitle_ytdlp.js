// yt-dlp를 사용한 YouTube 자막 추출 API
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// fetch polyfill for older Node.js versions
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (error) {
  console.warn('Fetch not available:', error.message);
}

// yt-dlp를 사용한 자막 추출 함수
async function extractSubtitleWithYtDlp(videoId) {
  return new Promise((resolve, reject) => {
    console.log('🚀 yt-dlp로 자막 추출 시작:', videoId);

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 임시 디렉토리 생성
    const tempDir = path.join(process.cwd(), 'temp_subtitles');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // yt-dlp 명령어 설정 - 자막만 다운로드
    const ytdlpArgs = [
      '--write-subs',           // 자막 다운로드
      '--write-auto-subs',      // 자동 생성 자막도 다운로드
      '--sub-langs', 'ko,en,ja,zh,all',  // 언어 우선순위 (한국어 우선)
      '--skip-download',        // 비디오는 다운로드하지 않음
      '--output', path.join(tempDir, '%(title)s.%(ext)s'),  // 출력 경로
      '--no-warnings',          // 경고 메시지 숨김
      '--quiet',               // 조용한 모드
      videoUrl
    ];

    console.log('🔧 yt-dlp 명령어 실행:', ytdlpArgs.join(' '));

    const ytdlpProcess = spawn('yt-dlp', ytdlpArgs, {
      encoding: 'utf8',
      cwd: tempDir
    });

    let stdout = '';
    let stderr = '';

    ytdlpProcess.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    ytdlpProcess.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    ytdlpProcess.on('close', (code) => {
      console.log(`🏁 yt-dlp 프로세스 종료. 코드: ${code}`);

      try {
        // 다운로드된 자막 파일 찾기
        const files = fs.readdirSync(tempDir);
        const subtitleFiles = files.filter(file =>
          file.includes('.vtt') || file.includes('.srt') || file.includes('.ass')
        );

        console.log('📁 생성된 자막 파일들:', subtitleFiles);

        if (subtitleFiles.length > 0) {
          // 언어 우선순위: 한국어 -> 영어 -> 기타
          let selectedFile = subtitleFiles.find(file => file.includes('.ko.')) ||
                           subtitleFiles.find(file => file.includes('.en.')) ||
                           subtitleFiles[0];

          console.log('📝 선택된 자막 파일:', selectedFile);

          const subtitlePath = path.join(tempDir, selectedFile);
          const subtitleContent = fs.readFileSync(subtitlePath, 'utf8');

          // 자막 파일 파싱
          const parsedSubtitle = parseSubtitleFile(subtitleContent, selectedFile);

          // 임시 파일들 정리
          subtitleFiles.forEach(file => {
            try {
              fs.unlinkSync(path.join(tempDir, file));
            } catch (e) {
              console.log('파일 삭제 중 오류:', file, e.message);
            }
          });

          if (parsedSubtitle) {
            console.log('🎉 yt-dlp로 자막 추출 성공!');
            resolve({
              success: true,
              subtitle: parsedSubtitle,
              language: detectLanguageFromFilename(selectedFile),
              language_code: extractLanguageCode(selectedFile),
              is_generated: selectedFile.includes('auto'),
              video_id: videoId,
              method: 'yt-dlp',
              subtitle_file: selectedFile
            });
          } else {
            resolve({
              success: false,
              error: 'PARSE_ERROR',
              message: '자막 파일 파싱에 실패했습니다.',
              video_id: videoId
            });
          }
        } else {
          console.log('❌ 자막 파일이 생성되지 않았습니다');
          console.log('stderr:', stderr);
          resolve({
            success: false,
            error: 'NO_SUBTITLE_FILES',
            message: '이 영상에는 자막이 없거나 다운로드할 수 없습니다.',
            video_id: videoId,
            stderr: stderr
          });
        }
      } catch (error) {
        console.error('❌ 자막 파일 처리 오류:', error);
        resolve({
          success: false,
          error: 'FILE_ERROR',
          message: `자막 파일 처리 실패: ${error.message}`,
          video_id: videoId
        });
      }
    });

    ytdlpProcess.on('error', (error) => {
      console.error('❌ yt-dlp 프로세스 오류:', error);
      resolve({
        success: false,
        error: 'PROCESS_ERROR',
        message: `yt-dlp 실행 실패: ${error.message}`,
        video_id: videoId
      });
    });
  });
}

// 자막 파일 파싱 함수
function parseSubtitleFile(content, filename) {
  try {
    if (filename.includes('.vtt')) {
      return parseVTT(content);
    } else if (filename.includes('.srt')) {
      return parseSRT(content);
    } else {
      // 기본적으로 VTT로 시도
      return parseVTT(content);
    }
  } catch (error) {
    console.error('자막 파싱 오류:', error);
    return null;
  }
}

// VTT 파싱
function parseVTT(vttContent) {
  const lines = vttContent.split('\n');
  const subtitles = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 시간 코드 라인 찾기 (예: 00:00:01.000 --> 00:00:03.000)
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timeMatch) {
        const startTime = timeMatch[1];
        const text = [];

        // 다음 라인들에서 텍스트 수집
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          const textLine = lines[i].trim();
          if (textLine && !textLine.startsWith('NOTE') && !textLine.startsWith('WEBVTT')) {
            text.push(textLine);
          }
          i++;
        }
        i--; // 루프에서 i++가 있으므로 하나 빼기

        if (text.length > 0) {
          const timeStr = `[${startTime.substring(0, 8)}]`;
          subtitles.push(`${timeStr} ${text.join(' ')}`);
        }
      }
    }
  }

  return subtitles.length > 0 ? subtitles.join('\n') : null;
}

// SRT 파싱
function parseSRT(srtContent) {
  const blocks = srtContent.split('\n\n');
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length >= 3) {
      // 첫 번째 라인은 번호, 두 번째는 시간, 나머지는 텍스트
      const timeLine = lines[1];
      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

      if (timeMatch) {
        const startTime = timeMatch[1].replace(',', '.');
        const text = lines.slice(2).join(' ').trim();

        if (text) {
          const timeStr = `[${startTime.substring(0, 8)}]`;
          subtitles.push(`${timeStr} ${text}`);
        }
      }
    }
  }

  return subtitles.length > 0 ? subtitles.join('\n') : null;
}

// 파일명에서 언어 감지
function detectLanguageFromFilename(filename) {
  if (filename.includes('.ko.')) return 'Korean';
  if (filename.includes('.en.')) return 'English';
  if (filename.includes('.ja.')) return 'Japanese';
  if (filename.includes('.zh.')) return 'Chinese';
  return 'Unknown';
}

// 파일명에서 언어 코드 추출
function extractLanguageCode(filename) {
  const match = filename.match(/\.([a-z]{2})\.(?:vtt|srt|ass)/);
  return match ? match[1] : 'auto';
}

// Vercel/Production 환경에서 웹 API 방식으로 자막 추출
async function extractSubtitleWithWebAPI(videoId) {
  console.log('🌐 웹 API 방식으로 자막 추출 시작:', videoId);

  try {
    // YouTube Data API를 사용한 자막 정보 조회
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // fetch를 사용해서 YouTube 페이지 HTML 가져오기
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // HTML에서 자막 트랙 정보 추출
    const captionTrackRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = html.match(captionTrackRegex);

    if (!match) {
      return {
        success: false,
        error: 'NO_CAPTIONS_FOUND',
        message: '이 영상에는 자막 정보를 찾을 수 없습니다.',
        video_id: videoId,
        method: 'web-api'
      };
    }

    try {
      const captionTracks = JSON.parse(match[1]);
      console.log('📊 발견된 자막 트랙 수:', captionTracks.length);

      if (captionTracks.length === 0) {
        return {
          success: false,
          error: 'NO_CAPTION_TRACKS',
          message: '이 영상에는 자막 트랙이 없습니다.',
          video_id: videoId,
          method: 'web-api'
        };
      }

      // 한국어 자막 우선 검색
      let selectedTrack = captionTracks.find(track =>
        track.languageCode === 'ko' || track.languageCode === 'ko-KR'
      );

      // 한국어가 없으면 영어
      if (!selectedTrack) {
        selectedTrack = captionTracks.find(track =>
          track.languageCode === 'en' || track.languageCode === 'en-US'
        );
      }

      // 그것도 없으면 첫 번째
      if (!selectedTrack) {
        selectedTrack = captionTracks[0];
      }

      console.log('🎯 선택된 자막 트랙:', selectedTrack.languageCode, selectedTrack.name?.simpleText || 'Unknown');

      // 자막 URL에서 실제 자막 데이터 가져오기
      const subtitleResponse = await fetch(selectedTrack.baseUrl);
      if (!subtitleResponse.ok) {
        throw new Error(`자막 데이터 가져오기 실패: ${subtitleResponse.status}`);
      }

      const xmlData = await subtitleResponse.text();
      const parsedSubtitle = parseXMLSubtitles(xmlData);

      if (parsedSubtitle) {
        console.log('🎉 웹 API 방식으로 자막 추출 성공!');
        return {
          success: true,
          subtitle: parsedSubtitle,
          language: selectedTrack.name?.simpleText || 'Unknown',
          language_code: selectedTrack.languageCode,
          is_generated: selectedTrack.kind === 'asr',
          video_id: videoId,
          method: 'web-api-html-parsing',
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
          method: 'web-api'
        };
      }

    } catch (parseError) {
      console.error('❌ 자막 트랙 JSON 파싱 오류:', parseError);
      return {
        success: false,
        error: 'JSON_PARSE_ERROR',
        message: `자막 트랙 정보 파싱 실패: ${parseError.message}`,
        video_id: videoId,
        method: 'web-api'
      };
    }

  } catch (error) {
    console.error('❌ 웹 API 자막 추출 오류:', error);
    return {
      success: false,
      error: 'WEB_API_ERROR',
      message: `웹 API 자막 추출 실패: ${error.message}`,
      video_id: videoId,
      method: 'web-api'
    };
  }
}

// XML 자막 파싱 함수 (웹 API용)
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
    console.error('XML 파싱 오류:', error);
    return null;
  }
}

// 환경 감지
function isVercelEnvironment() {
  return process.env.VERCEL || process.env.NODE_ENV === 'production';
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
    console.log('🎬 yt-dlp API: 자막 추출 요청:', { videoId, title });

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // Vercel 환경에서는 웹 기반 yt-dlp API 사용
    if (isVercelEnvironment()) {
      console.log('☁️ Vercel 환경 감지, 웹 API 방식 사용');
      const result = await extractSubtitleWithWebAPI(videoId);
      console.log(`✅ 웹 API 자막 추출 완료: ${videoId}`, result.success ? '성공' : '실패');
      res.status(200).json(result);
      return;
    }

    // yt-dlp로 자막 추출
    const result = await extractSubtitleWithYtDlp(videoId);
    console.log(`✅ yt-dlp API: 자막 추출 완료: ${videoId}`, result.success ? '성공' : '실패');

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ yt-dlp API: 자막 추출 오류:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message,
      stack: error.stack
    });
  }
};