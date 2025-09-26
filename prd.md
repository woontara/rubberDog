# 러버독(Rubber Dog) PRD
## Product Requirements Document

---

## 1. 제품 개요

### 1.1 제품명
- **러버독 (Rubber Dog)**

### 1.2 제품 목적
유튜브에서 인기가 급상승하는 해외 여행 관련 채널을 자동으로 탐색하고, 해당 채널의 인기 콘텐츠를 분석하여 유사한 주제의 블로그 글을 자동으로 생성 및 발행하는 자동화 툴

### 1.3 주요 사용자
- 블로그 콘텐츠 제작자
- 콘텐츠 마케터
- 여행 블로거

### 1.4 핵심 가치
- 트렌드 콘텐츠의 신속한 파악 및 대응
- 콘텐츠 생산 자동화를 통한 효율성 향상
- 데이터 기반 콘텐츠 전략 수립

---

## 2. 기능 요구사항

### 2.1 유튜브 데이터 수집

#### 2.1.1 채널 탐색 모드
- **자동 탐색 모드**
  - 유튜브 급상승 탭 활용
  - 조회수 증가율 기반 채널 탐색
- **키워드 탐색 모드**
  - 사용자가 입력한 키워드 기반 채널 검색
  - 키워드 관련성 높은 채널 우선 수집

#### 2.1.2 채널 필터링 기준
- **카테고리**: 해외 여행
- **구독자 수**: 1만 이상 ~ 100만 이하
- **언어**: 제한 없음
- **지역**: 제한 없음
- **판별 방법**: 키워드 분석 + AI 분석

#### 2.1.3 동영상 URL 수집
- 선별된 채널의 모든 공개 동영상 URL 수집
- **자막 필수 체크**: 자막(자동 생성 자막 포함)이 있는 동영상만 수집
- 동영상 메타데이터 수집 (제목, 설명, 조회수, 업로드 날짜, 자막 언어 등)
- 자막 텍스트 전체 다운로드 및 저장
- 인기도 순으로 정렬 및 저장

#### 2.1.4 실행 주기
- **일 3회 자동 실행**
- **회당 처리량**: 5개 채널
- **스케줄링**: Cron 기반 자동 실행

#### 2.1.5 중복 관리
- 이미 수집한 채널도 지속적으로 모니터링
- 동일 채널의 새로운 인기 콘텐츠 우선 처리
- 채널별 마지막 수집 시점 기록

### 2.2 콘텐츠 분석 및 글감 생성

#### 2.2.1 리버스 프롬프트 엔지니어링
- 수집된 동영상 URL 기반 콘텐츠 분석
- **자막 텍스트 분석**: 동영상 자막을 기반으로 실제 내용 파악
- 동영상 제목, 설명, 태그, 자막에서 핵심 주제 추출
- 자막 기반 상세 내용 요약 및 키 포인트 도출
- 블로그 글 작성을 위한 구조화된 글감 생성

#### 2.2.2 글감 구성 요소
- 주요 키워드
- 핵심 주제
- 타겟 독자
- 예상 콘텐츠 구조
- 관련 정보 포인트

### 2.3 블로그 글 자동 생성

#### 2.3.1 글 생성 규칙
- **분량**: 한글 기준 공백 제외 2,000자 내외
- **매핑**: 동영상 1개 → 블로그 글 1개
- **중복 체크**: 글 내용 기반 유사도 검사

#### 2.3.2 글 구성 섹션
- **필수 섹션**
  - 여행지 소개
  - 추천 일정
  - 여행 팁
- **선택 섹션** (설정 가능)
  - 예산 정보
  - 현지 맛집
  - 교통 정보
  - 숙박 추천

#### 2.3.3 이미지 처리
- Unsplash API 활용 무료 이미지 자동 선택
- 글 주제와 관련성 높은 이미지 매칭
- 대체 이미지 소스 설정 가능

### 2.4 네이버 블로그 발행

#### 2.4.1 계정 관리
- 다중 계정 지원
- Config 파일 기반 계정 정보 관리
- 계정별 발행 로테이션

#### 2.4.2 발행 설정
- **예약 발행**: 특정 시간대 설정 가능
- **발행 제한**: 없음 (설정 가능)
- **발행 상태**: 초안/즉시발행/예약발행 선택

### 2.5 데이터 관리

#### 2.5.1 데이터 저장
- 수집 데이터 30일 보관 후 자동 삭제
- 생성된 글 30일 보관 후 자동 삭제
- 데이터베이스: SQLite (로컬)

#### 2.5.2 저장 데이터 유형
- 채널 정보
- 동영상 메타데이터
- 생성된 글감
- 발행된 블로그 글
- 성과 지표

### 2.6 성과 추적

#### 2.6.1 추적 지표
- 블로그 조회수
- 방문자 수
- 유입 키워드
- 아웃링크 클릭 수
- 글 생성 성공률
- 발행 성공률

#### 2.6.2 리포팅
- 일별/주별/월별 성과 리포트
- CLI 기반 통계 조회

### 2.7 알림 시스템

#### 2.7.1 알림 유형
- **실행 완료 알림**
  - 수집 완료
  - 글 생성 완료
  - 발행 완료
- **에러 알림**
  - API 오류
  - 발행 실패
  - 시스템 오류

#### 2.7.2 알림 설정
- 이메일 알림 (ON/OFF 설정 가능)
- 알림 유형별 개별 설정

---

## 3. 기술 요구사항

