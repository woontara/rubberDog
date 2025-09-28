// 하이브리드 YouTube 자막 추출 API (Python + JavaScript 폴백)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// JavaScript 폴백을 위한 youtube-transcript 라이브러리
let YoutubeTranscript;
try {
  YoutubeTranscript = require('youtube-transcript').YoutubeTranscript;
} catch (e) {
  console.log('youtube-transcript 라이브러리를 찾을 수 없음, Python만 사용');
}

// JavaScript로 자막 추출 (Vercel 환경용) - 다중 언어 시도
async function extractSubtitleWithJS(videoId) {
  try {
    console.log('🔧 API: JavaScript로 자막 추출 시작:', videoId);

    if (!YoutubeTranscript) {
      throw new Error('youtube-transcript 라이브러리가 설치되지 않음');
    }

    // 시도할 언어 옵션들 (순서대로 시도)
    const languageOptions = [
      { lang: 'ko', country: 'KR' }, // 한국어 + 국가 코드
      { lang: 'ko' },                // 한국어만
      { lang: 'en' },                // 영어
      { lang: 'ja' },                // 일본어
      { lang: 'zh' },                // 중국어
      {},                            // 기본 옵션 (자동 감지)
    ];

    let lastError = null;

    // 각 언어 옵션을 순차적으로 시도
    for (const option of languageOptions) {
      try {
        console.log('🌐 API: 언어 옵션 시도:', JSON.stringify(option));

        const transcript = await YoutubeTranscript.fetchTranscript(videoId, option);

        if (transcript && transcript.length > 0) {
          console.log('✅ API: 자막 추출 성공, 자막 수:', transcript.length);

          // 자막을 시간 포맷으로 변환
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
            method: 'javascript-youtube-transcript',
            language_option: JSON.stringify(option)
          };
        }
      } catch (error) {
        console.log(`⚠️ API: 언어 옵션 ${JSON.stringify(option)} 실패:`, error.message);
        lastError = error;
        continue; // 다음 옵션 시도
      }
    }

    // 모든 옵션이 실패한 경우
    throw lastError || new Error('모든 언어 옵션 실패');

  } catch (error) {
    console.error('API: JavaScript 자막 추출 실패:', error.message);

    // 더 자세한 오류 분석
    let errorCode = 'JS_EXTRACTION_FAILED';
    let userMessage = 'JavaScript 자막 추출 실패';

    if (error.message.includes('Transcript is disabled')) {
      errorCode = 'TRANSCRIPT_DISABLED';
      userMessage = '이 영상의 자막이 비활성화되어 있습니다';
    } else if (error.message.includes('No transcripts found')) {
      errorCode = 'NO_TRANSCRIPTS';
      userMessage = '이 영상에 사용 가능한 자막이 없습니다';
    } else if (error.message.includes('Video unavailable')) {
      errorCode = 'VIDEO_UNAVAILABLE';
      userMessage = '영상을 찾을 수 없습니다';
    } else if (error.message.includes('Could not extract')) {
      errorCode = 'EXTRACTION_ERROR';
      userMessage = 'YouTube 보안 정책으로 인해 자막 추출이 제한되었습니다';
    }

    return {
      success: false,
      error: errorCode,
      message: `${userMessage}: ${error.message}`,
      video_id: videoId
    };
  }
}

// Python 스크립트를 사용한 자막 추출
async function extractSubtitleWithPython(videoId) {
  return new Promise((resolve, reject) => {
    console.log('🐍 API: Python으로 자막 추출 시작:', videoId);

    // Python 스크립트 경로 확인
    const pythonScript = path.join(process.cwd(), 'youtube_subtitle_real.py');

    // 파일 존재 확인
    if (!fs.existsSync(pythonScript)) {
      console.log('Python 스크립트 파일이 없음, JavaScript로 폴백');
      resolve({
        success: false,
        error: 'PYTHON_SCRIPT_NOT_FOUND',
        message: 'Python 스크립트를 찾을 수 없음',
        video_id: videoId
      });
      return;
    }

    const pythonProcess = spawn('python', [pythonScript, 'subtitle', videoId], {
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
      console.log(`🐍 API: Python 스크립트 종료. 코드: ${code}`);

      if (code !== 0) {
        console.error('API: Python 스크립트 오류:', stderr);
        resolve({
          success: false,
          error: 'PYTHON_ERROR',
          message: `Python 실행 실패: ${stderr || 'Unknown error'}`,
          video_id: videoId
        });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        console.log('📝 API: Python 자막 추출 결과:', result.subtitle ? '성공' : '실패');

        if (result.error) {
          resolve({
            success: false,
            error: result.error,
            message: result.error,
            video_id: videoId
          });
        } else {
          resolve({
            success: true,
            subtitle: result.subtitle,
            language: result.language,
            language_code: result.language_code,
            is_generated: result.is_generated,
            video_id: result.video_id,
            method: 'python-youtube-transcript-api'
          });
        }
      } catch (parseError) {
        console.error('API: JSON 파싱 오류:', parseError);
        console.error('API: Python 출력:', stdout);
        resolve({
          success: false,
          error: 'PARSE_ERROR',
          message: `결과 파싱 실패: ${parseError.message}`,
          video_id: videoId
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('API: Python 프로세스 오류:', error);
      resolve({
        success: false,
        error: 'PROCESS_ERROR',
        message: `Python 프로세스 실행 실패: ${error.message}`,
        video_id: videoId
      });
    });
  });
}

// 환경 감지 및 최적 방법 선택
function isVercelEnvironment() {
  return process.env.VERCEL || process.env.NODE_ENV === 'production';
}

// 통합 자막 추출 함수
async function extractSubtitle(videoId) {
  console.log('🎯 API: 환경 감지:', isVercelEnvironment() ? 'Vercel/Production' : 'Local');

  // Vercel 환경에서는 JavaScript만 사용
  if (isVercelEnvironment()) {
    console.log('☁️ API: Vercel 환경 감지, JavaScript 사용');
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
    const { videoId, title } = req.body;
    console.log('🎬 API: 자막 추출 요청:', { videoId, title });

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // 환경에 따른 최적 방법으로 자막 추출
    const result = await extractSubtitle(videoId);
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