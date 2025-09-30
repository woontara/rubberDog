require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

// Node.js 18+ 에서는 fetch가 내장, 그 이전 버전에서는 node-fetch 사용
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (error) {
  console.warn('Fetch not available:', error.message);
}
// 인증 시스템을 비활성화하고 YouTube 분석 기능만 사용
console.log('ℹ️ 인증 시스템 비활성화 - YouTube 분석 전용 모드');
let userManager = null;
let userDataManager = null;
let usingMongoDB = false;


// Default Claude API 키 (fallback only - 환경변수에서 가져옴)
const DEFAULT_CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Claude API 통합 함수
async function callClaude(prompt, apiKey) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Claude API 호출 실패:', error);
    throw error;
  }
}

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};


// YouTube API Key 관리 함수
function getYouTubeApiKeys() {
  const keys = [];

  // 다양한 환경변수명 지원
  const possibleKeys = [
    'YOUTUBE_API_KEY_PRIMARY',
    'YOUTUBE_API_KEY_BACKUP',
    'YOUTUBE_API_KEY_ADDITIONAL',
    'YOUTUBE_API_KEY',  // 기본
    'YOUTUBE_API_KEY_1',
    'YOUTUBE_API_KEY_2',
    'YOUTUBE_API_KEY_3'
  ];

  // 각 환경변수를 확인해서 추가
  for (const keyName of possibleKeys) {
    if (process.env[keyName]) {
      keys.push(process.env[keyName]);
      console.log(`✅ Found API key: ${keyName}`);
    }
  }

  // 단일 환경변수에서 쉼표로 구분된 키들 읽기 (fallback)
  if (keys.length === 0 && process.env.YOUTUBE_API_KEYS) {
    keys.push(...process.env.YOUTUBE_API_KEYS.split(',').map(key => key.trim()));
    console.log(`✅ Found API keys from YOUTUBE_API_KEYS: ${keys.length} keys`);
  }

  // 디버깅: 환경변수가 하나도 없다면 테스트용 에러 메시지
  if (keys.length === 0) {
    console.error('🚨 No YouTube API keys found!');
    console.error('Environment variables available:', Object.keys(process.env).filter(k => k.includes('YOUTUBE')));
    console.error('All env vars count:', Object.keys(process.env).length);
  }

  return keys;
}

// YouTube URL에서 채널 ID나 비디오 ID 추출
function parseYouTubeUrl(url) {
  try {
    const urlObj = new URL(url);

    // 채널 URL 패턴들
    if (urlObj.pathname.startsWith('/@')) {
      return { type: 'channel', id: urlObj.pathname.slice(2) };
    }
    if (urlObj.pathname.startsWith('/c/')) {
      return { type: 'channel', id: urlObj.pathname.slice(3) };
    }
    if (urlObj.pathname.startsWith('/channel/')) {
      return { type: 'channel', id: urlObj.pathname.slice(9) };
    }
    if (urlObj.pathname.startsWith('/user/')) {
      return { type: 'user', id: urlObj.pathname.slice(6) };
    }

    // 비디오 URL 패턴들
    if (urlObj.hostname === 'youtu.be') {
      return { type: 'video', id: urlObj.pathname.slice(1) };
    }
    if (urlObj.pathname === '/watch' && urlObj.searchParams.get('v')) {
      return { type: 'video', id: urlObj.searchParams.get('v') };
    }

    return null;
  } catch (error) {
    console.error('URL parsing error:', error);
    return null;
  }
}