### 3.1 시스템 아키텍처
- **배포 환경**: 로컬 서버
- **인터페이스**: CLI (Command Line Interface)
- **언어**: Python 3.9+

### 3.2 주요 기술 스택
```
- YouTube Data API v3
- YouTube Transcript API (자막 추출)
- OpenAI API / Claude API (글 생성)
- Naver Blog API
- Unsplash API
- SQLite
- Schedule (Python 라이브러리)
- Click (CLI 프레임워크)
```

### 3.3 설정 관리
- YAML/JSON 기반 Config 파일
- 환경 변수 지원
- API 키 암호화 저장

---

## 4. 비기능 요구사항

### 4.1 성능
- 채널당 처리 시간: 5분 이내
- 글 생성 시간: 동영상당 2분 이내
- 동시 처리: 최대 5개 채널

### 4.2 보안
- API 키 암호화
- 로그 파일 접근 제한
- 민감 정보 마스킹

### 4.3 확장성
- 플러그인 시스템 (향후)
- 다른 블로그 플랫폼 지원 (향후)
- 클라우드 배포 가능 구조

### 4.4 유지보수
- 상세 로깅
- 에러 추적
- 백업 기능

---

## 5. CLI 명령어 명세

### 5.1 기본 명령어
```bash
# 초기 설정
rubberdog init

# 채널 탐색 (자동 모드)
rubberdog search --mode auto

# 채널 탐색 (키워드 모드)
rubberdog search --mode keyword --query "발리 여행"

# 글 생성
rubberdog generate --channel [CHANNEL_ID]

# 발행
rubberdog publish --draft-id [DRAFT_ID]

# 스케줄러 시작/중지
rubberdog scheduler start
rubberdog scheduler stop

# 통계 조회
rubberdog stats --period daily
rubberdog stats --period weekly
```

### 5.2 설정 명령어
```bash
# 계정 추가
rubberdog account add --platform naver

# 알림 설정
rubberdog config notification --email on
rubberdog config notification --error on

# 발행 시간 설정
rubberdog config publish-time "09:00,14:00,20:00"
```

---

## 6. 데이터 스키마

### 6.1 채널 테이블
```sql
channels (
    id INTEGER PRIMARY KEY,
    channel_id VARCHAR(100),
    channel_name VARCHAR(255),
    subscriber_count INTEGER,
    category VARCHAR(50),
    last_crawled DATETIME,
    created_at DATETIME
)
```

### 6.2 동영상 테이블
```sql
videos (
    id INTEGER PRIMARY KEY,
    video_id VARCHAR(100),
    channel_id VARCHAR(100),
    title TEXT,
    description TEXT,
    view_count INTEGER,
    upload_date DATETIME,
    url VARCHAR(500),
    has_subtitle BOOLEAN,
    subtitle_languages VARCHAR(500),
    subtitle_text TEXT,
    processed BOOLEAN,
    created_at DATETIME
)
```

### 6.3 블로그 글 테이블
```sql
blog_posts (
    id INTEGER PRIMARY KEY,
    video_id VARCHAR(100),
    title VARCHAR(500),
    content TEXT,
    status VARCHAR(50), -- draft, published, scheduled
    publish_time DATETIME,
    blog_account VARCHAR(100),
    view_count INTEGER,
    created_at DATETIME,
    published_at DATETIME
)
```

### 6.4 성과 테이블
```sql
analytics (
    id INTEGER PRIMARY KEY,
    post_id INTEGER,
    date DATE,
    views INTEGER,
    visitors INTEGER,
    outbound_clicks INTEGER,
    keywords TEXT,
    created_at DATETIME
)
```

---

## 7. 개발 로드맵

### Phase 1 (MVP) - 2주
- [ ] YouTube API 연동 및 채널 탐색
- [ ] 동영상 URL 수집
- [ ] 기본 CLI 구현
- [ ] SQLite 데이터베이스 설정

### Phase 2 - 2주
- [ ] 리버스 프롬프트 엔지니어링
- [ ] AI 기반 글 생성
- [ ] 중복 체크 로직
- [ ] Unsplash 이미지 연동

### Phase 3 - 2주
- [ ] 네이버 블로그 API 연동
- [ ] 다중 계정 관리
- [ ] 예약 발행 기능
- [ ] 스케줄러 구현

### Phase 4 - 1주
- [ ] 성과 추적 시스템
- [ ] 알림 시스템
- [ ] 데이터 자동 삭제
- [ ] 에러 핸들링 강화

### Phase 5 - 1주
- [ ] 테스트 및 디버깅
- [ ] 문서화
- [ ] 배포 준비

---

## 8. 주의사항 및 제약사항

### 8.1 API 제한
- YouTube API: 일일 할당량 관리 필요
- Naver Blog API: 발행 빈도 제한 확인 필요
- Unsplash API: 시간당 요청 제한

### 8.2 콘텐츠 정책
- 저작권 준수
- 플랫폼별 콘텐츠 정책 준수
- 스팸 정책 위반 주의

### 8.3 기술적 제약
- 네이버 블로그 다중 계정 동시 로그인 제한 가능성
- 자막이 없는 동영상은 수집 대상에서 제외
- 자동 생성 자막의 경우 정확도가 떨어질 수 있음

---

## 9. 성공 지표

- 일일 자동 발행 글 수: 15개 이상
- 글 생성 성공률: 95% 이상
- 평균 블로그 조회수: 발행 후 7일 내 100회 이상
- 시스템 가동률: 99% 이상

---

*문서 버전: 1.0*  
*작성일: 2024*  
*최종 수정일: 2024*