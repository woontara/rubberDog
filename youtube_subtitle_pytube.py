#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 자막 추출 스크립트 - pytube 사용
YouTube Data API v3의 captions.download 권한 제한을 우회하여 자막을 추출합니다.
"""

import sys
import json
import traceback
from pytube import YouTube

def extract_subtitle_with_pytube(video_id, language_codes=['ko', 'en', 'auto']):
    """
    pytube를 사용하여 YouTube 자막을 추출합니다.

    Args:
        video_id (str): YouTube 영상 ID
        language_codes (list): 시도할 언어 코드 목록

    Returns:
        dict: 자막 추출 결과
    """
    try:
        # YouTube 객체 생성
        url = f'https://www.youtube.com/watch?v={video_id}'
        print(f"[INFO] pytube로 영상 분석 중: {video_id}")

        yt = YouTube(url)

        # 사용 가능한 자막 목록 확인
        available_captions = list(yt.captions.keys())
        print(f"[INFO] 사용 가능한 자막: {available_captions}")

        if not available_captions:
            return {
                'success': False,
                'error': 'NO_CAPTIONS',
                'message': '이 영상에는 자막이 없습니다.',
                'video_id': video_id
            }

        # 언어 우선순위에 따라 자막 추출 시도
        for lang_code in language_codes:
            if lang_code == 'auto':
                # 자동: 첫 번째 사용 가능한 자막 사용
                if available_captions:
                    target_lang = available_captions[0]
                else:
                    continue
            else:
                # 지정된 언어 확인
                if lang_code not in yt.captions:
                    print(f"[WARN] {lang_code} 자막이 없음, 다음 언어 시도...")
                    continue
                target_lang = lang_code

            try:
                # 자막 가져오기
                caption = yt.captions[target_lang]
                print(f"[SUCCESS] {target_lang} 자막 추출 시도...")

                # SRT 형식으로 자막 생성
                srt_content = caption.generate_srt_captions()

                if srt_content and len(srt_content.strip()) > 0:
                    print(f"[SUCCESS] pytube로 자막 추출 성공: {target_lang}")

                    return {
                        'success': True,
                        'subtitle': srt_content,
                        'language': caption.name or target_lang,
                        'language_code': target_lang,
                        'is_generated': 'a.' in target_lang,  # 자동 생성 자막 여부
                        'video_id': video_id,
                        'method': 'pytube',
                        'note': f'pytube 라이브러리로 자막 추출 성공 ({target_lang})'
                    }

            except Exception as e:
                print(f"[ERROR] {target_lang} 자막 추출 실패: {str(e)}")
                continue

        # 모든 언어 시도 실패
        return {
            'success': False,
            'error': 'EXTRACTION_FAILED',
            'message': f'자막이 존재하지만 추출할 수 없습니다. 사용 가능한 언어: {available_captions}',
            'available_languages': available_captions,
            'video_id': video_id
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] pytube 오류: {error_msg}")

        # 구체적인 오류 유형 확인
        if 'unavailable' in error_msg.lower():
            return {
                'success': False,
                'error': 'VIDEO_UNAVAILABLE',
                'message': '영상을 사용할 수 없습니다. (비공개, 삭제됨, 또는 지역 제한)',
                'video_id': video_id,
                'detailed_error': error_msg
            }
        elif 'age' in error_msg.lower():
            return {
                'success': False,
                'error': 'AGE_RESTRICTED',
                'message': '연령 제한이 있는 영상입니다.',
                'video_id': video_id,
                'detailed_error': error_msg
            }
        else:
            return {
                'success': False,
                'error': 'PYTUBE_ERROR',
                'message': f'pytube 처리 중 오류가 발생했습니다: {error_msg}',
                'video_id': video_id,
                'detailed_error': error_msg
            }

def main():
    """메인 함수 - 명령행 인수 처리"""
    if len(sys.argv) < 2:
        print("사용법: python youtube_subtitle_pytube.py <video_id>")
        sys.exit(1)

    video_id = sys.argv[1]

    try:
        # 자막 추출 실행
        result = extract_subtitle_with_pytube(video_id)

        # 결과를 JSON으로 출력
        print("=== RESULT_START ===")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("=== RESULT_END ===")

        # 성공/실패에 따른 종료 코드
        sys.exit(0 if result['success'] else 1)

    except Exception as e:
        error_result = {
            'success': False,
            'error': 'SCRIPT_ERROR',
            'message': f'스크립트 실행 중 오류: {str(e)}',
            'video_id': video_id,
            'traceback': traceback.format_exc()
        }

        print("=== RESULT_START ===")
        print(json.dumps(error_result, ensure_ascii=False, indent=2))
        print("=== RESULT_END ===")

        sys.exit(1)

if __name__ == '__main__':
    main()