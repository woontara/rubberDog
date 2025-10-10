/**
 * 스케줄러 설정 파일
 * YouTube 채널 자동 수집을 위한 설정
 */

module.exports = {
  // 스케줄 실행 시각 (24시간 형식)
  schedule: {
    // 실행 횟수 (하루 2회)
    frequency: 2,

    // 실행 시각 (시:분)
    times: [
      { hour: 9, minute: 0 },   // 오전 9시
      { hour: 21, minute: 0 }   // 오후 9시
    ],

    // Vercel Cron 표현식 (UTC 기준, 한국시간 -9시간)
    // 한국시간 09:00 = UTC 00:00
    // 한국시간 21:00 = UTC 12:00
    cronExpressions: [
      '0 0 * * *',   // 매일 UTC 00:00 (한국시간 09:00)
      '0 12 * * *'   // 매일 UTC 12:00 (한국시간 21:00)
    ]
  },

  // 하루 할당량
  quota: {
    // 하루 최대 채널 수집 개수
    dailyChannelLimit: 100,

    // 1회 실행당 최대 채널 수집 개수
    perRunLimit: 50,

    // YouTube API 쿼터 제한 (참고용)
    youtubeApiQuotaLimit: 10000
  },

  // 검색 키워드 설정
  searchKeywords: [
    // 기본 여행 키워드
    '여행 브이로그',
    '해외여행',
    'travel vlog korea',
    '여행 유튜버',

    // 지역별 키워드 - 아시아
    '일본 여행',
    '도쿄 여행',
    '오사카 여행',
    '태국 여행',
    '방콕 여행',
    '푸켓 여행',
    '베트남 여행',
    '다낭 여행',
    '하노이 여행',
    '대만 여행',
    '타이페이 여행',
    '싱가포르 여행',
    '홍콩 여행',
    '마카오 여행',
    '필리핀 여행',
    '발리 여행',

    // 지역별 키워드 - 유럽
    '유럽 여행',
    '프랑스 여행',
    '파리 여행',
    '이탈리아 여행',
    '로마 여행',
    '스페인 여행',
    '바르셀로나 여행',
    '영국 여행',
    '런던 여행',
    '독일 여행',
    '스위스 여행',
    '체코 여행',
    '프라하 여행',

    // 지역별 키워드 - 미주
    '미국 여행',
    '뉴욕 여행',
    'LA 여행',
    '캐나다 여행',
    '멕시코 여행',
    '하와이 여행',

    // 지역별 키워드 - 오세아니아
    '호주 여행',
    '시드니 여행',
    '뉴질랜드 여행',

    // 지역별 키워드 - 기타
    '두바이 여행',
    '터키 여행',
    '이집트 여행',

    // 여행 스타일 키워드
    '배낭여행',
    '자유여행',
    '패키지여행',
    '세계여행',
    '장기여행',
    '여행 일상',
    '커플여행',
    '가족여행',
    '먹방 여행'
  ],

  // 채널 필터링 조건
  filters: {
    // 구독자 수 범위
    subscriberCount: {
      min: 500,
      max: 900000
    },

    // 언어 (한국어 채널만)
    language: 'ko',

    // 국가
    country: 'KR',

    // 영상 개수 (무관 = 0)
    videoCount: {
      min: 0
    },

    // 활동 여부 (무관 = null)
    recentActivityDays: null
  },

  // API 설정
  api: {
    // YouTube Data API v3
    youtube: {
      // 검색 결과 페이지당 개수
      maxResultsPerPage: 50,

      // 검색 타입
      searchType: 'channel',

      // 정렬 순서
      order: 'relevance', // relevance, viewCount, rating

      // 지역 코드
      regionCode: 'KR'
    }
  },

  // 재시도 설정
  retry: {
    // 최대 재시도 횟수
    maxAttempts: 3,

    // 재시도 대기 시간 (밀리초)
    delayMs: 1000,

    // 지수 백오프 사용 여부
    exponentialBackoff: true
  },

  // 로깅 설정
  logging: {
    // 로그 레벨 (debug, info, warn, error)
    level: 'info',

    // 상세 로그 출력 여부
    verbose: false,

    // 수집 결과 저장
    saveResults: true
  }
};
