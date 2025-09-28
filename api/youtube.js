// YouTube API Serverless Function for Vercel
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL이 필요합니다.' });
    }

    console.log('📥 YouTube URL 요청:', url);

    // YouTube API 키 가져오기
    const apiKeys = getYouTubeApiKeys();

    if (apiKeys.length === 0) {
      console.error('❌ YouTube API 키가 설정되지 않음');
      return res.status(500).json({
        error: 'YouTube API 키가 설정되지 않았습니다.',
        debug: {
          envKeys: Object.keys(process.env).filter(key => key.includes('YOUTUBE'))
        }
      });
    }

    console.log('🔑 API 키 개수:', apiKeys.length);

    // YouTube URL 분석 및 채널 ID 추출
    const channelId = await extractChannelId(url, apiKeys[0]);
    if (!channelId) {
      return res.status(400).json({ error: '유효하지 않은 YouTube URL입니다.' });
    }

    console.log('🆔 채널 ID:', channelId);

    // 채널 정보 가져오기
    const channelInfo = await getChannelInfo(channelId, apiKeys[0]);

    // 채널의 동영상 목록 가져오기 (전체)
    const videos = await getAllChannelVideos(channelId, apiKeys[0], channelInfo?.videoCount || 1000);

    console.log('✅ 성공:', { channelTitle: channelInfo?.title, videoCount: videos?.length });

    return res.status(200).json({
      success: true,
      channel: channelInfo,
      videos: videos,
      totalVideos: videos?.length || 0
    });

  } catch (error) {
    console.error('❌ YouTube API 오류:', error);
    return res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// YouTube API 키 가져오기 함수
function getYouTubeApiKeys() {
  const keys = [];

  // 다양한 환경변수명 지원
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
      console.log(`✅ API 키 발견: ${keyName}`);
    }
  }

  return keys;
}

