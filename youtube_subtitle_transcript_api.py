#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
YouTube 자막 추출기 - youtube-transcript-api 사용
자막 추출에 특화된 안정적인 라이브러리 사용
"""

import sys
import json
import re
from datetime import datetime
from youtube_transcript_api import YouTubeTranscriptApi

def extract_video_id(url):
    """YouTube URL에서 video ID 추출"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)',
        r'youtube\.com\/watch\?.*v=([^&\n?#]+)',
        r'^([a-zA-Z0-9_-]{11})$'  # 직접 video ID인 경우
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    return None

def format_transcript_with_timestamps(transcript):
    """자막을 타임스탬프와 함께 포맷팅"""
    formatted_lines = []

    # transcript가 리스트인지 확인
    if hasattr(transcript, '__iter__') and not isinstance(transcript, str):
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
                    # 속성 이름으로 접근 시도
                    start_time = getattr(entry, 'start', 0)
                    text = getattr(entry, 'text', str(entry))

                # 시간을 MM:SS 형식으로 변환
                minutes = int(start_time // 60)
                seconds = int(start_time % 60)
                timestamp = f"{minutes}:{seconds:02d}"

                # 텍스트 정리 (줄바꿈 제거, 공백 정리)
                clean_text = text.strip().replace('\n', ' ')

                formatted_lines.append(f"[{timestamp}] {clean_text}")
            except Exception as e:
                # 오류 발생시 그냥 텍스트만 추가
                formatted_lines.append(f"[ERROR] {str(entry)}")
    else:
        # transcript가 단일 객체인 경우
        formatted_lines.append(str(transcript))

    return '\n'.join(formatted_lines)

def extract_subtitle(video_id_or_url):
    """YouTube 자막 추출 메인 함수"""
    try:
        # Video ID 추출
        video_id = extract_video_id(video_id_or_url)
        if not video_id:
            return {
                'success': False,
                'error': 'INVALID_VIDEO_ID',
                'message': 'YouTube URL 또는 Video ID가 올바르지 않습니다.',
                'video_id': video_id_or_url
            }

        print(f"[INFO] YouTube Transcript API로 자막 추출 시작: {video_id}")

        # 1. API 인스턴스 생성
        api = YouTubeTranscriptApi()

        # 2. 직접 자막 가져오기 시도 (한국어 우선)
        transcript = None
        language_used = None
        language_name = None

        # 한국어 자막 우선순위 ('ko'만 사용 - auto-generated 포함)
        korean_codes = ['ko']

        for lang_code in korean_codes:
            try:
                transcript = api.fetch(video_id, languages=[lang_code])
                language_used = lang_code
                language_name = '한국어'
                print(f"[SUCCESS] 한국어 자막 발견: {lang_code}")
                break
            except:
                continue

        # 3. 한국어가 없으면 영어 시도
        if not transcript:
            english_codes = ['en']
            for lang_code in english_codes:
                try:
                    transcript = api.fetch(video_id, languages=[lang_code])
                    language_used = lang_code
                    language_name = '영어'
                    print(f"[SUCCESS] 영어 자막 발견: {lang_code}")
                    break
                except:
                    continue

        # 4. 기본 자막 시도 (언어 지정 없음)
        if not transcript:
            try:
                transcript = api.fetch(video_id)
                language_used = 'auto'
                language_name = '자동감지'
                print(f"[SUCCESS] 자동감지 자막 발견")
            except Exception as e:
                print(f"[ERROR] 자막 추출 실패: {str(e)}")

        if not transcript:
            return {
                'success': False,
                'error': 'NO_SUPPORTED_LANGUAGE',
                'message': '지원하는 언어의 자막을 찾을 수 없습니다.',
                'video_id': video_id
            }

        # 5. 자막 포맷팅
        formatted_subtitle = format_transcript_with_timestamps(transcript)

        print(f"[SUCCESS] 자막 추출 성공! {len(transcript)}개 세그먼트")

        # 6. 결과 반환
        result = {
            'success': True,
            'video_id': video_id,
            'subtitle': formatted_subtitle,
            'language': language_name,
            'language_code': language_used,
            'segments_count': len(transcript),
            'method': 'youtube-transcript-api',
            'format': 'text_with_timestamps',
            'extracted_at': datetime.utcnow().isoformat() + 'Z'
        }

        return result

    except Exception as e:
        print(f"[ERROR] 자막 추출 오류: {str(e)}")
        return {
            'success': False,
            'error': 'EXTRACTION_ERROR',
            'message': f'자막 추출 중 오류가 발생했습니다: {str(e)}',
            'video_id': video_id_or_url if 'video_id' in locals() else video_id_or_url
        }

def main():
    """CLI 실행 함수"""
    if len(sys.argv) != 2:
        print("사용법: python youtube_subtitle_transcript_api.py <YouTube_URL_또는_Video_ID>")
        sys.exit(1)

    video_input = sys.argv[1]
    result = extract_subtitle(video_input)

    # JSON 형태로 결과 출력
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()