/**
 * 프롬프트 빌더 모듈
 *
 * 역할:
 * 1. persona.json 기반 기본 페르소나 로드
 * 2. 사용자 설정(blogPromptTemplate) 병합
 * 3. 자막 데이터와 함께 최종 프롬프트 생성
 */

const fs = require('fs');
const path = require('path');

/**
 * 기본 페르소나 데이터 로드
 */
function loadPersonaData() {
  try {
    const personaPath = path.join(process.cwd(), 'persona.json');
    return JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
  } catch (error) {
    console.warn('⚠️ persona.json을 로드할 수 없습니다. 기본값 사용:', error.message);
    return null;
  }
}

/**
 * 기본 시스템 프롬프트 템플릿
 */
const DEFAULT_SYSTEM_PROMPT = `당신은 유튜브 영상 자막을 개인 블로그 글로 변환하는 전문 작가입니다.

주요 임무:
1. 자막의 핵심 정보를 추출하고 재구성
2. 자연스러운 1인칭 경험담으로 작성
3. "영상에서 봤다", "유튜버가 말했다" 같은 메타 표현 금지
4. 모든 내용을 블로거가 직접 경험한 것처럼 작성

작성 원칙:
- 자막의 시간 순서를 따르되 자연스러운 스토리텔링으로 재구성
- 타임스탬프, [음악], [박수] 같은 메타 정보는 모두 제거
- 실용 정보(가격, 위치, 팁)는 반드시 포함`;

/**
 * 기본 사용자 스타일 템플릿
 */
const DEFAULT_USER_TEMPLATE = {
  role: "당신은 여행 블로그 전문 작가입니다.",
  style: "친근하고 생동감 있는 문체로 독자가 현장에 있는 듯한 느낌을 주는 글을 작성합니다.",
  structure: [
    "흥미로운 도입부로 독자의 관심을 끌어주세요",
    "여행지의 특징과 분위기를 생생하게 묘사해주세요",
    "실용적인 여행 정보(교통, 맛집, 추천 코스 등)를 포함해주세요",
    "개인적인 경험과 감상을 담아주세요",
    "독자에게 도움이 될 팁이나 주의사항을 언급해주세요"
  ],
  tone: "친근하고 따뜻한",
  format: "마크다운 형식",
  length: "2000-3000자 내외"
};

/**
 * 사용자 템플릿을 구조화된 프롬프트로 변환
 */
function formatUserTemplate(template) {
  if (typeof template === 'string') {
    // 문자열 형태의 템플릿은 그대로 사용
    return template;
  }

  // 객체 형태의 템플릿은 포맷팅
  return `${template.role}

**작성 스타일**: ${template.style}

**글 구조**:
${template.structure.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

**톤**: ${template.tone}
**형식**: ${template.format}
**분량**: ${template.length}`;
}

/**
 * 페르소나 기반 스타일 가이드 생성
 */
function buildPersonaStyleGuide(personaData) {
  if (!personaData || !personaData.persona) {
    return '';
  }

  const persona = personaData.persona;

  let guide = '\n\n## 페르소나 스타일 가이드\n\n';

  // 기본 정보
  if (persona.basic_info) {
    guide += `**블로거 정보**: ${persona.basic_info.name || '익명'} (${persona.basic_info.age || '연령 미상'})\n`;
  }

  // 성격 특성
  if (persona.personality_traits && persona.personality_traits.length > 0) {
    guide += `**성격**: ${persona.personality_traits.join(', ')}\n`;
  }

  // 작성 스타일
  if (persona.writing_style) {
    const style = persona.writing_style;
    guide += `\n**작성 톤**: ${style.tone}\n`;
    guide += `**문체**: ${style.sentence_style}\n`;

    if (style.frequently_used_expressions && style.frequently_used_expressions.length > 0) {
      guide += `**자주 사용하는 표현**: ${style.frequently_used_expressions.join(', ')}\n`;
    }

    if (style.prohibited_expressions && style.prohibited_expressions.length > 0) {
      guide += `**금지 표현**: ${style.prohibited_expressions.join(', ')}\n`;
    }
  }

  // 여행 철학
  if (persona.travel_philosophy) {
    guide += `\n**여행 철학**: ${persona.travel_philosophy}\n`;
  }

  // 관심사
  if (persona.focus_areas) {
    const areas = persona.focus_areas;
    guide += `\n**주요 관심사**: ${areas.high_interest?.join(', ') || '일반적인 여행 경험'}\n`;
  }

  return guide;
}

/**
 * 자막 전처리
 */
