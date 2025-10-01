import json
import boto3
import subprocess
import tempfile
import os
import re
import time
import random
from datetime import datetime
import urllib.parse

def lambda_handler(event, context):
    """
    AWS Lambda 함수 - YouTube 자막 추출 (쿠키 기반 인증)
    """

    try:
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
        print(f"[INFO] Lambda 이벤트 디버깅: {json.dumps(event, ensure_ascii=False)}")

        if 'body' in event:
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
        else:
            # 직접 호출 시 이벤트 자체가 body
            body = event

        video_id = body.get('videoId', '').strip()
        title = body.get('title', '').strip()
        cookies = body.get('cookies', '').strip()  # 선택적 쿠키 전달

        if not video_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    "success": False,
                    "error": "videoId가 필요합니다"
                }, ensure_ascii=False)
            }

        print(f"[INFO] 자막 추출 시작: {video_id}")

        # 쿠키 기반 자막 추출
        result = extract_subtitle_with_cookies(video_id, title, cookies)

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(result, ensure_ascii=False)
        }

    except Exception as e:
        print(f"[ERROR] Lambda 핸들러 오류: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                "success": False,
                "error": f"서버 오류: {str(e)}"
            }, ensure_ascii=False)
        }

def extract_subtitle_with_cookies(video_id, title, cookies=None):
    """
    쿠키를 사용한 자막 추출
    """

    print(f"[INFO] 쿠키 기반 자막 추출 시작: {video_id}")

    # 방법 1: 쿠키가 제공된 경우
    if cookies:
        result = extract_with_provided_cookies(video_id, title, cookies)
        if result['success']:
            return result

    # 방법 2: 환경변수 쿠키 사용
    result = extract_with_env_cookies(video_id, title)
    if result['success']:
        return result

    # 방법 3: 쿠키 없이 기본 시도 (최신 개선된 방법)
    result = extract_with_enhanced_headers(video_id, title)
    if result['success']:
        return result

    return {
        "success": False,
        "error": "모든 자막 추출 방법이 실패했습니다. 유효한 YouTube 쿠키가 필요할 수 있습니다.",
        "suggestion": "브라우저에서 YouTube 쿠키를 내보내서 cookies 파라미터로 전달해주세요."
    }

def extract_with_provided_cookies(video_id, title, cookies):
    """
    제공된 쿠키를 사용한 자막 추출
    """

    try:
        print(f"[INFO] 제공된 쿠키로 자막 추출 시도: {video_id}")

        # 쿠키 파일 생성
        cookie_file = f'/tmp/{video_id}_cookies.txt'
        with open(cookie_file, 'w', encoding='utf-8') as f:
            f.write(cookies)

        # 랜덤 지연
        time.sleep(random.uniform(1, 3))

        youtube_url = f"https://www.youtube.com/watch?v={video_id}"

        cmd = [
            '/opt/python/bin/yt-dlp',
            '--cookies', cookie_file,
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--referer', 'https://www.youtube.com/',
            '--add-header', 'Accept-Language:ko-KR,ko;q=0.9,en;q=0.8',
            '--sleep-interval', '2',
            '--max-sleep-interval', '4',
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'ko,en',
            '--skip-download',
            '--output', f'/tmp/{video_id}_with_cookies.%(ext)s',
            youtube_url
        ]

        print(f"[INFO] 쿠키 기반 yt-dlp 명령어: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=45,
            cwd='/tmp'
        )

        print(f"[INFO] 쿠키 기반 yt-dlp 반환 코드: {result.returncode}")
        print(f"[INFO] 쿠키 기반 yt-dlp stdout: {result.stdout}")

        if result.stderr:
            print(f"[WARNING] 쿠키 기반 yt-dlp stderr: {result.stderr}")

        # 자막 파일 확인 및 처리
        subtitle_files = []
        for file in os.listdir('/tmp'):
            if file.startswith(f'{video_id}_with_cookies') and (file.endswith('.vtt') or file.endswith('.srt')):
                subtitle_files.append(f'/tmp/{file}')

        if subtitle_files:
            print(f"[SUCCESS] 쿠키 기반으로 자막 파일 발견: {subtitle_files}")

            # 첫 번째 자막 파일 읽기
            with open(subtitle_files[0], 'r', encoding='utf-8') as f:
                content = f.read()

            # 쿠키 파일 정리
            try:
                os.remove(cookie_file)
            except:
                pass

            return {
                "success": True,
                "subtitles": content,
                "method": "provided_cookies",
                "title": title,
                "videoId": video_id
            }
        else:
            return {
                "success": False,
                "error": f"쿠키 기반: 자막 파일을 찾을 수 없음. stderr: {result.stderr}"
            }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "쿠키 기반: 시간 초과 (45초)"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"쿠키 기반 오류: {str(e)}"
        }
    finally:
        # 정리
        try:
            if 'cookie_file' in locals():
                os.remove(cookie_file)
        except:
            pass