// YouTube Data API 호출 함수
async function callYouTubeAPI(endpoint, params, apiKey) {
  const baseUrl = 'https://www.googleapis.com/youtube/v3';
  const searchParams = new URLSearchParams({
    ...params,
    key: apiKey
  });

  const apiUrl = `${baseUrl}/${endpoint}?${searchParams}`;

  console.log(`🚀 Calling YouTube API: ${endpoint}`);
  console.log(`📍 Full URL: ${baseUrl}/${endpoint}?${Object.keys(params).map(k => `${k}=${params[k]}`).join('&')}&key=[HIDDEN]`);
  console.log(`🔑 API Key length: ${apiKey ? apiKey.length : 0}`);
  console.log(`🔑 API Key starts with: ${apiKey ? apiKey.substring(0, 10) + '...' : 'null'}`);

  try {
    const response = await fetch(apiUrl);

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error Response:`, errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: { message: errorText } };
      }

      const errorMsg = `YouTube API Error ${response.status}: ${errorData.error?.message || response.statusText}`;
      console.error(`❌ Final error message:`, errorMsg);
      throw new Error(errorMsg);
    }

    const jsonData = await response.json();
    console.log(`✅ API Success! Items count: ${jsonData.items ? jsonData.items.length : 0}`);
    return jsonData;

  } catch (error) {
    console.error(`🚨 API Call Failed:`, error.message);
    throw error;
  }
}

// YouTube 분석 함수
async function analyzeYouTube(url, apiKeys, filters = {}) {
  const parsed = parseYouTubeUrl(url);

  if (!parsed) {
    throw new Error('올바른 YouTube URL이 아닙니다.');
  }

  if (!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
    throw new Error('YouTube API 키가 설정되지 않았습니다.');
  }

  let apiKeyIndex = 0;
  let lastError;

  // API 키를 순차적으로 시도
  for (const apiKey of apiKeys) {
    try {
      if (parsed.type === 'video') {
        return await analyzeVideo(parsed.id, apiKey);
      } else {
        return await analyzeChannel(parsed.id, parsed.type, apiKey, filters);
      }
    } catch (error) {
      lastError = error;
      console.error(`API Key ${apiKeyIndex + 1} failed:`, error.message);
      apiKeyIndex++;

      // 할당량 초과나 인증 오류가 아닌 경우 즉시 중단
      if (!error.message.includes('quota') && !error.message.includes('credentials')) {
        throw error;
      }
    }
  }

  throw new Error(`모든 API 키가 실패했습니다. 마지막 오류: ${lastError?.message}`);
}

// 비디오 분석
async function analyzeVideo(videoId, apiKey) {
  const videoData = await callYouTubeAPI('videos', {
    part: 'snippet,statistics',
    id: videoId
  }, apiKey);

  if (videoData.items.length === 0) {
    throw new Error('비디오를 찾을 수 없습니다.');
  }

  const video = videoData.items[0];
  const snippet = video.snippet;
  const stats = video.statistics;

  return {
    type: 'video',
    videos: [{
      id: videoId,
      title: snippet.title,
      description: snippet.description,
      publishedAt: snippet.publishedAt,
      thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url,
      viewCount: parseInt(stats.viewCount || 0),
      likeCount: parseInt(stats.likeCount || 0),
      commentCount: parseInt(stats.commentCount || 0),
      duration: 'N/A'
    }],
    channel: {
      id: snippet.channelId,
      title: snippet.channelTitle,
      thumbnail: null
    }
  };
}

// 채널 분석
async function analyzeChannel(channelIdentifier, identifierType, apiKey, filters = {}) {
  let channelId;

  if (identifierType === 'channel') {
    channelId = channelIdentifier;
  } else {
    // 사용자명이나 커스텀 URL인 경우 채널 ID로 변환
    const searchData = await callYouTubeAPI('search', {
      part: 'snippet',
      q: channelIdentifier,
      type: 'channel',
      maxResults: 1
    }, apiKey);

    if (searchData.items.length === 0) {
      throw new Error('채널을 찾을 수 없습니다.');
    }

    channelId = searchData.items[0].snippet.channelId;
  }

  // 채널 정보 가져오기
  const channelData = await callYouTubeAPI('channels', {
    part: 'snippet,statistics',
    id: channelId
  }, apiKey);

  if (channelData.items.length === 0) {
    throw new Error('채널을 찾을 수 없습니다.');
  }

  const channel = channelData.items[0];

  // 채널의 비디오 목록 가져오기
  const videosData = await callYouTubeAPI('search', {
    part: 'snippet',
    channelId: channelId,
    type: 'video',
    order: 'date',
    maxResults: 20
  }, apiKey);

  const videos = videosData.items.map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    viewCount: 0,
    duration: 'N/A'
  }));

  return {
    type: 'channel',
    channel: {
      id: channelId,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail: channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url,
      subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
      videoCount: parseInt(channel.statistics.videoCount || 0),
      viewCount: parseInt(channel.statistics.viewCount || 0)
    },
    videos: videos
  };
}


// Helper function to run YouTube API (JavaScript 버전)
async function runYouTubeScript(action, urlOrId, page = 1, filters = {}, callback) {
  try {
    const apiKeys = getYouTubeApiKeys();

    // 디버깅을 위한 로그 추가
    console.log('Environment variables check:');
    console.log('YOUTUBE_API_KEY_PRIMARY:', process.env.YOUTUBE_API_KEY_PRIMARY ? 'SET' : 'NOT SET');
    console.log('YOUTUBE_API_KEY_BACKUP:', process.env.YOUTUBE_API_KEY_BACKUP ? 'SET' : 'NOT SET');
    console.log('YOUTUBE_API_KEY_ADDITIONAL:', process.env.YOUTUBE_API_KEY_ADDITIONAL ? 'SET' : 'NOT SET');
    console.log('YOUTUBE_API_KEYS:', process.env.YOUTUBE_API_KEYS ? 'SET' : 'NOT SET');
    console.log('Total API keys found:', apiKeys.length);

    if (apiKeys.length === 0) {
      console.error('🚨 No YouTube API keys found!');
      console.error('Environment variables available:', Object.keys(process.env).filter(key => key.includes('YOUTUBE')));
      console.error('All env vars count:', Object.keys(process.env).length);
      const errorMsg = 'YouTube API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.';
      throw new Error(errorMsg);
    }

    if (action === 'analyze') {
      console.log('Starting YouTube analysis for:', urlOrId);
      const result = await analyzeYouTube(urlOrId, apiKeys, filters);
      callback(null, result);
    } else if (action === 'subtitle') {
      console.log('Starting YouTube subtitle extraction for:', urlOrId);
      const result = await extractSubtitle(urlOrId);
      callback(null, result);
    } else {
      callback('지원하지 않는 액션입니다.', null);
    }
  } catch (error) {
    console.error('YouTube API Error:', error);
    callback(error.message, null);
  }
}

// YouTube 자막 추출 라이브러리 import
const { YoutubeTranscript } = require('youtube-transcript');

// YouTube URL에서 비디오 ID 추출하는 함수
function extractVideoId(url) {
  if (!url) return null;

  // 이미 11자리 ID인 경우
  if (url.length === 11 && !url.includes('/')) {
    return url;
  }

  // YouTube URL 패턴들
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// 자막 텍스트를 시간과 함께 포맷하는 함수
function formatSubtitle(transcriptData) {
  if (!transcriptData || !Array.isArray(transcriptData)) {
    return '';
  }

  return transcriptData.map(entry => {
    const startTime = Math.floor(entry.offset / 1000);
    const minutes = Math.floor(startTime / 60);
    const seconds = startTime % 60;
    const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;

    return `${timestamp} ${entry.text.trim()}`;
  }).join('\n');
}

// 자막 추출 함수 (Python 백업 + JavaScript)
async function extractSubtitle(videoId) {
  // Vercel 환경 감지
  const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';

  if (isVercel) {
    // Vercel 환경에서는 JavaScript 사용
    return await extractSubtitleWithJS(videoId);
  } else {
    // 로컬 환경에서는 Python 우선, 실패시 JavaScript
    try {
      return await extractSubtitleWithPython(videoId);
    } catch (error) {
      console.log('🔄 Python 실패, JavaScript로 전환...');
      return await extractSubtitleWithJS(videoId);
    }
  }
}

// JavaScript 자막 추출
async function extractSubtitleWithJS(videoId) {
  try {
    console.log('🎬 JavaScript로 자막 추출 시작:', videoId);

    // 언어 옵션 (한국어 우선)
    const languageOptions = [
      { lang: 'ko' },
      { lang: 'ko-KR' },
      { lang: 'en' },
      { lang: 'en-US' },
      { lang: 'ja' },
      {} // 언어 지정 없음
    ];

    let lastError = null;

    // 각 언어 옵션을 시도
    for (const langOption of languageOptions) {
      try {
        const langCode = langOption.lang || 'auto';
        console.log(`🌐 ${langCode} 언어로 시도 중...`);

        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, langOption);

        if (transcriptData && transcriptData.length > 0) {
          const formattedSubtitle = formatSubtitle(transcriptData);

          console.log(`✅ 자막 추출 성공: ${langCode} (${transcriptData.length}개 세그먼트)`);

          return {
            success: true,
            subtitle: formattedSubtitle,
            language: langCode === 'auto' ? 'Auto-detected' : langCode,
            language_code: langCode,
            is_generated: false,
            video_id: videoId,
            segments_count: transcriptData.length,
            method: 'youtube-transcript-js'
          };
        }
      } catch (error) {
        lastError = error;
        console.log(`❌ ${langOption.lang || 'auto'} 언어 실패: ${error.message}`);
        continue;
      }
    }

    // 모든 언어 시도 실패
    const errorMessage = lastError?.message || 'Unknown error';
    console.log(`❌ JavaScript 자막 추출 실패: ${videoId}`);

    return {
      success: false,
      error: 'EXTRACTION_FAILED',
      message: 'JavaScript 자막 추출에 실패했습니다.',
      video_id: videoId,
      detailed_error: errorMessage
    };

  } catch (error) {
    console.error('❌ JavaScript 자막 추출 오류:', error);
    return {
      success: false,
      error: 'JS_ERROR',
      message: 'JavaScript 엔진 오류가 발생했습니다.',
      detailed_error: error.message
    };
  }
}

// Python 자막 추출 (로컬 환경용)
async function extractSubtitleWithPython(videoId) {
  return new Promise((resolve, reject) => {
    console.log('🎬 Python으로 자막 추출 시작:', videoId);

    // Python 스크립트 실행
    const pythonProcess = spawn('python', ['youtube_subtitle_real.py', 'subtitle', videoId], {
      encoding: 'utf8'
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    pythonProcess.on('close', (code) => {
      console.log(`🐍 Python 스크립트 종료. 코드: ${code}`);

      if (code !== 0) {
        console.error('Python 스크립트 오류:', stderr);
        reject(new Error(`Python 실행 실패: ${stderr || 'Unknown error'}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        console.log('📝 Python 자막 추출 결과:', result.subtitle ? '성공' : '실패');

        if (result.error) {
          resolve({
            success: false,
            error: result.error,
            message: result.error
          });
        } else {
          resolve({
            success: true,
            subtitle: result.subtitle,
            language: result.language,
            language_code: result.language_code,
            is_generated: result.is_generated,
            video_id: result.video_id,
            method: 'python-youtube-transcript-api'
          });
        }
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        console.error('Python 출력:', stdout);
        reject(new Error(`결과 파싱 실패: ${parseError.message}`));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Python 프로세스 오류:', error);
      reject(new Error(`Python 프로세스 실행 실패: ${error.message}`));
    });
  });
}

