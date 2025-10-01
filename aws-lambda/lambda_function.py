import json
import boto3
import subprocess
import tempfile
import os
import re
from datetime import datetime
import urllib.parse

def lambda_handler(event, context):
    """
    AWS Lambda 함수 - YouTube 자막 추출
    """

    try:
        # 즉시 youtube-transcript-api 테스트
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            print("✅ Lambda 핸들러에서 youtube-transcript-api 임포트 성공")
        except Exception as e:
            print(f"❌ Lambda 핸들러에서 youtube-transcript-api 임포트 실패: {str(e)}")

        # CORS 헤더 설정
        headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }

        # OPTIONS 요청 처리 (CORS preflight)
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }

        # 요청 데이터 파싱
        print(f"🔍 Lambda 이벤트 디버깅: {json.dumps(event, ensure_ascii=False)}")

        if 'body' in event:
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
        else:
            # 직접 호출 시 이벤트 자체가 body
            body = event

        video_id = body.get('videoId')
        title = body.get('title', f'Video_{video_id}')

        print(f"📋 파싱된 데이터: videoId={video_id}, title={title}")

        if not video_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'videoId is required'
                })
            }

        print(f"🎬 Lambda에서 자막 추출 시작: {video_id}")

        # YouTube URL 구성
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"

        # 자막 추출 실행 (우선순위: youtube-transcript-api → yt-dlp)
        print(f"🎯 1차 시도: YouTube Transcript API")
        result = extract_subtitle_with_youtube_transcript_api(video_id, title)
        print(f"📊 YouTube Transcript API 결과: success={result['success']}")
        if not result['success']:
            print(f"❌ YouTube Transcript API 오류: {result.get('error', 'Unknown error')}")

        if not result['success']:
            print(f"🔄 2차 시도: yt-dlp fallback")
            result = extract_subtitle_with_ytdlp(video_id, youtube_url, title)
            print(f"📊 yt-dlp 결과: success={result['success']}")
            if not result['success']:
                print(f"❌ yt-dlp 오류: {result.get('error', 'Unknown error')}")

        if result['success']:
            # S3에 저장
            s3_result = save_to_s3(video_id, result['subtitle'], result['metadata'])
            result['s3_url'] = s3_result.get('url')

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(result, ensure_ascii=False)
        }

    except Exception as e:
        print(f"❌ Lambda 오류: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': f'Lambda 처리 오류: {str(e)}'
            }, ensure_ascii=False)
        }

def extract_subtitle_with_youtube_transcript_api(video_id, title):
    """
    youtube-transcript-api를 사용하여 자막 추출 (우선 방법)
    """
    try:
        print(f"🎯 YouTube Transcript API로 자막 추출 시작: {video_id}")

        # youtube-transcript-api 임포트
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            print("✅ youtube-transcript-api 라이브러리 로드 성공")
        except ImportError as e:
            print(f"❌ youtube-transcript-api 라이브러리 임포트 실패: {str(e)}")
            return {
                'success': False,
                'error': f'youtube-transcript-api library import failed: {str(e)}'
            }
        except Exception as e:
            print(f"❌ youtube-transcript-api 라이브러리 로드 중 예상치 못한 오류: {str(e)}")
            return {
                'success': False,
                'error': f'Unexpected error loading youtube-transcript-api: {str(e)}'
            }

        # API 인스턴스 생성
        api = YouTubeTranscriptApi()

        # 한국어 자막 우선 시도
        transcript = None
        language_used = None
        language_name = None

        korean_codes = ['ko']
        for lang_code in korean_codes:
            try:
                transcript = api.fetch(video_id, languages=[lang_code])
                language_used = lang_code
                language_name = '한국어'
                print(f"✅ 한국어 자막 발견: {lang_code}")
                break
            except:
                continue

        # 한국어가 없으면 영어 시도
        if not transcript:
            english_codes = ['en']
            for lang_code in english_codes:
                try:
                    transcript = api.fetch(video_id, languages=[lang_code])
                    language_used = lang_code
                    language_name = '영어'
                    print(f"✅ 영어 자막 발견: {lang_code}")
                    break
                except:
                    continue

        # 기본 자막 시도 (언어 지정 없음)
        if not transcript:
            try:
                transcript = api.fetch(video_id)
                language_used = 'auto'
                language_name = '자동감지'
                print(f"✅ 자동감지 자막 발견")
            except Exception as e:
                print(f"❌ 자막 추출 실패: {str(e)}")
                return {
                    'success': False,
                    'error': f'youtube-transcript-api 실패: {str(e)}'
                }

        if not transcript:
            return {
                'success': False,
                'error': 'NO_SUPPORTED_LANGUAGE'
            }

        # 자막 포맷팅
        formatted_subtitle = format_transcript_with_timestamps(transcript)

        print(f"🎉 YouTube Transcript API 자막 추출 성공! {len(transcript)}개 세그먼트")

        # 메타데이터 생성
        metadata = {
            'video_id': video_id,
            'title': title,
            'language': language_name,
            'language_code': language_used,
            'format': 'text_with_timestamps',
            'method': 'aws-lambda-youtube-transcript-api',
            'success': True,
            'saved_at': datetime.utcnow().isoformat() + 'Z',
            'storage_type': 'aws_s3'
        }

        return {
            'success': True,
            'video_id': video_id,
            'subtitle': formatted_subtitle,
            'method': 'aws-lambda-youtube-transcript-api',
            'language': language_name,
            'language_code': language_used,
            'format': 'text_with_timestamps',
            'metadata': metadata,
            'segments_count': len(transcript),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }

    except Exception as e:
        print(f"❌ YouTube Transcript API 오류: {str(e)}")
        return {
            'success': False,
            'error': f'YouTube Transcript API 실패: {str(e)}'
        }