def extract_with_env_cookies(video_id, title):
    """
    환경변수에 저장된 쿠키 사용
    """

    try:
        # 환경변수에서 쿠키 가져오기
        env_cookies = os.environ.get('YOUTUBE_COOKIES', '')

        if not env_cookies:
            print(f"[INFO] 환경변수 쿠키가 설정되지 않음")
            return {"success": False, "error": "환경변수 쿠키 없음"}

        print(f"[INFO] 환경변수 쿠키로 자막 추출 시도: {video_id}")

        # 쿠키 파일 생성
        cookie_file = f'/tmp/{video_id}_env_cookies.txt'
        with open(cookie_file, 'w', encoding='utf-8') as f:
            f.write(env_cookies)

        # 랜덤 지연
        time.sleep(random.uniform(1, 3))

        youtube_url = f"https://www.youtube.com/watch?v={video_id}"

        cmd = [
            '/opt/python/bin/yt-dlp',
            '--cookies', cookie_file,
            '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
            '--referer', 'https://www.google.com/',
            '--add-header', 'Accept-Language:ko-KR,ko;q=0.9,en;q=0.8',
            '--sleep-interval', '3',
            '--max-sleep-interval', '6',
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'ko,en',
            '--skip-download',
            '--output', f'/tmp/{video_id}_env_cookies.%(ext)s',
            youtube_url
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=45,
            cwd='/tmp'
        )

        print(f"[INFO] 환경변수 쿠키 반환 코드: {result.returncode}")

        # 자막 파일 확인
        subtitle_files = []
        for file in os.listdir('/tmp'):
            if file.startswith(f'{video_id}_env_cookies') and (file.endswith('.vtt') or file.endswith('.srt')):
                subtitle_files.append(f'/tmp/{file}')

        if subtitle_files:
            print(f"[SUCCESS] 환경변수 쿠키로 자막 파일 발견: {subtitle_files}")

            with open(subtitle_files[0], 'r', encoding='utf-8') as f:
                content = f.read()

            # 정리
            try:
                os.remove(cookie_file)
            except:
                pass

            return {
                "success": True,
                "subtitles": content,
                "method": "env_cookies",
                "title": title,
                "videoId": video_id
            }
        else:
            return {
                "success": False,
                "error": f"환경변수 쿠키: 자막 파일을 찾을 수 없음. stderr: {result.stderr}"
            }

    except Exception as e:
        return {
            "success": False,
            "error": f"환경변수 쿠키 오류: {str(e)}"
        }
    finally:
        # 정리
        try:
            if 'cookie_file' in locals():
                os.remove(cookie_file)
        except:
            pass

def extract_with_enhanced_headers(video_id, title):
    """
    향상된 헤더와 함께 자막 추출 (쿠키 없이)
    """

    try:
        print(f"[INFO] 향상된 헤더로 자막 추출 시도: {video_id}")

        # 랜덤 지연
        time.sleep(random.uniform(2, 5))

        youtube_url = f"https://www.youtube.com/watch?v={video_id}"

        # 매우 현실적인 브라우저 시뮬레이션
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
        ]

        cmd = [
            '/opt/python/bin/yt-dlp',
            '--user-agent', random.choice(user_agents),
            '--referer', 'https://www.google.com/',
            '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            '--add-header', 'Accept-Language:ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            '--add-header', 'Accept-Encoding:gzip, deflate, br',
            '--add-header', 'DNT:1',
            '--add-header', 'Connection:keep-alive',
            '--add-header', 'Upgrade-Insecure-Requests:1',
            '--sleep-interval', '3',
            '--max-sleep-interval', '8',
            '--retries', '3',
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'ko,en,auto',
            '--skip-download',
            '--output', f'/tmp/{video_id}_enhanced.%(ext)s',
            youtube_url
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            cwd='/tmp'
        )

        print(f"[INFO] 향상된 헤더 반환 코드: {result.returncode}")

        # 자막 파일 확인
        subtitle_files = []
        for file in os.listdir('/tmp'):
            if file.startswith(f'{video_id}_enhanced') and (file.endswith('.vtt') or file.endswith('.srt')):
                subtitle_files.append(f'/tmp/{file}')

        if subtitle_files:
            print(f"[SUCCESS] 향상된 헤더로 자막 파일 발견: {subtitle_files}")

            with open(subtitle_files[0], 'r', encoding='utf-8') as f:
                content = f.read()

            return {
                "success": True,
                "subtitles": content,
                "method": "enhanced_headers",
                "title": title,
                "videoId": video_id
            }
        else:
            return {
                "success": False,
                "error": f"향상된 헤더: 자막 파일을 찾을 수 없음. stderr: {result.stderr}"
            }

    except Exception as e:
        return {
            "success": False,
            "error": f"향상된 헤더 오류: {str(e)}"
        }