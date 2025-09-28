# RubberDog (러버독)

YouTube 트렌드 분석 및 블로그 자동화 도구 - YouTube trend analysis and blog automation tool

## 개요 (Overview)

RubberDog은 유튜브에서 인기가 급상승하는 해외 여행 관련 채널을 자동으로 탐색하고, 해당 채널의 인기 콘텐츠를 분석하여 유사한 주제의 블로그 글을 자동으로 생성 및 발행하는 자동화 툴입니다.

RubberDog automatically discovers trending travel-related YouTube channels, analyzes their popular content, and generates similar blog posts automatically.

## 주요 기능 (Key Features)

- 🔍 **YouTube 채널 자동 탐색** - Automatic YouTube channel discovery
- 📊 **콘텐츠 분석 및 글감 생성** - Content analysis and topic generation
- ✍️ **AI 기반 블로그 글 자동 생성** - AI-powered blog post generation
- 📝 **네이버 블로그 자동 발행** - Automated Naver blog publishing
- 📅 **스케줄러 및 자동화** - Scheduler and automation
- 📈 **성과 추적 및 분석** - Performance tracking and analytics

## 설치 (Installation)

### 1. 저장소 복제 (Clone Repository)
```bash
git clone https://github.com/your-username/rubberdog.git
cd rubberdog
```

### 2. 가상환경 생성 (Create Virtual Environment)
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 3. Node.js 의존성 설치 (Install Node.js Dependencies)
```bash
npm install
```

### 4. Python 의존성 설치 (Install Python Dependencies)
```bash
pip install -r requirements.txt
pip install -r requirements-youtube.txt
pip install -e .
```

## 설정 (Configuration)

### 환경변수 설정 (Environment Variables Setup)

보안을 위해 API 키들은 환경변수로 관리됩니다.

For security, API keys are managed through environment variables.

1. `.env.example` 파일을 `.env`로 복사 (Copy `.env.example` to `.env`)
```bash
cp .env.example .env
```

2. `.env` 파일을 편집하여 실제 API 키 입력 (Edit `.env` file with your actual API keys)
```bash
# 필수 API 키들 (Required API Keys)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
YOUTUBE_API_KEY_PRIMARY=your_primary_youtube_api_key_here
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/YOUR_DATABASE

# 선택사항 API 키들 (Optional API Keys)
YOUTUBE_API_KEY_BACKUP=your_backup_youtube_api_key_here
PERPLEXITY_API_KEY=your_perplexity_api_key_here
UNSPLASH_API_KEY=your_unsplash_api_key_here
```

3. 서버 재시작 (Restart server after setting environment variables)

### 필수 API 키 (Required API Keys)

1. **YouTube Data API v3** - [Google Cloud Console](https://console.cloud.google.com/)
2. **OpenAI API** 또는 **Anthropic Claude API** - AI 글 생성용
3. **Unsplash API** (선택사항) - 이미지 자동 선택용

### API 키 획득 방법 (How to Get API Keys)

1. **YouTube Data API v3**
   - [Google Cloud Console](https://console.cloud.google.com/) 방문
   - 새 프로젝트 생성 후 YouTube Data API v3 활성화
   - API 키 생성 (Create credentials → API key)

2. **Anthropic Claude API**
   - [Anthropic Console](https://console.anthropic.com/) 방문
   - API 키 생성 및 복사

3. **MongoDB Atlas** (다중 사용자 지원용)
   - [MongoDB Atlas](https://www.mongodb.com/atlas) 방문
   - 무료 클러스터 생성 후 연결 문자열 복사

4. **기타 선택사항 API** (Optional)
   - **Unsplash**: [Unsplash Developers](https://unsplash.com/developers)
   - **Perplexity**: [Perplexity API](https://www.perplexity.ai/)

## 사용법 (Usage)

### 웹 서버 시작 (Start Web Server)

```bash
# 개발 서버 시작 (Development)
npm run dev

# 또는 프로덕션 서버 시작 (Production)
npm start

# 서버가 http://localhost:3001에서 실행됩니다
# The server will run at http://localhost:3001
```

### 웹 인터페이스 기능 (Web Interface Features)

- **YouTube 분석**: YouTube URL 입력하여 채널/비디오 분석
- **블로그 생성**: AI를 이용한 자동 여행 블로그 생성
- **사용자 관리**: 다중 사용자 지원 및 개인 API 키 관리
- **저장소 관리**: 생성된 콘텐츠 저장 및 관리

### 기본 명령어 (Command Line Interface)

```bash
# 채널 자동 탐색
rubberdog search auto

# 키워드로 채널 검색
rubberdog search keyword "발리 여행"

# 블로그 글 생성
rubberdog generate

# 블로그 발행
rubberdog publish

# 스케줄러 시작
rubberdog scheduler start

# 통계 조회
rubberdog stats --period daily
```

### 계정 관리 (Account Management)

```bash
# 네이버 블로그 계정 추가
rubberdog account add --platform naver

# 알림 설정
rubberdog config notification --email on

# 발행 시간 설정
rubberdog config publish-time "09:00,14:00,20:00"
```

## 워크플로우 (Workflow)

1. **채널 탐색** - YouTube에서 트렌딩 여행 채널 발견
2. **동영상 수집** - 채널의 인기 동영상 메타데이터 및 자막 수집
3. **콘텐츠 분석** - AI를 이용한 동영상 내용 분석 및 키워드 추출
4. **글 생성** - 분석 결과를 바탕으로 블로그 글 자동 생성
5. **이미지 선택** - Unsplash에서 관련 이미지 자동 선택
6. **블로그 발행** - 네이버 블로그에 자동 발행

## 아키텍처 (Architecture)

```
RubberDog/
├── rubberdog/
│   ├── core/           # 메인 오케스트레이터
│   ├── youtube/        # YouTube 데이터 수집
│   ├── blog/           # 블로그 생성 및 발행
│   ├── database/       # 데이터베이스 관리
│   ├── config/         # 설정 관리
│   └── utils/          # 유틸리티
├── config.yaml         # 설정 파일
└── rubberdog.db       # SQLite 데이터베이스
```

## 주의사항 (Important Notes)

### API 제한 사항
- YouTube API: 일일 할당량 관리 필요
- Naver Blog: 발행 빈도 제한 확인 필요
- Unsplash API: 시간당 요청 제한

### 콘텐츠 정책
- 저작권 준수 필수
- 플랫폼별 콘텐츠 정책 준수
- 스팸 정책 위반 주의

### 기술적 제약
- 자막이 없는 동영상은 수집 대상에서 제외
- 네이버 블로그 다중 계정 동시 로그인 제한 가능성

## 라이선스 (License)

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 기여 (Contributing)

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 지원 (Support)

- 이슈 리포트: [GitHub Issues](https://github.com/your-username/rubberdog/issues)
- 문서: [Wiki](https://github.com/your-username/rubberdog/wiki)

---

Made with ❤️ for content creators and travel bloggers