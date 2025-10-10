const Anthropic = require('@anthropic-ai/sdk');
const mongoose = require('mongoose');
const { buildPrompt, validateTemplate } = require('../../utils/promptBuilder');

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
 * 블로그 글 생성 API (모듈화된 버전)
 * POST /api/blog/generate
 * Body: {
 *   subtitleText: string,
 *   videoTitle?: string,
 *   videoId: string,
 *   channelName?: string,
 *   userTemplate?: string | object,  // 사용자 정의 프롬프트 템플릿
 *   usePersona?: boolean              // persona.json 사용 여부 (기본: true)
 * }
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

    const {
      subtitleText,
      videoTitle,
      videoId,
      channelName,
      userTemplate,
      usePersona = true,
      model = 'claude-3-5-sonnet-20241022'
    } = req.body;

    // 입력 유효성 검사
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

    // 사용자 템플릿 유효성 검사
    if (userTemplate) {
      const validation = validateTemplate(userTemplate);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: `템플릿 유효성 검사 실패: ${validation.error}`
        });
      }
    }

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

    // 프롬프트 빌더로 프롬프트 생성
    console.log('🔨 프롬프트 빌더로 프롬프트 생성 중...');
    const { systemPrompt, userPrompt } = buildPrompt({
      subtitleText,
      videoTitle,
      videoId,
      channelName,
      userTemplate,
      usePersona
    });

    console.log('✅ 프롬프트 생성 완료');
    console.log('📝 시스템 프롬프트 길이:', systemPrompt.length);
    console.log('📝 사용자 프롬프트 길이:', userPrompt.length);

    console.log('🤖 Claude API 호출 시작...');
    console.log('📝 사용 모델:', model);

    // Claude API 호출
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: 8000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
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
