// API 통신 모듈
class APIClient {
    constructor() {
        this.baseURL = '';
    }

    async analyzeYouTubeURL(url, filters = {}) {
        try {
            const response = await fetch('/api/youtube/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, filters })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('YouTube URL 분석 오류:', error);
            throw error;
        }
    }

    async extractSubtitle(videoId) {
        try {
            const response = await fetch('/api/youtube/subtitle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ videoId })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('자막 추출 오류:', error);
            throw error;
        }
    }

    async generateBlog(prompt) {
        try {
            const response = await fetch('/api/blog/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('블로그 생성 오류:', error);
            throw error;
        }
    }
}

// 전역 API 클라이언트 인스턴스
window.apiClient = new APIClient();