// 공통 Request Handler 함수
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

  // 모든 요청 로깅
  console.log(`📡 요청: ${req.method} ${pathname}`);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname);
    return;
  }

  // Static file serving - Vercel 환경 대응
  let publicDir;
  try {
    // Vercel 환경에서는 public 디렉토리 위치가 다를 수 있음
    publicDir = process.env.VERCEL ? path.join(process.cwd(), 'public') : path.join(__dirname, '..', 'public');
  } catch (error) {
    publicDir = path.join(__dirname, '..', 'public');
  }

  let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

  // Security check
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// Create HTTP server (로컬 환경용)
const server = http.createServer(handleRequest);

// Extract session from request (비활성화됨)
function getSessionFromRequest(req) {
  return null; // 인증 시스템 비활성화
}

// Get user from session (비활성화됨 - 인증 없이 사용)
function getUserFromSession(req) {
  return null; // 인증 시스템 비활성화
}

// Handle API requests
function handleApiRequest(req, res, pathname) {
  res.setHeader('Content-Type', 'application/json');

  // Authentication routes (no session required)
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    handleUserRegister(req, res);
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    handleUserLogin(req, res);
    return;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    handleUserLogout(req, res);
    return;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    handleUserInfo(req, res);
    return;
  }

  if (pathname === '/api/user/api-keys' && req.method === 'POST') {
    handleUpdateApiKeys(req, res);
    return;
  }

  if (pathname === '/api/user/settings' && req.method === 'POST') {
    handleUpdateSettings(req, res);
    return;
  }

  // User data routes
  if (pathname === '/api/user/subtitles' && req.method === 'GET') {
    handleGetUserSubtitles(req, res);
    return;
  }

  if (pathname === '/api/user/subtitles' && req.method === 'POST') {
    handleSaveUserSubtitle(req, res);
    return;
  }

  if (pathname === '/api/user/blogs' && req.method === 'GET') {
    handleGetUserBlogs(req, res);
    return;
  }

  if (pathname === '/api/user/blogs' && req.method === 'POST') {
    handleSaveUserBlog(req, res);
    return;
  }

  // Environment variable debugging endpoint (for development)
  if (pathname === '/api/debug/env' && req.method === 'GET') {
    const debugInfo = {
      nodeEnv: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL,
      hasYoutubeKey1: !!process.env.YOUTUBE_API_KEY,
      hasYoutubeKey2: !!process.env.YOUTUBE_API_KEY_2,
      hasYoutubeKey3: !!process.env.YOUTUBE_API_KEY_3,
      hasClaudeKey: !!process.env.CLAUDE_API_KEY,
      hasMongoUri: !!process.env.MONGODB_URI,
      envKeys: Object.keys(process.env).filter(key =>
        key.includes('YOUTUBE') || key.includes('CLAUDE') || key.includes('MONGO')
      )
    };
    res.writeHead(200);
    res.end(JSON.stringify(debugInfo, null, 2));
    return;
  }

  // YouTube URL 분석 (인증 불필요)
  if (pathname === '/api/youtube/analyze' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        console.log('📥 YouTube API 요청 받음:', body);
        const data = JSON.parse(body);
        const { url, filters = {} } = data;
        console.log('🔍 파싱된 데이터:', { url, filters });

        // 실제 YouTube API 호출 (async/await 패턴)
        try {
          const apiKeys = getYouTubeApiKeys();
          console.log('🔑 API 키 개수:', apiKeys.length);

          if (apiKeys.length === 0) {
            throw new Error('YouTube API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.');
          }

          const result = await analyzeYouTube(url, apiKeys, filters);
          console.log('✅ YouTube API 성공:', result ? 'data received' : 'no data');
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error('❌ YouTube API 오류:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }

      } catch (e) {
        console.error('❌ JSON 파싱 오류:', e);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  // 자막 추출
  } else if (pathname === '/api/youtube/subtitle' && req.method === 'POST') {
    console.log('🌐 웹 앱에서 자막 추출 요청 받음:', pathname);
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { videoId, title } = data;
        console.log('📝 받은 데이터:', { videoId, title });

        if (!videoId) {
          console.log('❌ videoId가 없음');
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'videoId is required' }));
          return;
        }

        console.log('🎬 웹 앱 → 자막 추출 시작:', videoId);

        // 자막 추출 함수 호출
        extractSubtitle(videoId).then(result => {
          console.log('✅ 웹 앱 → 자막 추출 완료:', result.success ? '성공' : '실패');
          res.writeHead(200);
          res.end(JSON.stringify(result));
        }).catch(error => {
          console.log('❌ 웹 앱 → 자막 추출 오류:', error.message);
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        });

      } catch (e) {
        console.log('❌ 웹 앱 → JSON 파싱 오류:', e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  // 자막 추출 GET 요청 처리 (Method not allowed 응답)
  } else if (pathname === '/api/youtube/subtitle' && req.method === 'GET') {
    console.log('🌐 웹 앱에서 자막 추출 GET 요청 받음 (허용되지 않음):', pathname);
    res.writeHead(405, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'GET method is not allowed. Use POST method.'
    }));

  // yt-dlp 자막 추출
  } else if (pathname === '/api/youtube/subtitle-ytdlp' && req.method === 'POST') {
    console.log('🌐 웹 앱에서 yt-dlp 자막 추출 요청 받음:', pathname);
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { videoId, title } = data;
        console.log('📝 yt-dlp 받은 데이터:', { videoId, title });

        if (!videoId) {
          console.log('❌ videoId가 없음');
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'videoId is required' }));
          return;
        }

        console.log('🎬 웹 앱 → yt-dlp 자막 추출 시작:', videoId);

        // yt-dlp API 모듈 로드
        try {
          const ytdlpAPI = require('../api/youtube/subtitle_ytdlp.js');

          // mock request/response 객체 생성
          const mockReq = {
            method: 'POST',
            body: { videoId, title }
          };

          const mockRes = {
            statusCode: 200,
            headers: {},
            setHeader: function(key, value) {
              this.headers[key] = value;
            },
            status: function(code) {
              this.statusCode = code;
              return this;
            },
            json: function(data) {
              res.writeHead(this.statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                ...this.headers
              });
              res.end(JSON.stringify(data));
            },
            end: function() {
              res.writeHead(this.statusCode, this.headers);
              res.end();
            }
          };

          // yt-dlp API 호출
          await ytdlpAPI(mockReq, mockRes);

        } catch (error) {
          console.log('❌ 웹 앱 → yt-dlp 자막 추출 오류:', error.message);
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'SERVER_ERROR',
            message: error.message
          }));
        }

      } catch (e) {
        console.log('❌ 웹 앱 → JSON 파싱 오류:', e.message);
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  // 로컬 자막 추출
  } else if (pathname === '/api/youtube/subtitle-local' && req.method === 'POST') {
    console.log('🎯 로컬 자막 추출 요청 받음:', pathname);
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { videoId, title } = data;
        console.log('📝 로컬 자막 받은 데이터:', { videoId, title });

        if (!videoId) {
          console.log('❌ videoId가 없음');
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'videoId is required' }));
          return;
        }

        console.log('🎬 로컬 yt-dlp 자막 추출 시작:', videoId);

        // 로컬 자막 API 모듈 로드
        try {
          const localAPI = require('../api/youtube/subtitle_local.js');

          // mock request/response 객체 생성
          const mockReq = {
            method: 'POST',
            body: { videoId, title }
          };

          const mockRes = {
            setHeader: () => {},
            status: (code) => ({
              json: (data) => {
                res.writeHead(code, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
              },
              end: () => {
                res.writeHead(code, {
                  'Access-Control-Allow-Origin': '*'
                });
                res.end();
              }
            })
          };

          // API 호출
          await localAPI(mockReq, mockRes);

        } catch (apiError) {
          console.log('❌ 로컬 자막 API 오류:', apiError);
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'LOCAL_API_ERROR',
            message: apiError.message
          }));
        }

      } catch (e) {
        console.log('❌ 로컬 자막 JSON 파싱 오류:', e.message);
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  // 자막 업로드
  } else if (pathname === '/api/youtube/subtitle-upload') {
    console.log('📤 자막 업로드 요청 받음:', pathname, req.method);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (req.method === 'GET') {
      // GET 요청 처리
      (async () => {
        try {
          const uploadAPI = require('../api/youtube/subtitle_upload.js');

          const mockReq = {
            method: 'GET',
            query: require('url').parse(req.url, true).query
          };

          const mockRes = {
            setHeader: () => {},
            status: (code) => ({
              json: (data) => {
                res.writeHead(code, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
              }
            })
          };

          await uploadAPI(mockReq, mockRes);
        } catch (apiError) {
          console.log('❌ 업로드 API GET 오류:', apiError);
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'UPLOAD_API_ERROR',
            message: apiError.message
          }));
        }
      })();
    } else if (req.method === 'POST') {
      // POST 요청 처리
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          console.log('📝 자막 업로드 받은 데이터:', { videoId: data.videoId, hasSubtitle: !!data.subtitle });

          try {
            const uploadAPI = require('../api/youtube/subtitle_upload.js');

            const mockReq = {
              method: 'POST',
              body: data
            };

            const mockRes = {
              setHeader: () => {},
              status: (code) => ({
                json: (data) => {
                  res.writeHead(code, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                  });
                  res.end(JSON.stringify(data));
                }
              })
            };

            await uploadAPI(mockReq, mockRes);

          } catch (apiError) {
            console.log('❌ 업로드 API POST 오류:', apiError);
            res.writeHead(500, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
              success: false,
              error: 'UPLOAD_API_ERROR',
              message: apiError.message
            }));
          }

        } catch (e) {
          console.log('❌ 업로드 JSON 파싱 오류:', e.message);
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    }

  // D드라이브 로컬 자막 업로드
  } else if (pathname === '/api/youtube/subtitle-upload-local') {
    console.log('📤 D드라이브 로컬 자막 업로드 요청 받음:', pathname, req.method);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (req.method === 'GET') {
      // GET 요청 처리
      (async () => {
        try {
          const localUploadAPI = require('../api/youtube/subtitle_upload_local.js');

          const mockReq = {
            method: 'GET',
            query: require('url').parse(req.url, true).query
          };

          const mockRes = {
            setHeader: () => {},
            status: (code) => ({
              json: (data) => {
                res.writeHead(code, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
              }
            })
          };

          await localUploadAPI(mockReq, mockRes);
        } catch (apiError) {
          console.log('❌ D드라이브 업로드 API GET 오류:', apiError);
          res.writeHead(500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'LOCAL_UPLOAD_API_ERROR',
            message: apiError.message
          }));
        }
      })();
    } else if (req.method === 'POST') {
      // POST 요청 처리
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          console.log('📝 D드라이브 자막 업로드 받은 데이터:', { videoId: data.video_id, hasSubtitle: !!data.subtitle });

          try {
            const localUploadAPI = require('../api/youtube/subtitle_upload_local.js');

            const mockReq = {
              method: 'POST',
              body: data
            };

            const mockRes = {
              setHeader: () => {},
              status: (code) => ({
                json: (data) => {
                  res.writeHead(code, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                  });
                  res.end(JSON.stringify(data));
                }
              })
            };

            await localUploadAPI(mockReq, mockRes);

          } catch (apiError) {
            console.log('❌ D드라이브 업로드 API POST 오류:', apiError);
            res.writeHead(500, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
              success: false,
              error: 'LOCAL_UPLOAD_API_ERROR',
              message: apiError.message
            }));
          }

        } catch (e) {
          console.log('❌ D드라이브 업로드 JSON 파싱 오류:', e.message);
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    }

  // 블로그 생성
  } else if (pathname === '/api/blog/generate' && req.method === 'POST') {
    console.log('블로그 생성 요청 받음:', pathname);
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('블로그 생성 요청 데이터:', {
          hasPrompt: !!data.prompt,
          hasApiKey: !!data.apiKey,
          apiKeyValid: data.apiKey && data.apiKey.startsWith('sk-')
        });
        const { prompt } = data;

        // 환경변수에서 Claude API 키 가져오기
        const apiKey = process.env.CLAUDE_API_KEY || DEFAULT_CLAUDE_API_KEY;

        // 프롬프트 검증
        if (!prompt || prompt.trim().length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({
            error: '블로그 생성을 위한 프롬프트가 필요합니다.'
          }));
          return;
        }

        try {
          // Claude API 호출
          console.log('Claude API 호출 시작...');
          const blogContent = await callClaude(prompt, apiKey);

          console.log('블로그 생성 완료');
          res.writeHead(200);
          res.end(JSON.stringify({ content: blogContent }));

        } catch (apiError) {
          console.error('Claude API 오류:', apiError.message);
          res.writeHead(500);
          res.end(JSON.stringify({
            error: `AI 블로그 생성 실패: ${apiError.message}`
          }));
        }

      } catch (e) {
        console.error('JSON 파싱 오류:', e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
  }
}

