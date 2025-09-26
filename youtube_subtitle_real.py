#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Real YouTube subtitle extractor
"""

import sys
import json
import io
import re
from youtube_transcript_api import YouTubeTranscriptApi

# UTF-8 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def extract_video_id(url):
    """YouTube URL에서 video ID 추출"""
    if len(url) == 11 and '/' not in url:
        return url

    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/.*[?&]v=([a-zA-Z0-9_-]{11})',
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_real_subtitle(video_id_or_url):
    """실제 YouTube 자막 추출"""
    try:
        # URL인 경우 video ID 추출
        if '/' in video_id_or_url or '?' in video_id_or_url:
            video_id = extract_video_id(video_id_or_url)
        else:
            video_id = video_id_or_url

        if not video_id:
            return {"error": "Invalid video ID or URL"}

        # YouTube Transcript API 인스턴스 생성
        ytt_api = YouTubeTranscriptApi()

        # 자막 리스트 가져오기
        transcript_list = ytt_api.list(video_id)

        # 한국어 우선, 없으면 영어, 마지막으로 자동 생성 자막
        transcript = None

        # 1순위: 한국어 자막
        for t in transcript_list:
            if t.language_code == 'ko':
                transcript = t
                break

        # 2순위: 영어 자막
        if not transcript:
            for t in transcript_list:
                if t.language_code in ['en', 'en-US', 'en-GB']:
                    transcript = t
                    break

        # 3순위: 첫 번째로 찾은 자막
        if not transcript:
            for t in transcript_list:
                transcript = t
                break

        if transcript:
            # 자막 데이터 가져오기
            transcript_data = transcript.fetch()

            # 자막 텍스트 결합
            subtitle_text = ""
            for entry in transcript_data:
                # 시간 정보와 함께 자막 추가
                start_time = int(entry.start)
                minutes = start_time // 60
                seconds = start_time % 60
                timestamp = f"[{minutes:02d}:{seconds:02d}]"

                text = entry.text.strip()
                if text:
                    subtitle_text += f"{timestamp} {text}\n"

            return {
                "subtitle": subtitle_text.strip(),
                "language": transcript.language,
                "language_code": transcript.language_code,
                "is_generated": transcript.is_generated,
                "video_id": video_id
            }
        else:
            return {"error": "No subtitles found for this video"}

    except Exception as e:
        error_msg = str(e)
        if "No transcripts found" in error_msg:
            return {"error": "이 영상에는 자막이 없습니다"}
        elif "Video unavailable" in error_msg:
            return {"error": "영상을 찾을 수 없습니다"}
        else:
            return {"error": f"자막 추출 중 오류: {error_msg}"}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python youtube_subtitle_real.py subtitle <video_id_or_url>"}, ensure_ascii=False))
        return

    action = sys.argv[1]
    video_input = sys.argv[2]

    if action == "subtitle":
        result = get_real_subtitle(video_input)
    else:
        result = {"error": "Invalid action. Use 'subtitle'"}

    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()