// YouTube URL에서 채널 ID 추출
async function extractChannelId(url, apiKey) {
  try {
    // @handle 형식 처리
    const handleMatch = url.match(/youtube\.com\/@([^/?]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];
      console.log('🔍 핸들 감지:', handle);

      // Search API를 사용해서 채널 찾기
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent('@' + handle)}&key=${apiKey}`;
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        return data.items[0].snippet.channelId;
      }
    }

    // /c/ 형식 처리
    const customMatch = url.match(/youtube\.com\/c\/([^/?]+)/);
    if (customMatch) {
      const customUrl = customMatch[1];
      console.log('🔍 커스텀 URL 감지:', customUrl);

      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(customUrl)}&key=${apiKey}`;
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        return data.items[0].snippet.channelId;
      }
    }

    // /channel/ 형식 처리
    const channelMatch = url.match(/youtube\.com\/channel\/([^/?]+)/);
    if (channelMatch) {
      return channelMatch[1];
    }

    // /user/ 형식 처리
    const userMatch = url.match(/youtube\.com\/user\/([^/?]+)/);
    if (userMatch) {
      const username = userMatch[1];
      console.log('🔍 사용자명 감지:', username);

      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(username)}&key=${apiKey}`;
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        return data.items[0].snippet.channelId;
      }
    }

    // 동영상 URL에서 채널 ID 추출
    const videoMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (videoMatch) {
      const videoId = videoMatch[1];
      console.log('🎥 동영상 ID 감지:', videoId);

      const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
      const response = await fetch(videoUrl);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        return data.items[0].snippet.channelId;
      }
    }

    return null;
  } catch (error) {
    console.error('채널 ID 추출 오류:', error);
    return null;
  }
}

// 채널 정보 가져오기
async function getChannelInfo(channelId, apiKey) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const channel = data.items[0];
      return {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url,
        subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
        videoCount: parseInt(channel.statistics.videoCount || 0),
        viewCount: parseInt(channel.statistics.viewCount || 0)
      };
    }
    return null;
  } catch (error) {
    console.error('채널 정보 조회 오류:', error);
    return null;
  }
}

// 채널의 모든 동영상 목록 가져오기 (개선된 방법)
async function getAllChannelVideos(channelId, apiKey, totalVideoCount) {
  console.log(`📊 시작: 채널 ID ${channelId}, 총 영상 수: ${totalVideoCount}`);

  // 방법 1: 채널 업로드 플레이리스트 시도
  try {
    const playlistResult = await getChannelVideosPlaylist(channelId, apiKey);
    if (playlistResult && playlistResult.length > 0) {
      console.log(`✅ 플레이리스트 방식 성공: ${playlistResult.length}개 영상`);
      return playlistResult;
    }
  } catch (error) {
    console.error('플레이리스트 방식 실패:', error.message);
  }

  // 방법 2: Search API 폴백
  try {
    const searchResult = await getChannelVideosSearch(channelId, apiKey);
    console.log(`✅ Search 방식 성공: ${searchResult.length}개 영상`);
    return searchResult;
  } catch (error) {
    console.error('Search 방식 실패:', error.message);
    return [];
  }
}

// 플레이리스트 방식으로 채널 동영상 가져오기
async function getChannelVideosPlaylist(channelId, apiKey) {
  const uploadsPlaylistId = 'UU' + channelId.substring(2);
  console.log(`🎬 업로드 플레이리스트 ID: ${uploadsPlaylistId}`);

  let allVideos = [];
  let nextPageToken = null;
  const maxPerPage = 50;
  let pageCount = 0;
  const maxPages = 20;

  do {
    pageCount++;
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxPerPage}&key=${apiKey}`;
    if (nextPageToken) {
      url += `&pageToken=${nextPageToken}`;
    }

    console.log(`🔄 플레이리스트 페이지 ${pageCount} 요청`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`YouTube API 오류: ${data.error.message}`);
    }

    if (!data.items || data.items.length === 0) {
      console.log(`❌ 더 이상 영상이 없습니다.`);
      break;
    }

    // 현재 페이지의 동영상 ID들 수집
    const videoIds = data.items
      .filter(item => item.snippet?.resourceId?.videoId)
      .map(item => item.snippet.resourceId.videoId)
      .join(',');

    if (!videoIds) {
      console.log(`⚠️ 페이지 ${pageCount}에서 유효한 비디오 ID를 찾을 수 없습니다.`);
      break;
    }

    // 동영상 세부 정보 가져오기
    const videos = await getVideoDetails(videoIds, apiKey);
    allVideos = allVideos.concat(videos);
    nextPageToken = data.nextPageToken;

    console.log(`✅ ${videos.length}개 추가됨, 총 ${allVideos.length}개`);

    if (!nextPageToken || pageCount >= maxPages) {
      console.log(`🎯 플레이리스트 완료: nextPageToken=${!!nextPageToken}, pageCount=${pageCount}`);
      break;
    }

  } while (true);

  return allVideos;
}

// 동영상 세부 정보 가져오기 (공통 함수)
async function getVideoDetails(videoIds, apiKey) {
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
  const detailsResponse = await fetch(detailsUrl);

  if (!detailsResponse.ok) {
    throw new Error(`동영상 세부정보 API 오류: ${detailsResponse.status}`);
  }

  const detailsData = await detailsResponse.json();

  if (detailsData.error) {
    throw new Error(`YouTube API 오류: ${detailsData.error.message}`);
  }

  const travelKeywords = ['여행', '관광', '맛집', 'travel', '호텔', '리조트', '카페', '바다', '산', '도시', '투어', '휴가', '맛있는', '음식', '식당'];

  return detailsData.items.map(details => {
    const duration = details.contentDetails?.duration;
    const durationInSeconds = parseDuration(duration);
    const hasSubtitles = details.contentDetails?.caption === 'true';

    const title = (details.snippet?.title || '').toLowerCase();
    const description = (details.snippet?.description || '').toLowerCase();
    const isTravelRelated = travelKeywords.some(keyword =>
      title.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())
    );

    return {
      id: details.id,
      title: details.snippet?.title || '',
      description: details.snippet?.description || '',
      thumbnail: details.snippet?.thumbnails?.medium?.url || details.snippet?.thumbnails?.default?.url || '',
      publishedAt: details.snippet?.publishedAt || '',
      channelTitle: details.snippet?.channelTitle || '',
      url: `https://www.youtube.com/watch?v=${details.id}`,
      duration: duration || '',
      durationInSeconds: durationInSeconds,
      hasSubtitles: hasSubtitles,
      isTravelRelated: isTravelRelated,
      viewCount: parseInt(details.statistics?.viewCount || 0)
    };
  });
}

