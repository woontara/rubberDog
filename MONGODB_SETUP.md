# MongoDB Atlas 무료 티어 설정 가이드

## 🚀 MongoDB Atlas 계정 생성 및 설정

### 1단계: MongoDB Atlas 계정 생성
1. [MongoDB Atlas](https://www.mongodb.com/atlas) 접속
2. "Try Free" 클릭하여 무료 계정 생성
3. 이메일 인증 완료

### 2단계: 무료 클러스터 생성
1. "Create a deployment" → "M0 Sandbox" (FREE) 선택
2. 클라우드 제공업체: **AWS** 선택 (권장)
3. 지역: **Seoul (ap-northeast-2)** 선택 (한국 사용자용)
4. 클러스터 이름: `rubberdog-cluster` (또는 원하는 이름)
5. "Create Deployment" 클릭

### 3단계: 데이터베이스 사용자 생성
1. "Database Access" 메뉴 이동
2. "Add New Database User" 클릭
3. 인증 방법: "Password" 선택
4. 사용자명: `rubberdog-admin`
5. 비밀번호: 강력한 비밀번호 생성 (특수문자 포함)
6. Database User Privileges: "Built-in Role" → "Read and write to any database" 선택
7. "Add User" 클릭

### 4단계: 네트워크 접근 설정
1. "Network Access" 메뉴 이동
2. "Add IP Address" 클릭
3. 개발용: "Allow Access from Anywhere" (0.0.0.0/0)
4. 또는 현재 IP만: "Add Current IP Address"
5. "Confirm" 클릭

### 5단계: 연결 문자열 획득
1. "Database" 메뉴로 돌아가기
2. 클러스터에서 "Connect" 클릭
3. "Drivers" 선택
4. Driver: "Node.js", Version: "4.1 or later" 선택
5. 연결 문자열 복사:
```
mongodb+srv://rubberdog-admin:<password>@rubberdog-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## 🔧 프로젝트 설정

### 1. 환경 변수 설정
`.env` 파일 생성 (`.env.example` 복사 후 수정):

```env
# MongoDB Atlas 연결
MONGODB_URI=mongodb+srv://rubberdog-admin:YOUR_PASSWORD@rubberdog-cluster.xxxxx.mongodb.net/rubberdog?retryWrites=true&w=majority

# 기타 설정
PORT=3001
NODE_ENV=development
```

**중요**:
- `<password>`를 실제 비밀번호로 교체
- `xxxxx`를 실제 클러스터 ID로 교체
- 데이터베이스 이름 `rubberdog` 추가

### 2. 서버 실행
```bash
npm start
```

성공시 다음과 같은 메시지 출력:
```
🔌 MongoDB Atlas 연결 시도 중...
✅ MongoDB Atlas 연결 성공 - 클라우드 스토리지 활성화
📊 무료 티어 사용량: 0% (0MB / 512MB)
🚀 Multi-user YouTube Blog Generator running on http://localhost:3001
👥 Multi-user support: MongoDB Atlas (클라우드)
💾 텍스트 압축: 활성화 (1KB 이상 자동 압축)
```

## 📊 무료 티어 제한사항

### MongoDB Atlas M0 (FREE) 제한
- **저장소**: 512MB
- **RAM**: 512MB 공유
- **연결**: 500개 동시 연결
- **대역폭**: 제한 없음
- **백업**: 자동 백업 없음 (수동 export 가능)

### 예상 사용량
- **사용자 100명**: ~200-300MB
- **사용자 500명**: 무료 티어 한계 근접
- **압축률**: 평균 70% 절약으로 더 많은 데이터 저장 가능

## 🔍 모니터링 및 관리

### Atlas 대시보드에서 확인 가능한 정보
- 실시간 연결 상태
- 저장소 사용량
- 쿼리 성능
- 지역별 접속 통계

### 서버에서 확인 가능한 정보
- 애플리케이션 로그에서 사용량 확인
- 압축률 통계
- 사용자별 저장소 사용량

## ⚠️ 주의사항

1. **비밀번호 보안**: `.env` 파일을 git에 커밋하지 마세요
2. **IP 화이트리스트**: 프로덕션에서는 특정 IP만 허용
3. **용량 모니터링**: 512MB 한계 주의
4. **연결 관리**: 불필요한 연결 정리

## 🎯 다음 단계 (용량 부족시)

### 옵션 1: Atlas 유료 플랜
- **M10 Basic**: $9/월 (2GB)
- **M20 General**: $57/월 (10GB)

### 옵션 2: 하이브리드 아키텍처
- MongoDB: 메타데이터 저장
- AWS S3: 대용량 텍스트 저장
- 비용 효율적 확장

현재 구현은 무료 티어에서 시작하여 필요시 점진적 확장이 가능하도록 설계되었습니다.