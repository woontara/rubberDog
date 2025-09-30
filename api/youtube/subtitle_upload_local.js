// D드라이브 로컬 파일 저장 방식 자막 업로드 API
const fs = require('fs').promises;
const path = require('path');

// D드라이브 저장 경로 설정
const STORAGE_DIR = 'D:\\RubberDog\\subtitles';

// 디렉토리가 없으면 생성
async function ensureDirectory() {
  try {
    await fs.access(STORAGE_DIR);
  } catch (error) {
    // 디렉토리가 없으면 생성
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    console.log('📁 저장 디렉토리 생성:', STORAGE_DIR);
  }
}

// 자막 데이터를 로컬 파일에 저장
async function saveSubtitleToLocal(subtitleData) {
  try {
    await ensureDirectory();

    const filename = `${subtitleData.video_id}_${Date.now()}.json`;
    const filepath = path.join(STORAGE_DIR, filename);

    const dataToSave = {
      ...subtitleData,
      saved_at: new Date().toISOString(),
      storage_type: 'local_file'
    };

    await fs.writeFile(filepath, JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log('💾 자막 로컬 저장 완료:', filepath);

    return {
      success: true,
      message: '자막이 D드라이브에 저장되었습니다.',
      file_path: filepath,
      storage_type: 'local_file'
    };

  } catch (error) {
    console.error('❌ 로컬 저장 오류:', error);
    throw error;
  }
}

// 저장된 자막 데이터 조회
async function getSubtitleFromLocal(videoId) {
  try {
    await ensureDirectory();

    // 디렉토리의 모든 파일 조회
    const files = await fs.readdir(STORAGE_DIR);

    // 해당 비디오 ID로 시작하는 파일들 찾기
    const matchingFiles = files.filter(file =>
      file.startsWith(videoId) && file.endsWith('.json')
    );

    if (matchingFiles.length === 0) {
      return null;
    }

    // 가장 최근 파일 선택 (파일명에 타임스탬프 포함)
    const latestFile = matchingFiles.sort().pop();
    const filepath = path.join(STORAGE_DIR, latestFile);

    const data = await fs.readFile(filepath, 'utf8');
    const subtitleData = JSON.parse(data);

    console.log('📖 로컬 자막 조회 성공:', filepath);
    return subtitleData;

  } catch (error) {
    console.error('❌ 로컬 조회 오류:', error);
    return null;
  }
}

// 모든 저장된 자막 목록 조회
async function getAllSubtitlesFromLocal() {
  try {
    await ensureDirectory();

    const files = await fs.readdir(STORAGE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const subtitles = [];
    for (const file of jsonFiles) {
      try {
        const filepath = path.join(STORAGE_DIR, file);
        const data = await fs.readFile(filepath, 'utf8');
        const subtitleData = JSON.parse(data);
        subtitles.push({
          video_id: subtitleData.video_id,
          title: subtitleData.title,
          saved_at: subtitleData.saved_at,
          file_path: filepath,
          success: subtitleData.success
        });
      } catch (err) {
        console.warn('파일 읽기 실패:', file, err.message);
      }
    }

    // 저장 시간 순 정렬 (최신순)
    subtitles.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));

    return subtitles;

  } catch (error) {
    console.error('❌ 전체 목록 조회 오류:', error);
    return [];
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

  try {
    if (req.method === 'POST') {
      // 자막 저장
      const subtitleData = req.body;

      if (!subtitleData.video_id) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_VIDEO_ID',
          message: 'video_id가 필요합니다.'
        });
      }

      const result = await saveSubtitleToLocal(subtitleData);
      res.status(200).json(result);

    } else if (req.method === 'GET') {
      const { video_id } = req.query;

      if (video_id) {
        // 특정 비디오 자막 조회
        const subtitleData = await getSubtitleFromLocal(video_id);

        if (subtitleData) {
          res.status(200).json({
            success: true,
            data: subtitleData,
            storage_type: 'local_file'
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: '저장된 자막을 찾을 수 없습니다.',
            storage_type: 'local_file'
          });
        }
      } else {
        // 전체 자막 목록 조회
        const allSubtitles = await getAllSubtitlesFromLocal();
        res.status(200).json({
          success: true,
          data: allSubtitles,
          count: allSubtitles.length,
          storage_type: 'local_file',
          storage_path: STORAGE_DIR
        });
      }
    } else {
      res.status(405).json({
        success: false,
        error: 'METHOD_NOT_ALLOWED',
        message: 'POST 또는 GET 메서드만 지원됩니다.'
      });
    }

  } catch (error) {
    console.error('❌ API 오류:', error);
    res.status(500).json({
      success: false,
      error: 'LOCAL_STORAGE_ERROR',
      message: `로컬 저장소 오류: ${error.message}`,
      timestamp: new Date().toISOString(),
      storage_type: 'local_file'
    });
  }
};