def format_transcript_with_timestamps(transcript):
    """자막을 타임스탬프와 함께 포맷팅"""
    formatted_lines = []

    for entry in transcript:
        try:
            # entry의 속성을 확인
            if hasattr(entry, 'start'):
                start_time = entry.start
                text = entry.text
            elif hasattr(entry, '__getitem__'):
                start_time = entry['start']
                text = entry['text']
            else:
                start_time = getattr(entry, 'start', 0)
                text = getattr(entry, 'text', str(entry))

            # 시간을 MM:SS 형식으로 변환
            minutes = int(start_time // 60)
            seconds = int(start_time % 60)
            timestamp = f"{minutes}:{seconds:02d}"

            # 텍스트 정리
            clean_text = text.strip().replace('\n', ' ')

            formatted_lines.append(f"[{timestamp}] {clean_text}")
        except Exception as e:
            formatted_lines.append(f"[ERROR] {str(entry)}")

    return '\n'.join(formatted_lines)

def extract_subtitle_with_ytdlp(video_id, youtube_url, title):
    """
    yt-dlp를 사용하여 자막 추출 (fallback 방법)
    """
    try:
        # 임시 디렉토리 생성
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"📂 임시 디렉토리 생성: {temp_dir}")

            # 1. 사용 가능한 자막 언어 확인
            print(f"🔍 사용 가능한 자막 언어 확인: {video_id}")

            # yt-dlp 실행 경로 설정 (Lambda 환경에서는 /var/task 디렉토리가 기본)
            ytdlp_path = '/var/task/yt-dlp'
            list_cmd = [
                'python3', ytdlp_path,  # 절대 경로로 yt-dlp 스크립트 실행
                '--list-subs',
                youtube_url
            ]

            list_result = subprocess.run(
                list_cmd,
                capture_output=True,
                text=True,
                cwd=temp_dir,
                timeout=30
            )

            if list_result.returncode != 0:
                raise Exception(f"자막 목록 조회 실패: {list_result.stderr}")

            print(f"📋 자막 목록 출력:\n{list_result.stdout}")

            # 한국어 자막 우선순위 결정
            korean_langs = ['ko', 'ko-orig', 'ko-en', 'ko-ja']
            available_lang = None

            for lang in korean_langs:
                if f"{lang}" in list_result.stdout.lower():
                    available_lang = lang
                    break

            if not available_lang:
                # 영어 자막도 확인
                if 'en' in list_result.stdout.lower():
                    available_lang = 'en'
                else:
                    raise Exception("사용 가능한 자막이 없습니다")

            print(f"🇰🇷 선택된 자막 언어: {available_lang}")

            # 2. 자막 다운로드
            subtitle_file = os.path.join(temp_dir, f"subtitle_{video_id}.{available_lang}.vtt")

            download_cmd = [
                'python3', ytdlp_path,
                '--write-subs',
                '--sub-lang', available_lang,
                '--sub-format', 'vtt',
                '--skip-download',
                '--output', f"subtitle_{video_id}.%(ext)s",
                youtube_url
            ]

            download_result = subprocess.run(
                download_cmd,
                capture_output=True,
                text=True,
                cwd=temp_dir,
                timeout=60
            )

            if download_result.returncode != 0:
                raise Exception(f"자막 다운로드 실패: {download_result.stderr}")

            print(f"📥 자막 다운로드 완료: {download_result.stdout}")

            # 3. VTT 파일 읽기 및 파싱
            vtt_files = [f for f in os.listdir(temp_dir) if f.endswith('.vtt')]
            if not vtt_files:
                raise Exception("다운로드된 자막 파일을 찾을 수 없습니다")

            vtt_file_path = os.path.join(temp_dir, vtt_files[0])

            with open(vtt_file_path, 'r', encoding='utf-8') as f:
                vtt_content = f.read()

            print(f"✅ VTT 파일 읽기 성공: {len(vtt_content)} 문자")

            # VTT 파싱하여 자막 텍스트 추출
            subtitle_text = parse_vtt_content(vtt_content)

            print(f"🎉 자막 추출 성공! {len(subtitle_text.split('['))} 세그먼트")

            # 메타데이터 생성
            metadata = {
                'video_id': video_id,
                'title': title,
                'language': '한국어' if available_lang.startswith('ko') else '영어',
                'language_code': available_lang,
                'format': 'vtt',
                'method': 'aws-lambda-ytdlp',
                'success': True,
                'saved_at': datetime.utcnow().isoformat() + 'Z',
                'storage_type': 'aws_s3'
            }

            return {
                'success': True,
                'video_id': video_id,
                'subtitle': subtitle_text,
                'method': 'aws-lambda-ytdlp',
                'language': metadata['language'],
                'language_code': available_lang,
                'format': 'vtt',
                'metadata': metadata,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }

    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'error': 'yt-dlp 실행 시간 초과'
        }
    except Exception as e:
        print(f"❌ yt-dlp 추출 오류: {str(e)}")
        return {
            'success': False,
            'error': f'자막 추출 실패: {str(e)}'
        }

