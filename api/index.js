// Vercel serverless function
module.exports = async (req, res) => {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 기본 HTML 응답
  if (req.method === 'GET' && req.url === '/') {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>RubberDog - YouTube to Blog</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            h1 { color: #333; text-align: center; }
            .status { text-align: center; padding: 20px; background: #e8f5e8; border-radius: 5px; margin: 20px 0; }
            .error { background: #ffe8e8; }
            .nav { display: flex; justify-content: center; gap: 20px; margin: 20px 0; }
            .btn { padding: 10px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🐕 RubberDog</h1>
            <p style="text-align: center; font-size: 18px;">YouTube to Blog Automation System</p>

            <div class="status">
                ✅ <strong>배포 성공!</strong><br>
                서버가 Vercel에서 정상적으로 작동하고 있습니다.
            </div>

            <div class="nav">
                <a href="/auth" class="btn">로그인/회원가입</a>
                <a href="/app" class="btn">앱 시작하기</a>
            </div>

            <h3>🚀 기능들:</h3>
            <ul>
                <li>✅ YouTube 동영상 자막 자동 추출</li>
                <li>✅ AI 기반 여행 블로그 자동 생성</li>
                <li>✅ 멀티유저 인증 시스템</li>
                <li>✅ MongoDB 클라우드 저장소</li>
                <li>✅ 텍스트 압축으로 저장공간 70% 절약</li>
            </ul>

            <div style="text-align: center; margin-top: 30px; font-size: 14px; color: #666;">
                Environment: ${process.env.NODE_ENV || 'development'}<br>
                MongoDB: ${process.env.MONGODB_URI ? '연결됨' : '미설정'}<br>
                API Keys: ${process.env.ANTHROPIC_API_KEY ? '설정됨' : '미설정'}
            </div>
        </div>
    </body>
    </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    return;
  }

  // API 상태 체크
  if (req.method === 'GET' && req.url === '/api/status') {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      mongodb: process.env.MONGODB_URI ? 'configured' : 'not configured',
      apis: {
        anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not configured',
        perplexity: process.env.PERPLEXITY_API_KEY ? 'configured' : 'not configured'
      }
    });
    return;
  }

  // 기본 응답
  res.status(200).json({
    message: 'RubberDog API Server',
    status: 'running',
    path: req.url,
    method: req.method
  });
};