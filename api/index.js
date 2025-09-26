// Vercel serverless function - minimal version
export default function handler(req, res) {
  try {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // 기본 HTML 응답
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>RubberDog - 배포 성공!</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; text-align: center; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #28a745; margin-bottom: 20px; }
        .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .info { background: #e7f3ff; color: #004085; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .btn { display: inline-block; padding: 12px 24px; background: #007cba; color: white; text-decoration: none; border-radius: 5px; margin: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 배포 성공!</h1>
        <div class="status">
            ✅ RubberDog가 Vercel에서 정상적으로 작동하고 있습니다!
        </div>

        <h2>🐕 RubberDog</h2>
        <p>YouTube to Blog 자동화 시스템</p>

        <div class="info">
            <strong>주요 기능:</strong><br>
            • YouTube 자막 자동 추출<br>
            • AI 블로그 자동 생성<br>
            • 멀티유저 시스템<br>
            • 클라우드 저장소
        </div>

        <p>환경: production | 시간: ${new Date().toLocaleString('ko-KR')}</p>

        <div>
            <a href="https://github.com/woontara/rubberDog" class="btn">GitHub</a>
            <a href="/api/test" class="btn">API 테스트</a>
        </div>
    </div>
</body>
</html>`;

    if (req.url === '/api/test' || req.url.includes('api/test')) {
      res.status(200).json({
        success: true,
        message: 'RubberDog API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        url: req.url,
        method: req.method
      });
      return;
    }

    // 모든 경로에 대해 기본 HTML 응답
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);

  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}