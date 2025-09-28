#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 자막 추출 스크립트 - yt-dlp 사용
YouTube Data API v3의 captions.download 권한 제한을 우회하여 자막을 추출합니다.
"""

import sys
import json
import subprocess
import tempfile
import os
from pathlib import Path

def extract_subtitle_with_ytdlp(video_id, language_codes=['ko', 'en', 'en-orig']):
    """
    yt-dlp를 사용하여 YouTube 자막을 추출합니다.

    Args:
        video_id (str): YouTube 영상 ID
        language_codes (list): 시도할 언어 코드 목록

    Returns:
        dict: 자막 추출 결과
    """
    try:
        url = f'https://www.youtube.com/watch?v={video_id}'
        print(f"[INFO] yt-dlp로 영상 분석 중: {video_id}")

        # 임시 디렉토리 생성
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # 각 언어에 대해 시도
            for lang_code in language_codes:
                try:
                    print(f"[INFO] {lang_code} 언어로 자막 추출 시도...")

                    # yt-dlp 명령어 구성
                    cmd = [
                        'yt-dlp',
                        '--write-auto-subs',
                        '--sub-langs', lang_code,
                        '--sub-format', 'srt',
                        '--skip-download',
                        '--output', str(temp_path / f'%(title)s.%(ext)s'),
                        url
                    ]

                    # yt-dlp 실행
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        encoding='utf-8',
                        timeout=30
                    )

                    if result.returncode == 0:
                        # 생성된 자막 파일 찾기
                        srt_files = list(temp_path.glob(f'*.{lang_code}.srt'))

                        if srt_files:
                            srt_file = srt_files[0]
                            print(f"[SUCCESS] {lang_code} 자막 파일 생성됨: {srt_file.name}")

                            # 자막 내용 읽기
                            with open(srt_file, 'r', encoding='utf-8') as f:
                                subtitle_content = f.read()

                            if subtitle_content.strip():
                                print(f"[SUCCESS] yt-dlp로 자막 추출 성공: {lang_code}")

                                return {
                                    'success': True,
                                    'subtitle': subtitle_content,
                                    'language': lang_code,
                                    'language_code': lang_code,
                                    'is_generated': 'auto' in lang_code or lang_code in ['ko', 'en'],
                                    'video_id': video_id,
                                    'method': 'yt-dlp',
                                    'note': f'yt-dlp로 자막 추출 성공 ({lang_code})'
                                }

                        else:
                            print(f"[WARN] {lang_code} 자막 파일이 생성되지 않음")

                    else:
                        print(f"[WARN] {lang_code} yt-dlp 실행 실패: {result.stderr}")

                except subprocess.TimeoutExpired:
                    print(f"[ERROR] {lang_code} yt-dlp 실행 시간 초과")
                    continue
                except Exception as e:
                    print(f"[ERROR] {lang_code} 처리 중 오류: {str(e)}")
                    continue

        # 모든 언어 시도 실패
        return {
            'success': False,
            'error': 'EXTRACTION_FAILED',
            'message': f'모든 언어에서 자막 추출에 실패했습니다. 시도한 언어: {language_codes}',
            'attempted_languages': language_codes,
            'video_id': video_id
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] yt-dlp 처리 중 오류: {error_msg}")

        return {
            'success': False,
            'error': 'YTDLP_ERROR',
            'message': f'yt-dlp 처리 중 오류가 발생했습니다: {error_msg}',
            'video_id': video_id,
            'detailed_error': error_msg
        }

def extract_subtitle_simple_ytdlp(video_id):
    """
    yt-dlp를 사용한 간단한 자막 추출 (stdout 방식)

    Args:
        video_id (str): YouTube 영상 ID

    Returns:
        dict: 자막 추출 결과
    """
    try:
        url = f'https://www.youtube.com/watch?v={video_id}'
        print(f"[INFO] yt-dlp 간단 방식으로 자막 추출: {video_id}")

        # 언어 우선순위
        languages = ['ko', 'en', 'en-orig']

        for lang in languages:
            try:
                print(f"[INFO] {lang} 언어 시도 중...")

                # yt-dlp로 자막을 stdout으로 출력
                cmd = [
                    'yt-dlp',
                    '--write-auto-subs',
                    '--sub-langs', lang,
                    '--sub-format', 'srt',
                    '--skip-download',
                    '--print-to-file', 'subtitle:%(filepath)s',
                    '--output', '-',
                    url
                ]

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    timeout=20
                )

                if result.returncode == 0 and result.stdout:
                    subtitle_content = result.stdout.strip()
                    if subtitle_content and len(subtitle_content) > 50:  # 최소 길이 확인
                        print(f"[SUCCESS] {lang} 자막 추출 성공!")

                        return {
                            'success': True,
                            'subtitle': subtitle_content,
                            'language': lang,
                            'language_code': lang,
                            'is_generated': True,
                            'video_id': video_id,
                            'method': 'yt-dlp-simple',
                            'note': f'yt-dlp 간단 방식으로 자막 추출 성공 ({lang})'
                        }

                print(f"[WARN] {lang} 언어 자막 추출 실패")

            except subprocess.TimeoutExpired:
                print(f"[ERROR] {lang} 처리 시간 초과")
                continue
            except Exception as e:
                print(f"[ERROR] {lang} 처리 중 오류: {str(e)}")
                continue

        return {
            'success': False,
            'error': 'NO_SUBTITLES_FOUND',
            'message': '지원되는 언어의 자막을 찾을 수 없습니다.',
            'video_id': video_id
        }

    except Exception as e:
        return {
            'success': False,
            'error': 'SIMPLE_YTDLP_ERROR',
            'message': f'간단 yt-dlp 처리 중 오류: {str(e)}',
            'video_id': video_id
        }

def main():
    """메인 함수 - 명령행 인수 처리"""
    if len(sys.argv) < 2:
        print("사용법: python youtube_subtitle_ytdlp.py <video_id>")
        sys.exit(1)

    video_id = sys.argv[1]

    try:
        # 1차 시도: 파일 기반 추출
        print("[INFO] === 1차 시도: 파일 기반 yt-dlp ===")
        result = extract_subtitle_with_ytdlp(video_id)

        if result['success']:
            print("=== RESULT_START ===")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            print("=== RESULT_END ===")
            sys.exit(0)

        # 2차 시도: 간단한 stdout 방식
        print("[INFO] === 2차 시도: 간단한 stdout 방식 ===")
        result = extract_subtitle_simple_ytdlp(video_id)

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
            'video_id': video_id
        }

        print("=== RESULT_START ===")
        print(json.dumps(error_result, ensure_ascii=False, indent=2))
        print("=== RESULT_END ===")

        sys.exit(1)

if __name__ == '__main__':
    main()