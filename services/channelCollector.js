const fetch = require('node-fetch');
const config = require('../config/scheduler.config');
const Channel = require('../models/Channel');

/**
 * YouTube 채널 자동 수집 서비스
 */
class ChannelCollector {
  constructor() {
    this.apiKeys = this.getYouTubeApiKeys();
    this.currentKeyIndex = 0;
    this.collectedCount = 0;
    this.todayCollectedCount = 0;
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
   * 다음 API 키로 전환
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
      // 재시도 로직
      if (retryCount < config.retry.maxAttempts - 1) {
        const delay = config.retry.exponentialBackoff
          ? config.retry.delayMs * Math.pow(2, retryCount)
          : config.retry.delayMs;

        console.log(`🔄 재시도 (${retryCount + 1}/${config.retry.maxAttempts}), ${delay}ms 대기...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callYouTubeAPI(endpoint, params, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * 키워드로 채널 검색
   */
  async searchChannelsByKeyword(keyword, maxResults = 10) {
    console.log(`🔍 키워드 검색: "${keyword}"`);

    try {
      const searchData = await this.callYouTubeAPI('search', {
        part: 'snippet',
        q: keyword,
        type: 'channel',
        maxResults: Math.min(maxResults, config.api.youtube.maxResultsPerPage),
        order: config.api.youtube.order,
        regionCode: config.api.youtube.regionCode,
        relevanceLanguage: config.filters.language
      });

      if (!searchData.items || searchData.items.length === 0) {
        console.log(`ℹ️ "${keyword}" 검색 결과 없음`);
        return [];
      }

      console.log(`✅ "${keyword}" 검색 결과: ${searchData.items.length}개 채널`);

      // 채널 ID 목록 추출
      const channelIds = searchData.items.map(item => item.snippet.channelId);

      // 채널 상세 정보 조회
      const channels = await this.getChannelsDetails(channelIds, keyword);

      // 필터링 적용
      const filteredChannels = this.filterChannels(channels);

      console.log(`🎯 필터링 후: ${filteredChannels.length}개 채널`);

      return filteredChannels;

    } catch (error) {
      console.error(`❌ 키워드 "${keyword}" 검색 실패:`, error.message);
      return [];
    }
  }

  /**
   * 채널 상세 정보 조회
   */
  async getChannelsDetails(channelIds, searchKeyword = '') {
    if (channelIds.length === 0) return [];

    try {
      const channelData = await this.callYouTubeAPI('channels', {
        part: 'snippet,statistics',
        id: channelIds.join(',')
      });

      if (!channelData.items) return [];

      return channelData.items.map(channel => ({
        channelId: channel.id,
        channelName: channel.snippet.title,
        channelUrl: `https://www.youtube.com/channel/${channel.id}`,
        description: channel.snippet.description || '',
        subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
        videoCount: parseInt(channel.statistics.videoCount || 0),
        viewCount: parseInt(channel.statistics.viewCount || 0),
        thumbnail: channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url || '',
        publishedAt: new Date(channel.snippet.publishedAt),
        searchKeyword: searchKeyword,
        metadata: {
          country: channel.snippet.country || 'KR',
          language: config.filters.language,
          customUrl: channel.snippet.customUrl || ''
        }
      }));

    } catch (error) {
      console.error(`❌ 채널 상세 정보 조회 실패:`, error.message);
      return [];
    }
  }

  /**
   * 채널 필터링
   */
  filterChannels(channels) {
    const { subscriberCount, videoCount } = config.filters;

    return channels.filter(channel => {
      // 구독자 수 필터
      if (channel.subscriberCount < subscriberCount.min ||
          channel.subscriberCount > subscriberCount.max) {
        return false;
      }

      // 영상 개수 필터 (videoCount.min이 0이면 무관)
      if (videoCount.min > 0 && channel.videoCount < videoCount.min) {
        return false;
      }

      return true;
    });
  }

  /**
   * 채널 중복 확인 및 저장
   */
  async saveChannel(channelData) {
    try {
      // 이미 존재하는 채널인지 확인
      const existingChannel = await Channel.findOne({ channelId: channelData.channelId });

      if (existingChannel) {
        console.log(`ℹ️ 이미 존재하는 채널: ${channelData.channelName} (${channelData.channelId})`);
        return { saved: false, updated: false, channel: existingChannel };
      }

      // 새 채널 저장
      const newChannel = new Channel({
        ...channelData,
        status: 'collected',
        category: ['여행', '해외여행'],
        createdAt: new Date()
      });

      await newChannel.save();

      console.log(`✅ 새 채널 저장: ${channelData.channelName} (구독자 ${channelData.subscriberCount.toLocaleString()}명)`);

      this.collectedCount++;
      this.todayCollectedCount++;

      return { saved: true, updated: false, channel: newChannel };

    } catch (error) {
      console.error(`❌ 채널 저장 실패 (${channelData.channelName}):`, error.message);
      return { saved: false, updated: false, error: error.message };
    }
  }

  /**
   * 메인 수집 실행 함수
   */
  async collectChannels(limit = config.quota.perRunLimit) {
    console.log(`\n🚀 채널 수집 시작 (목표: ${limit}개)`);
    console.log(`📅 시작 시각: ${new Date().toLocaleString('ko-KR')}`);

    const startTime = Date.now();
    this.collectedCount = 0;

    const results = {
      total: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
      keywords: {}
    };

    try {
      // 키워드 목록 가져오기
      const keywords = config.searchKeywords;

      // 키워드를 섞어서 다양한 결과 얻기
      const shuffledKeywords = this.shuffleArray([...keywords]);

      for (const keyword of shuffledKeywords) {
        // 할당량 체크
        if (this.collectedCount >= limit) {
          console.log(`✅ 목표 달성: ${this.collectedCount}개 채널 수집 완료`);
          break;
        }

        // 키워드당 검색할 최대 개수
        const remainingQuota = limit - this.collectedCount;
        const searchLimit = Math.min(10, remainingQuota);

        // 채널 검색
        const channels = await this.searchChannelsByKeyword(keyword, searchLimit);

        results.keywords[keyword] = {
          searched: channels.length,
          saved: 0,
          duplicates: 0
        };

        // 채널 저장
        for (const channelData of channels) {
          if (this.collectedCount >= limit) break;

          const result = await this.saveChannel(channelData);

          if (result.saved) {
            results.saved++;
            results.keywords[keyword].saved++;
          } else if (!result.error) {
            results.duplicates++;
            results.keywords[keyword].duplicates++;
          } else {
            results.errors++;
          }

          results.total++;
        }

        // API 호출 제한을 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`\n📊 수집 완료 요약:`);
      console.log(`⏱️ 소요 시간: ${duration}초`);
      console.log(`📝 총 처리: ${results.total}개`);
      console.log(`✅ 신규 저장: ${results.saved}개`);
      console.log(`🔄 중복 제외: ${results.duplicates}개`);
      console.log(`❌ 오류: ${results.errors}개`);
      console.log(`📅 종료 시각: ${new Date().toLocaleString('ko-KR')}`);

      return results;

    } catch (error) {
      console.error(`❌ 채널 수집 중 오류 발생:`, error);
      throw error;
    }
  }

  /**
   * 배열 섞기 (Fisher-Yates shuffle)
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * 오늘 수집된 채널 수 조회
   */
  async getTodayCollectedCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await Channel.countDocuments({
      createdAt: { $gte: today }
    });

    return count;
  }
}

module.exports = ChannelCollector;
