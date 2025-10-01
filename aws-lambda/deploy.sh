#!/bin/bash

# AWS Lambda 배포 스크립트
# RubberDog YouTube 자막 추출 서비스

set -e

echo "🚀 AWS Lambda 배포 시작..."

# 설정
FUNCTION_NAME="rubberdog-subtitle-extractor"
REGION="ap-northeast-2"  # Seoul region
RUNTIME="python3.9"
HANDLER="lambda_function.lambda_handler"
MEMORY_SIZE=512
TIMEOUT=300  # 5분
S3_BUCKET="rubberdog-subtitles"

# 디렉토리 정리 및 생성
echo "📁 빌드 디렉토리 준비..."
rm -rf build/
mkdir -p build/

# 의존성 설치
echo "📦 의존성 설치..."
pip install -r requirements.txt -t build/

# Lambda 함수 코드 복사
echo "📄 함수 코드 복사..."
cp lambda_function.py build/

# yt-dlp 바이너리 다운로드 (최신 버전)
echo "⬇️ yt-dlp 바이너리 다운로드..."
cd build/
wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O yt-dlp
chmod +x yt-dlp
cd ..

# 배포 패키지 생성
echo "📦 배포 패키지 생성..."
cd build/
zip -r ../lambda-deployment.zip . -q
cd ..

echo "📊 패키지 크기: $(du -h lambda-deployment.zip | cut -f1)"

# S3 버킷 생성 (존재하지 않는 경우)
echo "🪣 S3 버킷 확인/생성..."
if ! aws s3 ls "s3://$S3_BUCKET" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "✅ S3 버킷 이미 존재: $S3_BUCKET"
else
    echo "🆕 S3 버킷 생성: $S3_BUCKET"
    aws s3 mb "s3://$S3_BUCKET" --region $REGION

    # 공개 읽기 권한 설정 (자막 파일 접근용)
    aws s3api put-bucket-policy --bucket $S3_BUCKET --policy '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::'"$S3_BUCKET"'/subtitles/*"
            }
        ]
    }'
fi

# Lambda 함수 확인 및 생성/업데이트
echo "🔍 Lambda 함수 확인..."
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION >/dev/null 2>&1; then
    echo "🔄 기존 Lambda 함수 업데이트..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://lambda-deployment.zip \
        --region $REGION

    # 환경 변수 업데이트
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --environment "Variables={S3_BUCKET_NAME=$S3_BUCKET}" \
        --timeout $TIMEOUT \
        --memory-size $MEMORY_SIZE \
        --region $REGION
else
    echo "🆕 새 Lambda 함수 생성..."

    # IAM 역할 생성 (Lambda 실행 역할)
    ROLE_NAME="rubberdog-lambda-role"
    echo "👤 IAM 역할 생성: $ROLE_NAME"

    # 신뢰 정책
    cat > trust-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

    # IAM 역할 생성
    ROLE_ARN=$(aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file://trust-policy.json \
        --query 'Role.Arn' \
        --output text)

    # 정책 연결
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    # S3 액세스 정책 생성 및 연결
    cat > s3-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::$S3_BUCKET/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::$S3_BUCKET"
        }
    ]
}
EOF

    aws iam put-role-policy \
        --role-name $ROLE_NAME \
        --policy-name S3AccessPolicy \
        --policy-document file://s3-policy.json

    echo "⏳ IAM 역할 전파 대기 (10초)..."
    sleep 10

    # Lambda 함수 생성
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime $RUNTIME \
        --role $ROLE_ARN \
        --handler $HANDLER \
        --zip-file fileb://lambda-deployment.zip \
        --timeout $TIMEOUT \
        --memory-size $MEMORY_SIZE \
        --environment "Variables={S3_BUCKET_NAME=$S3_BUCKET}" \
        --region $REGION
fi

# API Gateway 생성
echo "🌐 API Gateway 설정..."
API_NAME="rubberdog-subtitle-api"

# 기존 API 확인
API_ID=$(aws apigateway get-rest-apis --region $REGION --query "items[?name=='$API_NAME'].id" --output text)

if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
    echo "🆕 새 API Gateway 생성..."
    API_ID=$(aws apigateway create-rest-api \
        --name $API_NAME \
        --description "RubberDog YouTube Subtitle Extraction API" \
        --region $REGION \
        --query 'id' \
        --output text)
fi

echo "📋 API Gateway ID: $API_ID"

# 루트 리소스 ID 가져오기
ROOT_ID=$(aws apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path=="/"].id' \
    --output text)

# /extract-subtitle 리소스 생성 (존재하지 않는 경우)
RESOURCE_ID=$(aws apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?pathPart=="extract-subtitle"].id' \
    --output text)

if [ "$RESOURCE_ID" = "None" ] || [ -z "$RESOURCE_ID" ]; then
    RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ROOT_ID \
        --path-part extract-subtitle \
        --region $REGION \
        --query 'id' \
        --output text)
fi

# POST 메서드 생성 (존재하지 않는 경우)
if ! aws apigateway get-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --region $REGION >/dev/null 2>&1; then

    aws apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method POST \
        --authorization-type NONE \
        --region $REGION
fi

# Lambda 통합 설정
LAMBDA_ARN="arn:aws:lambda:$REGION:$(aws sts get-caller-identity --query Account --output text):function:$FUNCTION_NAME"
INTEGRATION_URI="arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations"

aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri $INTEGRATION_URI \
    --region $REGION

# Lambda 실행 권한 부여
aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$(aws sts get-caller-identity --query Account --output text):$API_ID/*/*/*" \
    --region $REGION 2>/dev/null || echo "권한이 이미 존재합니다."

# API 배포
echo "🚀 API 배포..."
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name prod \
    --region $REGION

# 최종 URL 출력
API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/prod/extract-subtitle"
echo ""
echo "✅ 배포 완료!"
echo "🔗 API URL: $API_URL"
echo "🪣 S3 버킷: $S3_BUCKET"
echo ""
echo "💡 Vercel 환경 변수에 추가하세요:"
echo "AWS_LAMBDA_SUBTITLE_URL=$API_URL"
echo ""

# 임시 파일 정리
rm -f trust-policy.json s3-policy.json lambda-deployment.zip
rm -rf build/

echo "🧹 임시 파일 정리 완료"