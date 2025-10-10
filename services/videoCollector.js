const fetch = require('node-fetch');
const Video = require('../models/Video');
const Channel = require('../models/Channel');
const https = require('https');

/**
 * YouTube 영상 및 자막 자동 수집 서비스
 */
class VideoCollector {
  constructor() {
    this.apiKeys = this.getYouTubeApiKeys();
    this.currentKeyIndex = 0;
  }

  /**
   * YouTube API 키 목록 가져오기
   */
  getYouTubeApiKeys() {
    const keys = [];
    const possibleKeys = [
      'YOUTUBE_API_KEY_PRIMARY',
      'YOUTUBE_API_KEY_BACKUP',
      'YOUTUBE_API_KEY_ADDITIONAL',
      'YOUTUBE_API_KEY',
      'YOUTUBE_API_KEY_1',
      'YOUTUBE_API_KEY_2',
      'YOUTUBE_API_KEY_3'
    ];

    for (const keyName of possibleKeys) {
      if (process.env[keyName]) {
        keys.push(process.env[keyName]);
      }
    }

    if (keys.length === 0 && process.env.YOUTUBE_API_KEYS) {
      keys.push(...process.env.YOUTUBE_API_KEYS.split(',').map(key => key.trim()));
    }

    return keys;
  }

  /**
   * API 키 전환
   */
  rotateApiKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    console.log(`🔄 API 키 전환: ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);
  }

  /**
   * 현재 API 키 가져오기
   */
  getCurrentApiKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('YouTube API 키가 설정되지 않았습니다.');
    }
    return this.apiKeys[this.currentKeyIndex];
  }

  /**
   * YouTube Data API 호출
   */
  async callYouTubeAPI(endpoint, params, retryCount = 0) {
    const apiKey = this.getCurrentApiKey();
    const baseUrl = 'https://www.googleapis.com/youtube/v3';
    const searchParams = new URLSearchParams({
      ...params,
      key: apiKey
    });

    const apiUrl = `${baseUrl}/${endpoint}?${searchParams}`;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        const errorData = await response.json();

        // 할당량 초과 또는 인증 오류시 API 키 전환
        if (response.status === 403 || response.status === 429) {
          if (retryCount < this.apiKeys.length - 1) {
            console.log(`⚠️ API 키 할당량 초과, 다음 키로 전환...`);
            this.rotateApiKey();
            return this.callYouTubeAPI(endpoint, params, retryCount + 1);
          }
        }

        throw new Error(`YouTube API Error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * 채널의 모든 영상 목록 가져오기
   */
  async getChannelVideos(channelId, channelName) {
    console.log(`\n🎬 채널 영상 수집 시작: ${channelName} (${channelId})`);

    const allVideos = [];
    let pageToken = null;
    let pageCount = 0;

    try {
      do {
        pageCount++;
        console.log(`📄 페이지 ${pageCount} 수집 중...`);

        const params = {
          part: 'snippet',
          channelId: channelId,
          type: 'video',
          order: 'date',
          maxResults: 50
        };

        if (pageToken) {
          params.pageToken = pageToken;
        }

        const searchData = await this.callYouTubeAPI('search', params);

        if (!searchData.items || searchData.items.length === 0) {
          break;
        }

        // 영상 ID 목록 추출
        const videoIds = searchData.items.map(item => item.id.videoId);

        // 영상 상세 정보 조회
        const videosDetail = await this.getVideosDetails(videoIds, channelId, channelName);

        allVideos.push(...videosDetail);

        pageToken = searchData.nextPageToken;

        console.log(`✅ 페이지 ${pageCount}: ${videosDetail.length}개 영상 수집`);

        // API 호출 제한을 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 500));

      } while (pageToken);

      console.log(`🎯 총 ${allVideos.length}개 영상 수집 완료\n`);

      return allVideos;

    } catch (error) {
      console.error(`❌ 채널 영상 수집 실패 (${channelName}):`, error.message);
      return allVideos;
    }
  }

  /**
   * 영상 상세 정보 조회
   */
  async getVideosDetails(videoIds, channelId, channelName) {
    if (videoIds.length === 0) return [];

    try {
      const videoData = await this.callYouTubeAPI('videos', {
        part: 'snippet,contentDetails,statistics',
        id: videoIds.join(',')
      });

      if (!videoData.items) return [];

      return videoData.items.map(video => ({
        videoId: video.id,
        channelId: channelId,
        channelName: channelName,
        title: video.snippet.title,
        description: video.snippet.description || '',
        thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url || '',
        videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
        publishedAt: new Date(video.snippet.publishedAt),
        viewCount: parseInt(video.statistics.viewCount || 0),
        likeCount: parseInt(video.statistics.likeCount || 0),
        commentCount: parseInt(video.statistics.commentCount || 0),
        duration: video.contentDetails.duration || '',
        hasSubtitle: false,
        subtitleStatus: 'pending',
        metadata: {
          tags: video.snippet.tags || [],
          categoryId: video.snippet.categoryId || '',
          defaultLanguage: video.snippet.defaultLanguage || 'ko',
          isLiveContent: video.snippet.liveBroadcastContent !== 'none'
        }
      }));

    } catch (error) {
      console.error(`❌ 영상 상세 정보 조회 실패:`, error.message);
      return [];
    }
  }

  /**
   * 영상 저장 또는 업데이트
   */
  async saveVideo(videoData) {
    try {
      const existingVideo = await Video.findOne({ videoId: videoData.videoId });

      if (existingVideo) {
        // 이미 존재하면 업데이트 (자막 상태는 유지)
        existingVideo.viewCount = videoData.viewCount;
        existingVideo.likeCount = videoData.likeCount;
        existingVideo.commentCount = videoData.commentCount;
        existingVideo.lastUpdated = new Date();
        await existingVideo.save();

        return { saved: false, updated: true, video: existingVideo };
      }

      // 새 영상 저장
      const newVideo = new Video(videoData);
      await newVideo.save();

      return { saved: true, updated: false, video: newVideo };

    } catch (error) {
      console.error(`❌ 영상 저장 실패 (${videoData.title}):`, error.message);
      return { saved: false, updated: false, error: error.message };
    }
  }

  /**
   * 영상 자막 수집 (하이브리드 API 사용)
   */
  async collectSubtitle(videoId) {
    try {
      console.log(`📝 자막 수집 시작: ${videoId}`);

      // 로컬 하이브리드 자막 API 호출
      const apiUrl = `http://localhost:3001/api/youtube/subtitle`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId: videoId,
          title: 'Auto Collection'
        })
      });

      const result = await response.json();

      if (result.success && result.subtitle) {
        console.log(`  ✅ 자막 수집 성공!`);

        const segmentsCount = result.subtitle.split('\n').filter(line => line.trim()).length;

        return {
          success: true,
          subtitle: result.subtitle,
          language: result.language || 'auto',
          segmentsCount
        };
      }

      console.log(`  🚫 자막 수집 실패: ${result.error || 'UNKNOWN'}`);
      return {
        success: false,
        error: result.error || 'NO_SUBTITLE'
      };

    } catch (error) {
      console.error(`  ❌ API 호출 오류: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * XML 자막 파싱
   */
  parseXMLSubtitles(xmlData) {
    try {
      const subtitles = [];

      // XML 데이터 전처리
      let processedXml = xmlData;
      processedXml = processedXml.replace(/&amp;/g, '&');
      processedXml = processedXml.replace(/&lt;/g, '<');
      processedXml = processedXml.replace(/&gt;/g, '>');
      processedXml = processedXml.replace(/&quot;/g, '"');
      processedXml = processedXml.replace(/&apos;/g, "'");
      processedXml = processedXml.replace(/&#39;/g, "'");

      const pattern = /<text start="([0-9.]+)"[^>]*>(.*?)<\/text>/g;
      let match;

      while ((match = pattern.exec(processedXml)) !== null) {
        const startTime = parseFloat(match[1]);
        let text = match[2];

        if (isNaN(startTime) || startTime < 0) {
          continue;
        }

        // 내부 HTML 태그 제거
        text = text.replace(/<[^>]*>/g, '');
        text = text.trim();

        if (text && text.length > 0) {
          const minutes = Math.floor(startTime / 60);
          const seconds = Math.floor(startTime % 60);
          const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
          subtitles.push(`${timeStr} ${text}`);
        }
      }

      if (subtitles.length === 0) {
        return null;
      }

      return subtitles.join('\n');

    } catch (error) {
      console.error('XML 파싱 오류:', error);
      return null;
    }
  }

  /**
   * 자막 텍스트 포맷팅
   */
  formatSubtitle(transcriptData) {
    return transcriptData.map(entry => {
      const startTime = Math.floor(entry.offset / 1000);
      const minutes = Math.floor(startTime / 60);
      const seconds = startTime % 60;
      const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;

      return `${timestamp} ${entry.text.trim()}`;
    }).join('\n');
  }

  /**
   * 메인 수집 실행 함수
   */
  async collectVideosAndSubtitles(channelLimit = 5, videosPerChannel = null) {
    console.log(`\n🚀 영상 및 자막 수집 시작`);
    console.log(`📅 시작 시각: ${new Date().toLocaleString('ko-KR')}`);
    console.log(`🎯 대상 채널: ${channelLimit}개`);

    const startTime = Date.now();
    const results = {
      channels: 0,
      videos: {
        total: 0,
        new: 0,
        updated: 0,
        errors: 0
      },
      subtitles: {
        collected: 0,
        noSubtitle: 0,
        failed: 0
      }
    };

    try {
      // 수집할 채널 목록 가져오기 (구독자 많은 순)
      const channels = await Channel.find({})
        .sort({ subscriberCount: -1 })
        .limit(channelLimit)
        .lean();

      console.log(`\n📋 총 ${channels.length}개 채널에서 영상 수집 시작\n`);

      for (const channel of channels) {
        results.channels++;

        // 1. 채널의 모든 영상 목록 수집
        const videos = await this.getChannelVideos(channel.channelId, channel.channelName);

        // 2. 영상 저장
        for (const videoData of videos) {
          const result = await this.saveVideo(videoData);

          if (result.saved) {
            results.videos.new++;
          } else if (result.updated) {
            results.videos.updated++;
          } else if (result.error) {
            results.videos.errors++;
          }

          results.videos.total++;
        }

        // API 호출 제한을 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`\n📊 영상 수집 완료 요약:`);
      console.log(`⏱️ 소요 시간: ${duration}초`);
      console.log(`📺 처리 채널: ${results.channels}개`);
      console.log(`🎬 총 영상: ${results.videos.total}개`);
      console.log(`✨ 신규: ${results.videos.new}개`);
      console.log(`🔄 업데이트: ${results.videos.updated}개`);
      console.log(`❌ 오류: ${results.videos.errors}개`);
      console.log(`📅 종료 시각: ${new Date().toLocaleString('ko-KR')}\n`);

      return results;

    } catch (error) {
      console.error(`❌ 영상 수집 중 오류 발생:`, error);
      throw error;
    }
  }
}

module.exports = VideoCollector;
