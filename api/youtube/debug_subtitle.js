// 자막 XML 데이터 디버깅용 API
module.exports = async (req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { videoId } = req.body;
    console.log('🐛 디버깅 요청:', videoId);

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_VIDEO_ID',
        message: 'videoId is required'
      });
      return;
    }

    // YouTube 페이지 가져오기
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      }
    });

    const html = await response.text();

    // 자막 패턴 찾기
    const pattern = /"captionTracks":\s*(\[[\s\S]*?\])/;
    const match = html.match(pattern);

    if (!match) {
      return res.status(200).json({
        success: false,
        message: '자막 트랙을 찾을 수 없습니다.',
        html_length: html.length,
        has_caption_keyword: html.includes('captionTracks')
      });
    }

    const captionTracks = JSON.parse(match[1]);
    const firstTrack = captionTracks[0];

    if (!firstTrack || !firstTrack.baseUrl) {
      return res.status(200).json({
        success: false,
        message: '자막 URL을 찾을 수 없습니다.',
        caption_tracks: captionTracks
      });
    }

    // 자막 XML 다운로드
    const subtitleResponse = await fetch(firstTrack.baseUrl);
    const xmlData = await subtitleResponse.text();

    res.status(200).json({
      success: true,
      video_id: videoId,
      subtitle_url: firstTrack.baseUrl,
      xml_length: xmlData.length,
      xml_sample_first_1000: xmlData.substring(0, 1000),
      xml_sample_middle_500: xmlData.substring(Math.floor(xmlData.length / 2), Math.floor(xmlData.length / 2) + 500),
      has_transcript_tag: xmlData.includes('<transcript>'),
      has_text_tag: xmlData.includes('<text'),
      has_start_attr: xmlData.includes('start='),
      available_tracks: captionTracks.map(track => ({
        language: track.languageCode,
        name: track.name?.simpleText || track.languageCode,
        is_generated: track.kind === 'asr'
      }))
    });

  } catch (error) {
    console.error('❌ 디버깅 오류:', error);
    res.status(500).json({
      success: false,
      error: 'DEBUG_ERROR',
      message: error.message
    });
  }
};