// Search API 방식 (폴백용) - 개선된 버전
async function getChannelVideosSearch(channelId, apiKey) {
  let allVideos = [];
  let nextPageToken = null;
  const maxPerPage = 50;
  let pageCount = 0;
  const maxPages = 15; // 최대 750개

  do {
    pageCount++;
    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${maxPerPage}&key=${apiKey}`;
    if (nextPageToken) {
      url += `&pageToken=${nextPageToken}`;
    }

    console.log(`🔄 Search 페이지 ${pageCount} 요청`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search API 응답 오류: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`YouTube Search API 오류: ${data.error.message}`);
    }

    if (!data.items || data.items.length === 0) {
      console.log(`❌ Search API: 더 이상 영상이 없습니다.`);
      break;
    }

    const videoIds = data.items
      .filter(item => item.id?.videoId)
      .map(item => item.id.videoId)
      .join(',');

    if (!videoIds) {
      console.log(`⚠️ Search 페이지 ${pageCount}에서 유효한 비디오 ID를 찾을 수 없습니다.`);
      break;
    }

    const videos = await getVideoDetails(videoIds, apiKey);
    allVideos = allVideos.concat(videos);
    nextPageToken = data.nextPageToken;

    console.log(`✅ Search: ${videos.length}개 추가됨, 총 ${allVideos.length}개`);

    if (!nextPageToken || pageCount >= maxPages) {
      console.log(`🎯 Search 완료: nextPageToken=${!!nextPageToken}, pageCount=${pageCount}`);
      break;
    }

  } while (true);

  return allVideos;
}

// 기존 단일 페이지 동영상 목록 가져오기 함수 (백업용)
async function getChannelVideos(channelId, apiKey, maxResults = 20) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items) {
      const videoIds = data.items.map(item => item.id.videoId).join(',');

      // 동영상 세부 정보 가져오기 (duration, contentDetails 포함)
      const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();

      return data.items.map(item => {
        const details = detailsData.items?.find(d => d.id === item.id.videoId);

        // ISO 8601 duration을 초로 변환
        const duration = details?.contentDetails?.duration;
        const durationInSeconds = parseDuration(duration);

        // 자막 여부 확인 (captions available)
        const hasSubtitles = details?.contentDetails?.caption === 'true';

        // 여행 관련 키워드 검사
        const travelKeywords = ['여행', '관광', '맛집', 'travel', '호텔', '리조트', '카페', '바다', '산', '도시', '투어', '휴가', '맛있는', '음식', '식당'];
        const title = item.snippet.title.toLowerCase();
        const description = item.snippet.description.toLowerCase();
        const isTravelRelated = travelKeywords.some(keyword =>
          title.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())
        );

        return {
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
          publishedAt: item.snippet.publishedAt,
          channelTitle: item.snippet.channelTitle,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          duration: duration,
          durationInSeconds: durationInSeconds,
          hasSubtitles: hasSubtitles,
          isTravelRelated: isTravelRelated,
          viewCount: parseInt(details?.statistics?.viewCount || 0)
        };
      });
    }
    return [];
  } catch (error) {
    console.error('동영상 목록 조회 오류:', error);
    return [];
  }
}

// ISO 8601 duration을 초로 변환하는 함수
function parseDuration(duration) {
  if (!duration) return 0;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}