// User registration
function handleUserRegister(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const { email, password, name } = JSON.parse(body);

      if (!email || !password || !name) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: '모든 필드를 입력해주세요' }));
        return;
      }

      const user = userManager.createUser(email, password, name);
      res.writeHead(201);
      res.end(JSON.stringify({ success: true, user }));

    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// User login
function handleUserLogin(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const { email, password } = JSON.parse(body);

      const user = userManager.authenticateUser(email, password);
      if (user) {
        const sessionId = userManager.createSession(user.id);
        res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Max-Age=86400; SameSite=Strict`);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, user }));
      } else {
        res.writeHead(401);
        res.end(JSON.stringify({ error: '이메일 또는 비밀번호가 잘못되었습니다' }));
      }

    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

// User logout
function handleUserLogout(req, res) {
  const sessionId = getSessionFromRequest(req);
  if (sessionId) {
    userManager.removeSession(sessionId);
  }
  res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Max-Age=0');
  res.writeHead(200);
  res.end(JSON.stringify({ success: true }));
}

// Get user info
function handleUserInfo(req, res) {
  const user = getUserFromSession(req);
  if (user) {
    res.writeHead(200);
    res.end(JSON.stringify({ user }));
  } else {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
  }
}

// Update user API keys
function handleUpdateApiKeys(req, res) {
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const apiKeys = JSON.parse(body);
      const success = userManager.updateUserApiKeys(user.id, apiKeys);

      if (success) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'API 키 업데이트에 실패했습니다' }));
      }
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

// Update user settings
function handleUpdateSettings(req, res) {
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const settings = JSON.parse(body);
      const success = userManager.updateUserSettings(user.id, settings);

      if (success) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: '설정 업데이트에 실패했습니다' }));
      }
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

// Get user subtitles
function handleGetUserSubtitles(req, res) {
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  const subtitles = userDataManager.getUserSubtitles(user.id);
  res.writeHead(200);
  res.end(JSON.stringify({ subtitles }));
}

// Save user subtitle
function handleSaveUserSubtitle(req, res) {
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const subtitleData = JSON.parse(body);
      const id = userDataManager.saveUserSubtitle(user.id, subtitleData);

      if (id) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: '자막 저장에 실패했습니다' }));
      }
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

// Get user blogs
function handleGetUserBlogs(req, res) {
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  const blogs = userDataManager.getUserBlogs(user.id);
  res.writeHead(200);
  res.end(JSON.stringify({ blogs }));
}

// Save user blog
function handleSaveUserBlog(req, res) {
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    try {
      const blogData = JSON.parse(body);
      const id = userDataManager.saveUserBlog(user.id, blogData);

      if (id) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: '블로그 저장에 실패했습니다' }));
      }
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

// MongoDB 연결 및 초기화
async function initializeDatabase() {
  console.log('ℹ️ 데이터베이스 초기화 건너뜀 - YouTube 분석 전용 모드');
  // 인증 시스템 비활성화로 인해 데이터베이스 초기화 불필요
}

const PORT = process.env.PORT || 3001;

// Vercel 환경 감지
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// 데이터베이스 초기화 (한 번만 실행)
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await initializeDatabase();
    // 인증 시스템 비활성화로 세션 정리 불필요
    initialized = true;
    console.log(`🚀 RubberDog initialized for ${isVercel ? 'Vercel' : 'Local'} - YouTube 분석 전용 모드`);
  }
}

// 서버 시작 (로컬 환경용)
async function startServer() {
  await ensureInitialized();

  server.listen(PORT, () => {
    console.log(`🚀 Multi-user YouTube Blog Generator running on http://localhost:${PORT}`);
    console.log(`📁 Serving from: ${path.join(__dirname, '..', 'public')}`);
    console.log(`🐍 Python scripts: ${path.join(__dirname, '..', 're-scripts')}`);
    console.log(`👥 Multi-user support: ${usingMongoDB ? 'MongoDB Atlas (클라우드)' : 'Local Files'}`);

    if (usingMongoDB) {
      console.log(`💾 텍스트 압축: 활성화 (1KB 이상 자동 압축)`);
      console.log(`📈 실시간 스토리지 모니터링: 활성화`);
    }
  });
}

// Vercel Serverless Function 핸들러
async function handler(req, res) {
  await ensureInitialized();
  return handleRequest(req, res);
}

// 환경에 따른 실행
if (isVercel) {
  // Vercel 환경: handler export
  module.exports = handler;
} else {
  // 로컬 환경: 서버 시작
  startServer().catch(error => {
    console.error('❌ 서버 시작 실패:', error);
    process.exit(1);
  });
  module.exports = server;
}