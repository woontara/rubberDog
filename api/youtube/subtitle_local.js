// 로컬 환경 전용 yt-dlp 자막 다운로드 API
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 환경 감지
function isLocalEnvironment() {
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production';
}

// yt-dlp를 사용한 로컬 자막 다운로드
async function downloadSubtitleLocal(videoId, language = 'en') {
  console.log('🎬 로컬 환경에서 yt-dlp로 자막 다운로드:', videoId, language);

  if (!isLocalEnvironment()) {
    throw new Error('이 API는 로컬 환경에서만 사용할 수 있습니다.');
  }

  return new Promise((resolve, reject) => {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 임시 디렉토리 생성
    const tempDir = path.join(process.cwd(), 'temp_subtitles');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // yt-dlp 자막 다운로드 명령어
    const outputPath = path.join(tempDir, `${videoId}_subtitle.%(ext)s`);
    const ytdlpArgs = [
      '--write-subs',           // 자막 다운로드
      '--write-auto-subs',      // 자동 생성 자막도 포함
      '--sub-langs', `${language},en,ja,ko`, // 언어 우선순위
      '--skip-download',        // 비디오는 다운로드하지 않음
      '--output', outputPath,
      '--quiet',               // 조용한 모드
      videoUrl
    ];

    console.log('🔧 yt-dlp 명령어:', 'yt-dlp', ytdlpArgs.join(' '));

    const ytdlpProcess = spawn('yt-dlp', ytdlpArgs, {
      cwd: tempDir,
      encoding: 'utf8'
    });

    let stdout = '';
    let stderr = '';

    ytdlpProcess.stdout.on('data', (data) => {
      stdout += data;
    });

    ytdlpProcess.stderr.on('data', (data) => {
      stderr += data;
    });

    ytdlpProcess.on('close', (code) => {
      if (code === 0) {
        // 다운로드된 자막 파일 찾기
        const files = fs.readdirSync(tempDir).filter(file =>
          file.startsWith(`${videoId}_subtitle.`) && (file.endsWith('.vtt') || file.endsWith('.srt'))
        );

        if (files.length > 0) {
          const subtitleFile = path.join(tempDir, files[0]);
          const subtitleContent = fs.readFileSync(subtitleFile, 'utf8');

          // 임시 파일 정리
          fs.unlinkSync(subtitleFile);

          // VTT를 간단한 텍스트로 변환
          const parsedSubtitle = parseVTTSubtitle(subtitleContent);

          console.log('🎉 로컬 자막 다운로드 성공:', files[0]);
          resolve({
            success: true,
            subtitle: parsedSubtitle,
            format: files[0].split('.').pop(),
            language: extractLanguageFromFilename(files[0]),
            video_id: videoId,
            method: 'local-yt-dlp',
            file_downloaded: files[0]
          });
        } else {
          reject(new Error('자막 파일을 찾을 수 없습니다.'));
        }
      } else {
        console.error('❌ yt-dlp 오류:', stderr);
        reject(new Error(`yt-dlp 실행 실패: ${stderr}`));
      }
    });

    ytdlpProcess.on('error', (error) => {
      console.error('❌ yt-dlp 프로세스 오류:', error);
      reject(error);
    });
  });
}

// VTT 자막을 텍스트로 변환
function parseVTTSubtitle(vttContent) {
  try {
    const lines = vttContent.split('\n');
    const subtitles = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 시간 코드 라인 찾기 (예: 00:00:00.967 --> 00:00:03.470)
      if (line.includes(' --> ')) {
        const [startTime, endTime] = line.split(' --> ');
        const startSeconds = timeToSeconds(startTime);

        // 다음 라인들에서 자막 텍스트 수집
        let textLines = [];
        for (let j = i + 1; j < lines.length; j++) {
          const textLine = lines[j].trim();
          if (textLine === '' || textLine.includes(' --> ')) {
            break;
          }
          if (textLine !== 'WEBVTT' && !textLine.startsWith('Kind:') && !textLine.startsWith('Language:')) {
            textLines.push(textLine);
          }
        }

        if (textLines.length > 0) {
          const minutes = Math.floor(startSeconds / 60);
          const seconds = Math.floor(startSeconds % 60);
          const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
          subtitles.push(`${timeStr} ${textLines.join(' ')}`);
        }
      }
    }

    return subtitles.length > 0 ? subtitles.join('\n') : null;
  } catch (error) {
    console.error('VTT 파싱 오류:', error);
    return null;
  }
}

// 시간 문자열을 초로 변환
function timeToSeconds(timeStr) {
  try {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  } catch (error) {
    return 0;
  }
}

// 파일명에서 언어 추출
function extractLanguageFromFilename(filename) {
  const match = filename.match(/\.([a-z]{2}(-[A-Z]{2})?)\.vtt$/);
  return match ? match[1] : 'unknown';
}

// Express.js / Node.js 서버용 핸들러
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

  // 로컬 환경 검증
  if (!isLocalEnvironment()) {
    res.status(403).json({
      success: false,
      error: 'LOCAL_ONLY',
      message: '이 API는 로컬 환경에서만 사용할 수 있습니다.'
    });
    return;
  }

  try {
    const { videoId, language = 'en', title } = req.body;
    console.log('🎬 로컬 자막 다운로드 요청:', { videoId, language, title });

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // 로컬 yt-dlp로 자막 다운로드
    const result = await downloadSubtitleLocal(videoId, language);
    console.log(`✅ 로컬 자막 다운로드 완료: ${videoId}`);

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ 로컬 자막 다운로드 오류:', error);
    res.status(500).json({
      success: false,
      error: 'LOCAL_DOWNLOAD_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};