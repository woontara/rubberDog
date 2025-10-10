const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// MongoDB 연결 캐싱
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI 환경 변수가 설정되지 않았습니다.');
  }

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  cachedDb = mongoose.connection;
  return cachedDb;
}

/**
 * 블로그 글 생성 API
 * POST /api/blog/generate
 * Body: { subtitleText: string, videoTitle: string, videoId: string, channelName: string }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // MongoDB 연결
    await connectToDatabase();

    const { subtitleText, videoTitle, videoId, channelName } = req.body;

    if (!subtitleText) {
      return res.status(400).json({
        success: false,
        error: '자막 텍스트가 필요합니다.'
      });
    }

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'videoId가 필요합니다.'
      });
    }

    // 페르소나 JSON 로드
    const personaPath = path.join(process.cwd(), 'persona.json');
    const personaData = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));

    // Claude API 키 확인 - 환경변수 디버깅
    console.log('🔍 환경변수 확인:', {
      hasANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      keyLength: process.env.ANTHROPIC_API_KEY?.length,
      keyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10)
    });

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY가 설정되지 않았습니다!');
      console.error('사용 가능한 환경변수:', Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('API')));
      return res.status(500).json({
        success: false,
        error: 'ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.',
        debug: {
          availableEnvVars: Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('API'))
        }
      });
    }

    // Claude API 클라이언트 초기화
    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY
    });

    // 자막 전처리
    const cleanedSubtitle = cleanSubtitle(subtitleText);

    // 시스템 프롬프트
    const systemPrompt = `당신은 유튜브 여행 영상 자막을 개인 여행 블로그 글로 변환하는 전문 작가입니다.

주요 임무:
1. 자막의 핵심 정보(장소, 음식, 가격, 경험)를 추출
2. 정의된 페르소나의 시각과 말투로 1인칭 경험담으로 재작성
3. "영상에서 봤다", "유튜버가 말했다" 같은 표현 절대 금지
4. 모든 내용을 블로거가 직접 경험한 것처럼 작성

작성 원칙:
- 자막의 시간 순서를 따르되 자연스러운 스토리텔링으로 재구성
- 타임스탬프, [음악], [박수] 같은 메타 정보는 모두 제거
- 페르소나의 성격과 일치하는 리액션과 감정 추가
- 실용 정보(가격, 위치, 팁)는 반드시 포함`;

    // 메인 프롬프트
    const mainPrompt = `# 작업 지시

다음 유튜브 여행 영상 자막을 아래 정의된 페르소나의 블로그 글로 변환하세요.

## 영상 제목
${videoTitle || '여행 영상'}

## 페르소나 정의
\`\`\`json
${JSON.stringify(personaData, null, 2)}
\`\`\`

## 입력 자막
\`\`\`
${cleanedSubtitle}
\`\`\`

## 출력 요구사항

### 1. 글 구조
- **제목**: SEO 키워드 포함, 클릭 유도형, 25-40자
- **도입부**: 페르소나의 오프닝 패턴 적용 (2-3문단)
- **본문**: 4-6개 섹션으로 구성
  - 각 섹션: 소제목 + 본문(3-4문단) + 팁 박스(선택)
- **마무리**: 전체 소감 + 다음 계획/여운 (1-2문단)
- **부가 정보**: 오늘의 지출, 총평

### 2. 소제목 작성 규칙
- 궁금증을 유발하는 형태
- 키워드 자연스럽게 포함

### 3. 스타일 체크리스트
- 모든 문장이 1인칭 직접 경험으로 작성
- 페르소나 시그니처 표현 자연스럽게 분포
- "~라고 한다", "~였다고 한다" 같은 전달 표현 절대 금지
- 타임스탬프, [음악] 등 메타 정보 완전 제거
- 실용적 팁 포함

### 4. 금지 사항
- "영상에서 봤는데"
- "유튜버가 말하길"
- "촬영 중에"
- "~라고 소개했다"
- "~였다고 한다"

### 5. 톤 & 매너
- 문장 길이: 짧은 문장과 긴 문장 믹스
- 감정 표현: 직접적이고 솔직하게
- 독자와의 거리: 친구에게 말하듯 편안하게

마크다운 형식으로 완성된 블로그 글을 출력하세요.`;

    console.log('🤖 Claude API 호출 시작...');

    // Claude API 호출
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: mainPrompt
        }
      ]
    });

    const blogContent = message.content[0].text;

    console.log('✅ 블로그 글 생성 완료!');

    // MongoDB에 저장
    const BlogPost = require('../../models/BlogPost');
    const blogPost = await BlogPost.create({
      videoId: videoId,
      videoTitle: videoTitle,
      channelName: channelName || '알 수 없음',
      blogContent: blogContent,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      }
    });

    console.log('💾 블로그 글이 데이터베이스에 저장되었습니다.');

    return res.status(200).json({
      success: true,
      blogContent: blogContent,
      blogPostId: blogPost._id,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      }
    });

  } catch (error) {
    console.error('❌ 블로그 생성 오류:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 자막 전처리: 타임스탬프, [음악] 등 제거
 */
function cleanSubtitle(subtitle) {
  // 타임스탬프 제거 (0:00 형식)
  let cleaned = subtitle.replace(/^\d+:\d+\n/gm, '');

  // [음악], [박수] 등 메타 정보 제거
  cleaned = cleaned.replace(/\[.*?\]/g, '');

  // 연속된 빈 줄 정리
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');

  return cleaned.trim();
}
