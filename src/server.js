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
// MongoDB 기반 매니저들 (우선 사용)
let MongoUserManager, MongoStorageManager;
let FileUserManager, FileStorageManager;

// 매니저 인스턴스 변수
let mongoUserManager, mongoStorageManager;
let fileUserManager, fileStorageManager;
let userManager, userDataManager;
let usingMongoDB = false;

// 모듈 로딩 및 초기화 (에러 처리 포함)
try {
  MongoUserManager = require('../models/mongo-user');
  MongoStorageManager = require('../models/mongo-storage');
  FileUserManager = require('../models/user');
  FileStorageManager = require('../models/storage');

  // 매니저 인스턴스 생성
  mongoUserManager = new MongoUserManager();
  mongoStorageManager = new MongoStorageManager();
  fileUserManager = FileUserManager; // 이미 인스턴스로 export됨
  fileStorageManager = FileStorageManager; // 이미 인스턴스로 export됨

  // 기본값으로 파일 기반 매니저 사용 (MongoDB 연결 실패 시 fallback)
  userManager = fileUserManager;
  userDataManager = fileStorageManager;
} catch (error) {
  console.error('Model loading error:', error);
  // Fallback: 기본 객체들로 초기화
  userManager = {
    getUser: () => null,
    createUser: () => false,
    updateUser: () => false
  };
  userDataManager = {
    saveData: () => false,
    getData: () => null,
    listData: () => []
  };
}


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

  // 환경변수에서 API 키들 읽기
  if (process.env.YOUTUBE_API_KEY_PRIMARY) {
    keys.push(process.env.YOUTUBE_API_KEY_PRIMARY);
  }
  if (process.env.YOUTUBE_API_KEY_BACKUP) {
    keys.push(process.env.YOUTUBE_API_KEY_BACKUP);
  }
  if (process.env.YOUTUBE_API_KEY_ADDITIONAL) {
    keys.push(process.env.YOUTUBE_API_KEY_ADDITIONAL);
  }

  // 단일 환경변수에서 쉼표로 구분된 키들 읽기 (fallback)
  if (keys.length === 0 && process.env.YOUTUBE_API_KEYS) {
    keys.push(...process.env.YOUTUBE_API_KEYS.split(',').map(key => key.trim()));
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

  const response = await fetch(`${baseUrl}/${endpoint}?${searchParams}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`YouTube API Error ${response.status}: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
}

// YouTube 분석 함수
async function analyzeYouTube(url, apiKeys, filters = {}) {
  const parsed = parseYouTubeUrl(url);

  if (!parsed) {
    throw new Error('올바른 YouTube URL이 아닙니다.');
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

    if (apiKeys.length === 0) {
      throw new Error('YouTube API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.');
    }

    if (action === 'analyze') {
      const result = await analyzeYouTube(urlOrId, apiKeys, filters);
      callback(null, result);
    } else if (action === 'subtitle') {
      callback('자막 추출 기능은 아직 구현되지 않았습니다.', null);
    } else {
      callback('지원하지 않는 액션입니다.', null);
    }
  } catch (error) {
    console.error('YouTube API Error:', error);
    callback(error.message, null);
  }
}

// 공통 Request Handler 함수
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

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

// Extract session from request
function getSessionFromRequest(req) {
  const cookies = req.headers.cookie;
  if (cookies) {
    const sessionMatch = cookies.match(/sessionId=([^;]+)/);
    if (sessionMatch) {
      return sessionMatch[1];
    }
  }
  return null;
}

// Get user from session
function getUserFromSession(req) {
  const sessionId = getSessionFromRequest(req);
  if (sessionId) {
    const userId = userManager.validateSession(sessionId);
    if (userId) {
      return userManager.getUserById(userId);
    }
  }
  return null;
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

  // Protected routes (require authentication)
  const user = getUserFromSession(req);
  if (!user) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: '인증이 필요합니다' }));
    return;
  }

  // YouTube URL 분석
  if (pathname === '/api/youtube/analyze' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { url, filters = {} } = data;

        // 실제 YouTube API 호출 (필터 포함)
        runYouTubeScript('analyze', url, 1, filters, (error, result) => {
          if (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error }));
          } else {
            res.writeHead(200);
            res.end(JSON.stringify(result));
          }
        });

      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  // 자막 추출
  } else if (pathname === '/api/youtube/subtitle' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { videoId } = data;

        // 실제 YouTube API 호출
        runYouTubeScript('subtitle', videoId, (error, result) => {
          if (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error }));
          } else {
            res.writeHead(200);
            res.end(JSON.stringify(result));
          }
        });

      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

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

        // 사용자 API 키 또는 기본값 사용
        const apiKey = user.apiKeys?.claude || DEFAULT_CLAUDE_API_KEY;

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
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    console.log('🔌 MongoDB Atlas 연결 시도 중...');
    const connected = await mongoUserManager.connect(mongoUri);

    if (connected) {
      usingMongoDB = true;
      console.log('✅ MongoDB Atlas 연결 성공 - 클라우드 스토리지 활성화');

      // DB 통계 출력
      const stats = await mongoUserManager.getDatabaseStats();
      if (stats) {
        console.log(`📊 무료 티어 사용량: ${stats.usagePercent}% (${Math.round(stats.storageSize/1024/1024)}MB / 512MB)`);
      }
    } else {
      console.log('⚠️ MongoDB 연결 실패 - 로컬 파일 시스템 사용');
      userManager = FileUserManager;
      userDataManager = FileStorageManager;
    }
  } else {
    console.log('ℹ️ MongoDB URI 없음 - 로컬 파일 시스템 사용');
    userManager = FileUserManager;
    userDataManager = FileStorageManager;
  }
}

const PORT = process.env.PORT || 3001;

// Vercel 환경 감지
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// 데이터베이스 초기화 (한 번만 실행)
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await initializeDatabase();
    if (userManager.startSessionCleanup) {
      userManager.startSessionCleanup();
    }
    initialized = true;
    console.log(`🚀 RubberDog initialized for ${isVercel ? 'Vercel' : 'Local'}`);
    console.log(`👥 Multi-user support: ${usingMongoDB ? 'MongoDB Atlas' : 'Local Files'}`);
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