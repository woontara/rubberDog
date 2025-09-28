# Vercel 배포 가이드

RubberDog YouTube 자막 추출 시스템을 Vercel에 배포하는 방법입니다.

## 🚀 배포 설정

### 1. Vercel 설정 파일
`vercel.json`이 이미 구성되어 있습니다:
- Node.js 18.x 런타임 사용
- API 라우트 자동 감지
- 정적 파일 서빙 설정

### 2. 환경 변수 설정
Vercel 대시보드에서 다음 환경 변수를 설정하세요:

```
ANTHROPIC_API_KEY=your_claude_api_key_here
NODE_ENV=production
```

### 3. 배포 명령어
```bash
# Vercel CLI 설치
npm install -g vercel

# 프로젝트 배포
vercel

# 프로덕션 배포
vercel --prod
```

## 🔧 기술적 변경사항

### JavaScript 자막 추출
Vercel은 서버리스 환경이므로 Python 스크립트를 직접 실행할 수 없습니다.
대신 `youtube-transcript` JavaScript 라이브러리를 사용합니다:

- **로컬 개발**: Python 스크립트 우선 사용, 실패시 JavaScript로 폴백
- **Vercel 프로덕션**: JavaScript만 사용

### API 엔드포인트
- 메인 API: `/api/subtitle.js` (Vercel 전용)
- 기존 API: `/api/youtube/subtitle` (통합 서버용)

## 📝 API 사용법

### Vercel 배포 후 사용
```bash
# GET 요청
curl "https://your-vercel-app.vercel.app/api/subtitle?videoId=VIDEO_ID"

# POST 요청
curl -X POST "https://your-vercel-app.vercel.app/api/subtitle" \
  -H "Content-Type: application/json" \
  -d '{"videoId": "VIDEO_ID"}'
```

### 지원하는 매개변수
- `videoId`: YouTube 비디오 ID (11자리)
- `url`: 전체 YouTube URL

## 🧪 테스트된 기능

✅ **한국어 자막 추출**: 자동 생성 및 수동 자막 모두 지원
✅ **다국어 지원**: ko, en, ja 등 다양한 언어
✅ **타임스탬프**: `[mm:ss]` 형식으로 시간 정보 포함
✅ **오류 처리**: 명확한 오류 메시지와 상태 코드
✅ **CORS 지원**: 웹 앱에서 직접 호출 가능

## 🔍 문제 해결

### 자막 추출 실패시
1. 영상에 자막이 있는지 YouTube에서 직접 확인
2. 영상이 공개 상태인지 확인
3. 비디오 ID가 정확한지 확인

### Vercel 배포 오류시
1. Node.js 버전 확인 (18.x 이상)
2. 환경 변수 설정 확인
3. 빌드 로그에서 오류 메시지 확인

## 📊 성능

- **응답 시간**: 일반적으로 1-3초
- **동시 요청**: Vercel 무료 플랜에서 100 동시 실행
- **제한사항**: YouTube API 제한에 따라 달라질 수 있음

## 🔗 관련 링크

- [Vercel 공식 문서](https://vercel.com/docs)
- [youtube-transcript NPM](https://www.npmjs.com/package/youtube-transcript)
- [YouTube Transcript API](https://github.com/jdepoix/youtube-transcript-api)