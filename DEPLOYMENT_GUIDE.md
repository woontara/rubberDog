# 🚀 RubberDog 배포 가이드 (MongoDB Atlas 통합)

## 📋 배포 전 준비사항

### 1. 필수 요구사항
- ✅ MongoDB Atlas 무료 계정 및 클러스터
- ✅ Node.js 16.0.0 이상
- ✅ Python 3.x (YouTube 자막 추출용)
- ✅ Git

### 2. 환경 설정 확인
```bash
# 현재 localhost:3001에서 정상 작동 중
✅ MongoDB Atlas 연결 성공
✅ 무료 티어 사용량: 0% (512MB 여유)
✅ 텍스트 압축 기능 활성화
✅ 멀티유저 인증 시스템 작동
```

## 🚀 배포 옵션

### 옵션 1: Vercel (추천)
가장 간단한 배포 방법으로 Node.js 앱에 최적화되어 있습니다.

```bash
# Vercel CLI 설치
npm install -g vercel

# 배포
vercel

# 또는 자동 배포 스크립트 사용
deploy.bat
# 1번 선택
```

**장점:**
- 무료 플랜 제공
- 자동 HTTPS
- 간단한 배포 프로세스
- 환경 변수 관리 용이

**주의사항:**
- Python 스크립트 실행 제한 있음 (서버리스 환경)
- 파일 업로드 기능 제한적

### 옵션 2: Netlify
정적 사이트와 서버리스 함수를 지원합니다.

```bash
# Netlify CLI 설치
npm install -g netlify-cli

# 배포
netlify deploy --prod

# 또는 자동 배포 스크립트 사용
deploy.bat
# 2번 선택
```

**장점:**
- 무료 플랜 제공
- 자동 HTTPS
- GitHub 연동 자동 배포

**주의사항:**
- 서버리스 함수로 API 재구현 필요
- Python 지원 제한적

### 옵션 3: Heroku
전체 Node.js 백엔드를 지원합니다.

```bash
# Heroku CLI 설치 후
heroku create your-app-name

# 배포
git push heroku main

# 또는 자동 배포 스크립트 사용
deploy.bat
# 4번 선택
```

**장점:**
- 완전한 서버 환경
- Python 지원
- 파일 시스템 접근 가능

**주의사항:**
- 무료 플랜 제한적
- 30분 비활성 시 슬립 모드

### 옵션 4: AWS/Azure/GCP
엔터프라이즈급 배포를 위한 클라우드 플랫폼

#### AWS EC2 예시:
```bash
# EC2 인스턴스에 SSH 접속 후
git clone https://github.com/your-repo/reverse-pe.git
cd reverse-pe
npm install
npm start

# PM2로 프로세스 관리
npm install -g pm2
pm2 start server.js
pm2 save
pm2 startup
```

### 옵션 5: Docker 컨테이너
도커를 사용한 컨테이너 배포

```dockerfile
# Dockerfile 생성
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
# 빌드 및 실행
docker build -t reverse-pe .
docker run -p 3000:3000 reverse-pe
```

## 🔒 보안 고려사항

### 1. 환경 변수
- 민감한 정보는 환경 변수로 관리
- `.env` 파일은 절대 커밋하지 않음

### 2. CORS 설정
```javascript
// 프로덕션 환경에서 특정 도메인만 허용
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'https://yourdomain.com'
};
```

### 3. 파일 업로드 제한
- 파일 크기 제한 설정
- 허용된 파일 형식만 업로드
- 업로드 경로 보안

### 4. API 보안
- Rate limiting 적용
- API 키 인증 구현
- HTTPS 강제

## 📊 모니터링

### 로깅
```javascript
// Morgan 로깅 미들웨어 사용
app.use(morgan('combined'));
```

### 상태 체크
```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});
```

## 🔧 트러블슈팅

### Python 스크립트 실행 문제
```bash
# Python 경로 확인
which python
python --version

# 환경 변수에 Python 경로 설정
export PYTHON_PATH=/usr/bin/python3
```

### 포트 충돌
```bash
# 다른 포트 사용
PORT=8080 npm start
```

### 메모리 부족
```bash
# Node.js 메모리 증가
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## 📝 배포 체크리스트

- [ ] 모든 의존성 설치 확인
- [ ] 환경 변수 설정
- [ ] 보안 설정 검토
- [ ] HTTPS 설정
- [ ] 도메인 연결
- [ ] 모니터링 설정
- [ ] 백업 계획 수립
- [ ] 롤백 전략 준비

## 🌐 커스텀 도메인 연결

### Vercel
1. Vercel 대시보드 > Settings > Domains
2. 도메인 추가
3. DNS 설정 업데이트

### Netlify
1. Netlify 대시보드 > Domain settings
2. Add custom domain
3. DNS 설정 업데이트

## 💡 성능 최적화 팁

1. **정적 파일 CDN 사용**
   - CloudFlare, AWS CloudFront 활용

2. **캐싱 전략**
   - 정적 파일 브라우저 캐싱
   - API 응답 캐싱

3. **압축 사용**
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

4. **비동기 처리**
   - 무거운 작업은 큐 시스템 사용
   - Worker threads 활용

## 📧 지원

배포 중 문제가 발생하면:
1. 에러 로그 확인
2. 환경 변수 재확인
3. 의존성 버전 확인
4. GitHub Issues에 문의