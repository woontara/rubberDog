#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube API integration for web interface
Usage: python youtube_api.py <action> <url_or_video_id>
Actions: analyze, subtitle
"""

import sys
import json
import re
import io
import os
from urllib.parse import urlparse, parse_qs

# UTF-8 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
from rubberdog.youtube.collector import YouTubeCollector
from rubberdog.youtube.subtitle_extractor import SubtitleExtractor
from youtube_transcript_api import YouTubeTranscriptApi

# YouTube API Keys - 환경변수에서 읽어옴
def get_youtube_api_keys():
    """환경변수에서 YouTube API 키들을 읽어옴"""
    keys = []

    # 개별 환경변수에서 읽기
    if os.getenv('YOUTUBE_API_KEY_PRIMARY'):
        keys.append(os.getenv('YOUTUBE_API_KEY_PRIMARY'))
    if os.getenv('YOUTUBE_API_KEY_BACKUP'):
        keys.append(os.getenv('YOUTUBE_API_KEY_BACKUP'))
    if os.getenv('YOUTUBE_API_KEY_ADDITIONAL'):
        keys.append(os.getenv('YOUTUBE_API_KEY_ADDITIONAL'))

    # 단일 환경변수에서 쉼표로 구분된 키들 읽기 (fallback)
    if not keys and os.getenv('YOUTUBE_API_KEYS'):
        keys = [key.strip() for key in os.getenv('YOUTUBE_API_KEYS').split(',')]

    if not keys:
        print("ERROR: No YouTube API keys found in environment variables", file=sys.stderr)
        print("Please set YOUTUBE_API_KEY_PRIMARY, YOUTUBE_API_KEY_BACKUP, YOUTUBE_API_KEY_ADDITIONAL", file=sys.stderr)
        print("Or set YOUTUBE_API_KEYS with comma-separated values", file=sys.stderr)
        sys.exit(1)

    return keys

YOUTUBE_API_KEYS = get_youtube_api_keys()

# 현재 사용 중인 키 인덱스
current_key_index = 2

def get_current_api_key():
    """현재 사용 가능한 API 키 반환"""
    global current_key_index
    if current_key_index < len(YOUTUBE_API_KEYS):
        return YOUTUBE_API_KEYS[current_key_index]
    return None

def switch_to_next_key():
    """다음 API 키로 전환"""
    global current_key_index
    current_key_index += 1
    if current_key_index < len(YOUTUBE_API_KEYS):
        print(f"DEBUG: Switching to API key #{current_key_index + 1}", file=sys.stderr)
        return True
    return False

def extract_video_id(url):
    """YouTube URL에서 video ID 추출"""
    if len(url) == 11 and not '/' in url:
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

def extract_channel_info(url):
    """YouTube URL에서 채널 정보 추출"""
    patterns = [
        r'youtube\.com/@([^/?]+)',
        r'youtube\.com/c/([^/?]+)',
        r'youtube\.com/channel/([^/?]+)',
        r'youtube\.com/user/([^/?]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    return None

def is_channel_url(url):
    """채널 URL인지 확인"""
    channel_patterns = [
        r'youtube\.com/@',
        r'youtube\.com/c/',
        r'youtube\.com/channel/',
        r'youtube\.com/user/',
    ]

    return any(re.search(pattern, url) for pattern in channel_patterns)

def is_travel_video(title, description=""):
    """영상이 해외 여행 관련인지 판단"""
    travel_keywords = [
        # 여행 관련 한국어 키워드
        '여행', '해외여행', '여행기', '여행브이로그', '여행 vlog', '여행일기',
        '패키지여행', '자유여행', '배낭여행', '신혼여행', '가족여행',

        # 국가/도시 관련 키워드 (주요 여행지)
        '일본', '도쿄', '오사카', '교토', '후쿠오카', '삿포로', '오키나와',
        '태국', '방콕', '치안마이', '푸켓', '파타야',
        '베트남', '호치민', '하노이', '다낭', '나트랑',
        '필리핀', '세부', '보라카이', '마닐라',
        '중국', '베이징', '상하이', '홍콩', '마카오', '대만', '타이베이',
        '미국', '뉴욕', '라스베이거스', '로스앤젤레스', '샌프란시스코', '하와이',
        '유럽', '이탈리아', '로마', '밀라노', '베네치아', '피렌체',
        '프랑스', '파리', '니스', '칸', '리옹',
        '스페인', '바르셀로나', '마드리드', '세비야',
        '영국', '런던', '에딘버러',
        '독일', '베를린', '뮌헨', '프랑크푸르트',
        '스위스', '취리히', '인터라켄', '제네바',
        '터키', '이스탄불', '카파도키아',
        '인도네시아', '발리', '자카르타',
        '싱가포르', '말레이시아', '쿠알라룸푸르',
        '호주', '시드니', '멜버른', '골드코스트', '케언즈',
        '뉴질랜드', '오클랜드', '퀸스타운',
        '캐나다', '벤쿠버', '토론토', '몬트리올',
        '러시아', '모스크바', '상트페테르부르크',
        '이집트', '카이로', '룩소르',
        '두바이', 'UAE', '아랍에미리트',

        # 여행 활동 관련
        '맛집', '맛집투어', '현지음식', '로컬푸드',
        '관광', '관광지', '명소', '랜드마크', '박물관', '미술관',
        '호텔', '숙소', '리조트', '펜션',
        '쇼핑', '면세점', '시장', '벼룩시장',
        '액티비티', '투어', '가이드',

        # 영어 키워드
        'travel', 'trip', 'vacation', 'holiday', 'tour', 'vlog',
        'japan', 'tokyo', 'osaka', 'kyoto', 'thailand', 'bangkok',
        'vietnam', 'philippines', 'singapore', 'malaysia', 'indonesia',
        'europe', 'italy', 'france', 'spain', 'germany', 'swiss',
        'usa', 'america', 'newyork', 'losangeles', 'hawaii',
        'australia', 'newzealand', 'canada', 'dubai'
    ]

    # 제목과 설명을 합쳐서 검사
    text = (title + " " + description).lower()

    # 키워드 매칭 점수 계산
    score = 0
    for keyword in travel_keywords:
        if keyword.lower() in text:
            score += 1

    # 2개 이상의 키워드가 매칭되면 여행 영상으로 판단
    return score >= 2

def check_subtitle_availability(video_id):
    """비디오에 자막이 있는지 확인"""
    try:
        # YouTubeTranscriptApi를 직접 사용해서 자막 가져오기 시도
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['ko', 'en', 'auto'])
        return len(transcript) > 0
    except Exception as e:
        try:
            # 언어를 지정하지 않고 다시 시도
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            return len(transcript) > 0
        except Exception as e2:
            # 자막이 없거나 에러가 발생하면 False 반환
            print(f"DEBUG: Subtitle check failed for {video_id}: {e2}", file=sys.stderr)
            return False

def analyze_youtube_url(url, page=1, filters=None):
    """YouTube URL 분석 (페이지네이션 및 필터링 지원)"""
    if filters is None:
        filters = {}

    try:
        if is_channel_url(url):
            # 채널 URL 처리
            channel_info = extract_channel_info(url)
            if not channel_info:
                return {"error": "Invalid channel URL"}

            api_key = get_current_api_key()
            if api_key:
                collector = YouTubeCollector(api_key)

                # 채널 ID 검색
                search_results = collector._search_by_keyword(channel_info)
                if search_results:
                    channel_id = search_results[0]["channel_id"]

                    # 모든 영상 가져오기 (최대 1000개)
                    max_videos_to_fetch = 1000  # YouTube API 제한을 고려하여 최대 1000개
                    videos = collector.get_channel_videos(channel_id, max_results=max_videos_to_fetch)

                    # 필터링 및 변환
                    video_list = []
                    travel_filter = filters.get('travelOnly', False)
                    subtitle_filter = filters.get('subtitleOnly', False)
                    long_video_filter = filters.get('longVideoOnly', False)

                    print(f"DEBUG: Fetched {len(videos)} videos, applying filters: travel={travel_filter}, subtitle={subtitle_filter}, long={long_video_filter}", file=sys.stderr)
                    print(f"DEBUG: Filters object: {filters}", file=sys.stderr)

                    for video in videos:
                        duration_sec = video.get("duration", 0)
                        title = video.get("title", "")

                        print(f"DEBUG: Processing '{title[:30]}...' - Duration: {duration_sec}s", file=sys.stderr)

                        # 긴 영상 필터링 (2분/120초 이상) - 우선 적용
                        if long_video_filter and duration_sec < 120:
                            print(f"DEBUG: FILTERED OUT - Duration {duration_sec}s < 120s", file=sys.stderr)
                            continue

                        description = video.get("description", "")

                        # 여행 영상 필터링
                        if travel_filter and not is_travel_video(title, description):
                            continue

                        # 자막 필터링 (한 번만 체크)
                        has_subtitle = False
                        if subtitle_filter:
                            has_subtitle = check_subtitle_availability(video["video_id"])
                            if not has_subtitle:
                                print(f"DEBUG: FILTERED OUT - No subtitles for '{title[:30]}...'", file=sys.stderr)
                                continue
                        else:
                            # subtitle_filter가 false인 경우에만 실제 체크 (UI 표시용)
                            has_subtitle = check_subtitle_availability(video["video_id"])

                        duration_str = f"{duration_sec//60}:{duration_sec%60:02d}"

                        video_data = {
                            "id": video["video_id"],
                            "title": title,
                            "duration": duration_str,
                            "views": f"{video.get('view_count', 0):,}",
                            "hasSubtitle": has_subtitle,
                            "isTravelVideo": is_travel_video(title, description)
                        }

                        print(f"DEBUG: PASSED - '{title[:30]}...' - Duration: {duration_sec}s, HasSubtitle: {has_subtitle}", file=sys.stderr)

                        video_list.append(video_data)

                    print(f"DEBUG: After filtering: {len(video_list)} videos remain", file=sys.stderr)

                    return {
                        "type": "channel",
                        "videos": video_list,  # 모든 필터링된 영상 반환
                        "total_videos": len(video_list),
                        "filters_applied": {
                            "travel_only": travel_filter,
                            "subtitle_only": subtitle_filter,
                            "long_video_only": long_video_filter
                        }
                    }

            # API 키가 없는 경우 오류 반환
            return {"error": "YouTube API 키가 필요합니다. 설정을 확인해주세요."}
        else:
            # 단일 비디오 URL 처리
            video_id = extract_video_id(url)
            if not video_id:
                return {"error": "Invalid video URL"}

            api_key = get_current_api_key()
            if api_key:
                collector = YouTubeCollector(api_key)
                video_details = collector.get_video_details(video_id)

                if video_details:
                    duration_sec = video_details.get("duration", 0)

                    # 참고: 단일 비디오의 경우 Shorts 영상도 허용 (사용자가 직접 선택한 경우)
                    # 필터링은 채널 영상 목록에서만 적용

                    # 자막 여부 체크 (임시로 비활성화 - 실제 추출 시 체크)
                    # if not check_subtitle_availability(video_details["video_id"]):
                    #     return {"error": "이 영상에는 자막이 없습니다."}

                    duration_str = f"{duration_sec//60}:{duration_sec%60:02d}"

                    return {
                        "type": "video",
                        "video": {
                            "id": video_details["video_id"],
                            "title": video_details["title"],
                            "duration": duration_str,
                            "views": f"{video_details.get('view_count', 0):,}"
                        }
                    }

            # API 키가 없는 경우 오류 반환
            return {"error": "YouTube API 키가 필요합니다. 설정을 확인해주세요."}

    except Exception as e:
        error_msg = str(e)
        # 할당량 초과 에러 체크
        if "quota" in error_msg.lower() or "exceeded" in error_msg.lower() or "403" in error_msg:
            if switch_to_next_key():
                # 다음 키로 재시도
                print(f"DEBUG: Quota exceeded, retrying with next API key", file=sys.stderr)
                return analyze_youtube_url(url, page, filters)
            else:
                return {"error": "모든 API 키의 할당량이 초과되었습니다. 나중에 다시 시도해주세요."}
        return {"error": str(e)}

def extract_subtitle(video_id):
    """비디오에서 자막 추출"""
    try:
        # 실제 video ID 추출 (URL인 경우)
        if '/' in video_id or '?' in video_id:
            video_id = extract_video_id(video_id)

        if not video_id:
            return {"error": "Invalid video ID"}

        extractor = SubtitleExtractor()
        result = extractor.get_video_subtitles(video_id, preferred_languages=['ko', 'en'])

        if result["has_subtitles"]:
            return {"subtitle": result["text"]}
        else:
            return {"error": "이 영상에는 자막이 없습니다."}

    except Exception as e:
        return {"error": str(e)}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python youtube_api.py <action> <url_or_video_id> [page] [filters]"}))
        return

    action = sys.argv[1]
    url_or_id = sys.argv[2]

    # 페이지 정보 (옵션)
    page = int(sys.argv[3]) if len(sys.argv) > 3 else 1

    # 필터 정보 (옵션, JSON 형태)
    filters = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}

    if action == "analyze":
        result = analyze_youtube_url(url_or_id, page, filters)
    elif action == "subtitle":
        result = extract_subtitle(url_or_id)
    else:
        result = {"error": "Invalid action. Use 'analyze' or 'subtitle'"}

    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()