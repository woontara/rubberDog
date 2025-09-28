// yt-dlp 통합 자막 추출 시스템
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// yt-dlp를 사용한 자막 추출 함수
async function extractSubtitleWithYtdlp(videoId, preferredLangs = ['ko', 'en']) {
  console.log(`🎬 yt-dlp로 자막 추출 시작: ${videoId}`);

  for (const lang of preferredLangs) {
    try {
      console.log(`🔄 ${lang} 언어로 시도 중...`);

      // yt-dlp 명령어 구성
      const command = [
        'yt-dlp',
        '--skip-download',           // 영상 다운로드 건너뛰기
        '--write-auto-subs',         // 자동 생성 자막 포함
        '--write-subs',              // 수동 자막 포함
        '--sub-langs', lang,         // 언어 지정
        '--convert-subs', 'srt',     // SRT 형식으로 변환
        '--output', '%(title)s.%(ext)s',
        '--print', 'subtitle:%(filepath)s',  // 자막 파일 경로 출력
        `https://www.youtube.com/watch?v=${videoId}`
      ].join(' ');

      console.log(`📝 실행 명령어: ${command}`);

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,              // 30초 타임아웃
        encoding: 'utf8'
      });

      console.log(`📊 stdout: ${stdout}`);
      if (stderr) console.log(`⚠️ stderr: ${stderr}`);

      // stdout에서 자막 내용 추출
      if (stdout && stdout.trim()) {
        console.log(`✅ yt-dlp로 ${lang} 자막 추출 성공!`);

        return {
          success: true,
          subtitle: stdout.trim(),
          language: lang === 'ko' ? 'Korean' : 'English',
          language_code: lang,
          is_generated: true,
          video_id: videoId,
          method: 'yt-dlp',
          note: `yt-dlp를 사용하여 ${lang} 자막을 성공적으로 추출했습니다.`
        };
      }

    } catch (error) {
      console.log(`❌ ${lang} 언어 yt-dlp 실패: ${error.message}`);

      // 다음 언어로 계속 시도
      continue;
    }
  }

  // 모든 언어 시도 실패
  return {
    success: false,
    error: 'YTDLP_EXTRACTION_FAILED',
    message: `yt-dlp로 자막 추출에 실패했습니다. 시도한 언어: ${preferredLangs.join(', ')}`,
    attempted_languages: preferredLangs,
    video_id: videoId
  };
}

// 간단한 yt-dlp 자막 추출 (stdout 방식)
async function extractSubtitleSimple(videoId, lang = 'en') {
  console.log(`🔄 간단한 yt-dlp 자막 추출: ${videoId} (${lang})`);

  try {
    // 더 간단한 명령어로 시도
    const command = `yt-dlp --skip-download --write-auto-subs --sub-langs ${lang} --convert-subs srt --print "%(subtitles.${lang}.0.url)s" "https://www.youtube.com/watch?v=${videoId}"`;

    console.log(`📝 간단 명령어: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      timeout: 20000,
      encoding: 'utf8'
    });

    if (stdout && stdout.includes('http')) {
      console.log(`✅ 자막 URL 획득: ${stdout.trim()}`);

      // 자막 URL에서 내용 다운로드
      const subtitleUrl = stdout.trim();
      const downloadCmd = `curl -s "${subtitleUrl}"`;

      const { stdout: subtitleContent } = await execAsync(downloadCmd, {
        timeout: 10000,
        encoding: 'utf8'
      });

      if (subtitleContent && subtitleContent.length > 50) {
        console.log(`✅ 자막 내용 다운로드 성공!`);

        return {
          success: true,
          subtitle: subtitleContent.trim(),
          language: lang === 'ko' ? 'Korean' : 'English',
          language_code: lang,
          is_generated: true,
          video_id: videoId,
          method: 'yt-dlp-simple',
          note: `yt-dlp URL 방식으로 ${lang} 자막을 성공적으로 추출했습니다.`
        };
      }
    }

    throw new Error('자막 URL을 찾을 수 없습니다.');

  } catch (error) {
    console.log(`❌ 간단 yt-dlp 실패: ${error.message}`);

    return {
      success: false,
      error: 'SIMPLE_YTDLP_FAILED',
      message: `간단한 yt-dlp 방식으로 자막 추출에 실패했습니다: ${error.message}`,
      video_id: videoId
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
    const { videoId } = req.body;

    if (!videoId) {
      res.status(400).json({ error: 'videoId is required' });
      return;
    }

    console.log(`🎬 yt-dlp 자막 추출 요청: ${videoId}`);

    // 1차 시도: 표준 yt-dlp 방식
    let result = await extractSubtitleWithYtdlp(videoId, ['ko', 'en']);

    if (!result.success) {
      // 2차 시도: 간단한 URL 방식
      console.log(`🔄 2차 시도: 간단한 방식...`);
      result = await extractSubtitleSimple(videoId, 'en');
    }

    res.status(200).json(result);

  } catch (error) {
    console.error('yt-dlp 자막 추출 API 오류:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: `서버 오류가 발생했습니다: ${error.message}`,
      detailed_error: error.message
    });
  }
};