def parse_vtt_content(vtt_content):
    """
    VTT 내용을 파싱하여 타임스탬프와 함께 자막 텍스트 추출
    """
    lines = vtt_content.split('\n')
    subtitle_segments = []
    current_time = None
    current_text = []

    for line in lines:
        line = line.strip()

        # 타임스탬프 라인 감지 (예: 00:00:01.000 --> 00:00:03.000)
        if ' --> ' in line:
            # 이전 세그먼트 저장
            if current_time and current_text:
                text = ' '.join(current_text).strip()
                if text:
                    subtitle_segments.append(f"[{current_time}] {text}")

            # 새 타임스탬프 추출 (시작 시간만 사용)
            time_match = re.match(r'(\d{2}:\d{2}:\d{2})', line)
            if time_match:
                current_time = time_match.group(1)[:5]  # HH:MM 형식으로 단순화
            current_text = []

        # 자막 텍스트 라인
        elif line and not line.startswith('WEBVTT') and not line.isdigit():
            # HTML 태그 제거
            clean_text = re.sub(r'<[^>]+>', '', line)
            if clean_text.strip():
                current_text.append(clean_text.strip())

    # 마지막 세그먼트 처리
    if current_time and current_text:
        text = ' '.join(current_text).strip()
        if text:
            subtitle_segments.append(f"[{current_time}] {text}")

    return '\n'.join(subtitle_segments)

def save_to_s3(video_id, subtitle_content, metadata):
    """
    S3에 자막 파일과 메타데이터 저장
    """
    try:
        s3_client = boto3.client('s3')
        bucket_name = os.environ.get('S3_BUCKET_NAME', 'rubberdog-subtitles')

        # 파일명 생성 (타임스탬프 포함)
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')

        # 자막 파일 저장
        subtitle_key = f"subtitles/{video_id}_{timestamp}.txt"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=subtitle_key,
            Body=subtitle_content.encode('utf-8'),
            ContentType='text/plain; charset=utf-8',
            Metadata={
                'video-id': video_id,
                'language': metadata['language_code'],
                'method': 'aws-lambda-ytdlp'
            }
        )

        # 메타데이터 JSON 저장
        metadata_key = f"metadata/{video_id}_{timestamp}.json"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=metadata_key,
            Body=json.dumps(metadata, ensure_ascii=False, indent=2).encode('utf-8'),
            ContentType='application/json; charset=utf-8'
        )

        # 공개 URL 생성
        subtitle_url = f"https://{bucket_name}.s3.amazonaws.com/{subtitle_key}"

        print(f"✅ S3 저장 완료: {subtitle_url}")

        return {
            'success': True,
            'url': subtitle_url,
            'subtitle_key': subtitle_key,
            'metadata_key': metadata_key
        }

    except Exception as e:
        print(f"❌ S3 저장 오류: {str(e)}")
        return {
            'success': False,
            'error': f'S3 저장 실패: {str(e)}'
        }