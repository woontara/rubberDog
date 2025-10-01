# RubberDog AWS Lambda 백엔드

YouTube 자막 추출을 위한 AWS Lambda 백엔드 서비스

## 🏗️ 아키텍처

```
Vercel Frontend → AWS API Gateway → AWS Lambda → AWS S3
    (UI)           (프록시)        (자막추출)     (저장소)
```

## 📦 구성 요소

- **AWS Lambda**: Python 3.9 + yt-dlp 바이너리
- **AWS API Gateway**: HTTP API 프록시
- **AWS S3**: 자막 파일 및 메타데이터 저장
- **AWS IAM**: 권한 관리

## 🚀 배포 방법

### 1. 사전 준비

AWS CLI 설치 및 설정:
```bash
# AWS CLI 설치
pip install awscli

# AWS 자격 증명 설정
aws configure
```

권한 요구사항:
- Lambda 함수 생성/수정
- IAM 역할 생성/수정
- S3 버킷 생성/관리
- API Gateway 생성/관리

### 2. 자동 배포

```bash
cd aws-lambda
chmod +x deploy.sh
./deploy.sh
```

배포 스크립트는 다음을 자동으로 수행합니다:
- Python 의존성 설치
- yt-dlp 바이너리 다운로드
- Lambda 배포 패키지 생성
- S3 버킷 생성 (존재하지 않는 경우)
- Lambda 함수 생성/업데이트
- IAM 역할 및 정책 설정
- API Gateway 설정
- 배포 및 테스트

### 3. 환경 변수 설정

배포 완료 후 출력되는 API URL을 Vercel에 설정:

```bash
# Vercel 환경 변수 추가
AWS_LAMBDA_SUBTITLE_URL=https://your-api-id.execute-api.ap-northeast-2.amazonaws.com/prod/extract-subtitle
```

## 🧪 테스트

### API 직접 테스트

```bash
curl -X POST https://your-api-id.execute-api.ap-northeast-2.amazonaws.com/prod/extract-subtitle \
  -H "Content-Type: application/json" \
  -d '{"videoId": "vOLXGEt3C-A", "title": "Test Video"}'
```

### 로그 확인

```bash
# CloudWatch 로그 스트림 확인
aws logs describe-log-streams \
  --log-group-name /aws/lambda/rubberdog-subtitle-extractor \
  --order-by LastEventTime \
  --descending

# 최신 로그 조회
aws logs get-log-events \
  --log-group-name /aws/lambda/rubberdog-subtitle-extractor \
  --log-stream-name [LOG_STREAM_NAME]
```

## 📊 비용 예상

**월간 사용량** (1000회 자막 추출 기준):
- Lambda 실행: $0.20
- API Gateway: $3.50
- S3 저장: $0.02
- **총합: ~$3.72/월**

## 🔧 설정값

### Lambda 함수
- **Runtime**: Python 3.9
- **Memory**: 512MB
- **Timeout**: 300초 (5분)
- **환경변수**: `S3_BUCKET_NAME`

### S3 버킷
- **이름**: `rubberdog-subtitles`
- **지역**: `ap-northeast-2` (서울)
- **공개정책**: 자막 파일만 읽기 가능

## 🛠️ 수동 배포 (고급 사용자)

### 1. 의존성 설치
```bash
pip install -r requirements.txt -t build/
```

### 2. yt-dlp 바이너리 다운로드
```bash
wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod +x yt-dlp
```

### 3. 배포 패키지 생성
```bash
zip -r lambda-deployment.zip lambda_function.py build/ yt-dlp
```

### 4. Lambda 함수 생성
```bash
aws lambda create-function \
  --function-name rubberdog-subtitle-extractor \
  --runtime python3.9 \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 300 \
  --memory-size 512
```

## 🐛 문제 해결

### 일반적인 오류

1. **권한 오류**
   ```
   User: arn:aws:iam::ACCOUNT:user/USERNAME is not authorized to perform: lambda:CreateFunction
   ```
   → AWS IAM 권한 확인

2. **패키지 크기 초과**
   ```
   Unzipped size must be smaller than 262144000 bytes
   ```
   → Lambda Layer 사용 고려

3. **yt-dlp 실행 오류**
   ```
   /opt/yt-dlp: Permission denied
   ```
   → 실행 권한 확인 (`chmod +x`)

### 로그 분석

CloudWatch에서 다음 키워드로 검색:
- `ERROR`: 오류 발생
- `🎉`: 성공적인 자막 추출
- `❌`: 실패한 작업
- `📊`: 디버깅 정보

## 🔄 업데이트

### Lambda 함수 코드 업데이트
```bash
# 코드 수정 후
./deploy.sh
```

### yt-dlp 버전 업데이트
```bash
# requirements.txt에서 버전 변경 후
./deploy.sh
```

## 📚 참고 자료

- [AWS Lambda Python](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- [AWS API Gateway](https://docs.aws.amazon.com/apigateway/)
- [AWS S3](https://docs.aws.amazon.com/s3/)