# YouTube 채널 자동 수집 스케줄러 설정 가이드

## 📋 목차
1. [개요](#개요)
2. [시스템 구성](#시스템-구성)
3. [환경 변수 설정](#환경-변수-설정)
4. [배포 방법](#배포-방법)
5. [API 사용법](#api-사용법)
6. [설정 커스터마이징](#설정-커스터마이징)
7. [트러블슈팅](#트러블슈팅)

---

## 개요

이 시스템은 YouTube Data API를 사용하여 한국 여행 채널을 자동으로 검색하고 수집하는 스케줄러입니다.

### 주요 기능
- ⏰ **자동 스케줄링**: 매일 2회 (오전 9시, 오후 9시) 자동 실행
- 🎯 **스마트 수집**: 구독자 500~90만명 한국어 여행 채널 타겟팅
- 📊 **할당량 관리**: 하루 100개 채널 수집 제한
- 🔄 **중복 제거**: 이미 수집된 채널 자동 필터링
- 🗄️ **MongoDB 저장**: 수집된 데이터 영구 저장

---

## 시스템 구성

### 파일 구조
```
ReversePE/
├── api/
│   ├── cron/
│   │   └── collect-channels.js      # Cron Job 엔드포인트
│   └── channels/
│       └── list.js                   # 채널 목록 조회 API
├── models/
│   └── Channel.js                    # MongoDB 스키마
├── services/
│   └── channelCollector.js          # 채널 수집 로직
├── config/
│   └── scheduler.config.js          # 스케줄러 설정
├── utils/
│   └── logger.js                     # 로깅 유틸리티
└── vercel.json                       # Vercel 설정
```

### 기술 스택
- **Runtime**: Node.js
- **Database**: MongoDB Atlas
- **Deployment**: Vercel (Serverless Functions + Cron Jobs)
- **API**: YouTube Data API v3

---

## 환경 변수 설정

### 필수 환경 변수

Vercel 프로젝트 설정 → Environment Variables에 추가:

```bash
# MongoDB 연결
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database

# YouTube API Keys (여러 개 설정 가능)
YOUTUBE_API_KEY_PRIMARY=AIzaSy...
YOUTUBE_API_KEY_BACKUP=AIzaSy...
YOUTUBE_API_KEY_ADDITIONAL=AIzaSy...

# Cron Job 보안 (선택사항)
CRON_SECRET=your-secret-key-here
```

### YouTube API 키 발급 방법

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "API 및 서비스" → "라이브러리" 이동
4. "YouTube Data API v3" 검색 및 활성화
5. "사용자 인증 정보" → "사용자 인증 정보 만들기" → "API 키" 선택
6. 생성된 API 키를 환경 변수에 추가

---

## 배포 방법

### 1. Vercel에 배포

```bash
# Vercel CLI 설치
npm install -g vercel

# 프로젝트 배포
vercel --prod
```

### 2. Cron Jobs 활성화

Vercel Pro 플랜 이상에서만 Cron Jobs를 사용할 수 있습니다.

`vercel.json`에 이미 설정되어 있습니다:

```json
{
  "crons": [
    {
      "path": "/api/cron/collect-channels",
      "schedule": "0 0 * * *"    // 매일 UTC 00:00 (한국시간 09:00)
    },
    {
      "path": "/api/cron/collect-channels",
      "schedule": "0 12 * * *"   // 매일 UTC 12:00 (한국시간 21:00)
    }
  ]
}
```

### 3. 배포 확인

배포 후 Vercel 대시보드에서 확인:
- Deployments → 최신 배포 확인
- Cron Jobs → 스케줄 확인
- Logs → 실행 로그 확인

---

## API 사용법

### 1. Cron Job 수동 실행 (테스트용)

```bash
# CRON_SECRET 없이 실행
curl -X POST https://your-domain.vercel.app/api/cron/collect-channels

# CRON_SECRET 사용
curl -X POST https://your-domain.vercel.app/api/cron/collect-channels \
  -H "Authorization: Bearer your-secret-key"
```

**응답 예시:**
```json
{
  "success": true,
  "message": "채널 수집이 완료되었습니다.",
  "data": {
    "newCollected": 45,
    "totalProcessed": 68,
    "duplicates": 23,
    "errors": 0,
    "todayTotal": 45,
    "dailyLimit": 100,
    "duration": "23.45초",
    "timestamp": "2025-10-10T12:00:00.000Z"
  }
}
```

### 2. 수집된 채널 목록 조회

```bash
# 기본 조회 (페이지 1, 20개)
curl https://your-domain.vercel.app/api/channels/list

# 필터링 조회
curl "https://your-domain.vercel.app/api/channels/list?page=1&limit=50&minSubscribers=1000&maxSubscribers=100000&sortBy=subscriberCount&order=desc"
```

**쿼리 파라미터:**
- `page`: 페이지 번호 (기본: 1)
- `limit`: 페이지당 개수 (기본: 20)
- `sortBy`: 정렬 기준 (createdAt, subscriberCount, videoCount 등)
- `order`: 정렬 순서 (asc, desc)
- `minSubscribers`: 최소 구독자 수
- `maxSubscribers`: 최대 구독자 수
- `keyword`: 검색 키워드
- `status`: 상태 필터 (collected, processing 등)

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "_id": "...",
        "channelId": "UC...",
        "channelName": "여행 유튜버",
        "subscriberCount": 50000,
        "videoCount": 120,
        "channelUrl": "https://www.youtube.com/channel/UC...",
        "description": "...",
        "thumbnail": "...",
        "createdAt": "2025-10-10T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 85,
      "totalPages": 5
    },
    "statistics": {
      "totalChannels": 85,
      "totalSubscribers": 2450000,
      "avgSubscribers": 28824,
      "totalVideos": 6800,
      "totalViews": 125000000
    }
  }
}
```

---

## 설정 커스터마이징

### 1. 스케줄 시간 변경

`vercel.json` 수정:

```json
{
  "crons": [
    {
      "path": "/api/cron/collect-channels",
      "schedule": "0 3 * * *"    // 매일 UTC 03:00 (한국시간 12:00)
    }
  ]
}
```

[Cron 표현식 참고](https://crontab.guru/)

### 2. 할당량 변경

`config/scheduler.config.js` 수정:

```javascript
quota: {
  dailyChannelLimit: 200,    // 하루 200개로 증가
  perRunLimit: 100,          // 1회당 100개로 증가
}
```

### 3. 검색 키워드 추가

`config/scheduler.config.js` 수정:

```javascript
searchKeywords: [
  '여행 브이로그',
  '해외여행',
  // 새 키워드 추가
  '배낭여행',
  '유럽 여행',
  // ...
]
```

### 4. 구독자 수 범위 변경

`config/scheduler.config.js` 수정:

```javascript
filters: {
  subscriberCount: {
    min: 1000,      // 최소 1,000명으로 변경
    max: 500000     // 최대 50만명으로 변경
  }
}
```

---

## 트러블슈팅

### 1. Cron Job이 실행되지 않음

**원인:**
- Vercel Free 플랜 사용 (Cron Jobs는 Pro 이상)
- vercel.json 설정 오류

**해결:**
```bash
# Vercel Pro 플랜 확인
vercel teams list

# 재배포
vercel --prod
```

### 2. YouTube API 할당량 초과

**증상:**
```
YouTube API Error 403: quotaExceeded
```

**해결:**
- 추가 API 키 발급 및 환경 변수 등록
- `config/scheduler.config.js`에서 `perRunLimit` 감소

### 3. MongoDB 연결 실패

**증상:**
```
MongooseError: connect ECONNREFUSED
```

**해결:**
- MONGODB_URI 환경 변수 확인
- MongoDB Atlas IP 화이트리스트에 `0.0.0.0/0` 추가
- 네트워크 액세스 설정 확인

### 4. 중복 채널만 수집됨

**원인:**
- 이미 대부분의 채널이 수집됨
- 검색 키워드가 제한적

**해결:**
- `config/scheduler.config.js`에 새로운 키워드 추가
- MongoDB에서 기존 데이터 삭제 후 재수집

```javascript
// MongoDB에서 전체 채널 삭제 (주의!)
await Channel.deleteMany({});
```

### 5. 로그 확인 방법

**Vercel 대시보드:**
1. 프로젝트 선택
2. "Deployments" 탭
3. 최신 배포 클릭
4. "Functions" 탭에서 실행 로그 확인

**로컬 로그 파일:**
```
logs/
├── app-2025-10-10.log
├── error-2025-10-10.log
├── collection-2025-10-10.log
└── cron-2025-10-10.log
```

---

## 모니터링

### 수집 진행 상황 확인

```bash
# 오늘 수집된 채널 수
curl "https://your-domain.vercel.app/api/channels/list?sortBy=createdAt&order=desc&limit=100"
```

### 실시간 통계

MongoDB Atlas 대시보드에서:
1. Clusters → Browse Collections
2. `channels` 컬렉션 선택
3. Aggregations 탭에서 커스텀 쿼리 실행

---

## 라이선스

MIT License

## 문의

이슈나 질문은 GitHub Issues에 등록해주세요.