function cleanSubtitle(subtitle) {
  if (!subtitle) return '';

  // 타임스탬프 제거 ([00:00] 또는 0:00 형식)
  let cleaned = subtitle.replace(/\[?\d+:\d+\]?\s*/gm, '');

  // [음악], [박수] 등 메타 정보 제거
  cleaned = cleaned.replace(/\[.*?\]/g, '');

  // 연속된 빈 줄 정리
  cleaned = cleaned.replace(/\n\s*\n+/g, '\n\n');

  return cleaned.trim();
}

/**
 * 메인 프롬프트 빌더
 *
 * @param {Object} options
 * @param {string} options.subtitleText - 자막 텍스트
 * @param {string} options.videoTitle - 영상 제목
 * @param {string} options.videoId - 비디오 ID
 * @param {string} options.channelName - 채널명
 * @param {string|Object} options.userTemplate - 사용자 정의 템플릿 (선택)
 * @param {boolean} options.usePersona - persona.json 사용 여부 (기본: true)
 *
 * @returns {Object} { systemPrompt, userPrompt }
 */
function buildPrompt(options) {
  const {
    subtitleText,
    videoTitle = '여행 영상',
    videoId,
    channelName,
    userTemplate = null,
    usePersona = true
  } = options;

  // 1. 자막 전처리
  const cleanedSubtitle = cleanSubtitle(subtitleText);

  // 2. 페르소나 데이터 로드 (옵션)
  const personaData = usePersona ? loadPersonaData() : null;

  // 3. 시스템 프롬프트 구성
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;

  if (personaData) {
    systemPrompt += buildPersonaStyleGuide(personaData);
  }

  // 4. 사용자 프롬프트 구성
  let userPrompt = '# 작업 지시\n\n';

  // 사용자 정의 템플릿 또는 기본 템플릿
  if (userTemplate) {
    userPrompt += formatUserTemplate(userTemplate);
  } else {
    userPrompt += formatUserTemplate(DEFAULT_USER_TEMPLATE);
  }

  // 영상 정보
  userPrompt += `\n\n## 영상 정보\n`;
  userPrompt += `**제목**: ${videoTitle}\n`;
  if (channelName) {
    userPrompt += `**채널**: ${channelName}\n`;
  }

  // 자막 데이터
  userPrompt += `\n## 입력 자막\n\n\`\`\`\n${cleanedSubtitle}\n\`\`\`\n`;

  // 출력 요구사항
  userPrompt += `\n## 출력 요구사항\n\n`;
  userPrompt += `### 1. 글 구조\n`;
  userPrompt += `- **제목**: SEO 키워드 포함, 클릭 유도형, 25-40자\n`;
  userPrompt += `- **도입부**: 흥미를 끄는 오프닝 (2-3문단)\n`;
  userPrompt += `- **본문**: 4-6개 섹션으로 구성\n`;
  userPrompt += `  - 각 섹션: 소제목 + 본문(3-4문단) + 팁 박스(선택)\n`;
  userPrompt += `- **마무리**: 전체 소감 + 다음 계획/여운 (1-2문단)\n\n`;

  userPrompt += `### 2. 스타일 체크리스트\n`;
  userPrompt += `- 모든 문장이 1인칭 직접 경험으로 작성\n`;
  userPrompt += `- "~라고 한다", "~였다고 한다" 같은 전달 표현 절대 금지\n`;
  userPrompt += `- 타임스탬프, [음악] 등 메타 정보 완전 제거\n`;
  userPrompt += `- 실용적 팁 포함\n\n`;

  userPrompt += `마크다운 형식으로 완성된 블로그 글을 출력하세요.`;

  return {
    systemPrompt,
    userPrompt
  };
}

/**
 * 템플릿 유효성 검사
 */
function validateTemplate(template) {
  if (!template) return { valid: true };

  if (typeof template === 'string') {
    return {
      valid: template.trim().length > 0,
      error: template.trim().length === 0 ? '템플릿이 비어있습니다' : null
    };
  }

  if (typeof template === 'object') {
    const required = ['role', 'style', 'structure'];
    const missing = required.filter(key => !template[key]);

    return {
      valid: missing.length === 0,
      error: missing.length > 0 ? `필수 필드 누락: ${missing.join(', ')}` : null
    };
  }

  return {
    valid: false,
    error: '템플릿 형식이 올바르지 않습니다'
  };
}

module.exports = {
  buildPrompt,
  cleanSubtitle,
  loadPersonaData,
  validateTemplate,
  DEFAULT_USER_TEMPLATE
};
