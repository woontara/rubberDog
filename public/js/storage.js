// 로컬 스토리지 관리 모듈
class StorageManager {
    constructor() {
        this.storageKeys = {
            subtitles: 'subtitles',
            blogs: 'blogs',
            settings: 'settings'
        };
    }

    // 자막 관련 스토리지
    getSubtitles() {
        return JSON.parse(localStorage.getItem(this.storageKeys.subtitles) || '[]');
    }

    saveSubtitle(subtitle) {
        const subtitles = this.getSubtitles();
        const existingIndex = subtitles.findIndex(s => s.videoId === subtitle.videoId);

        if (existingIndex !== -1) {
            subtitles[existingIndex] = subtitle;
        } else {
            subtitles.unshift(subtitle);
        }

        localStorage.setItem(this.storageKeys.subtitles, JSON.stringify(subtitles));
        return subtitles;
    }

    deleteSubtitle(videoId) {
        const subtitles = this.getSubtitles();
        const filtered = subtitles.filter(s => s.videoId !== videoId);
        localStorage.setItem(this.storageKeys.subtitles, JSON.stringify(filtered));
        return filtered;
    }

    deleteSelectedSubtitles(videoIds) {
        const subtitles = this.getSubtitles();
        const filtered = subtitles.filter(s => !videoIds.includes(s.videoId));
        localStorage.setItem(this.storageKeys.subtitles, JSON.stringify(filtered));
        return filtered;
    }

    // 블로그 관련 스토리지
    getBlogs() {
        return JSON.parse(localStorage.getItem(this.storageKeys.blogs) || '[]');
    }

    saveBlog(blog) {
        const blogs = this.getBlogs();
        blog.id = Date.now().toString();
        blog.createdAt = new Date().toISOString();
        blogs.unshift(blog);
        localStorage.setItem(this.storageKeys.blogs, JSON.stringify(blogs));
        return blogs;
    }

    deleteBlog(blogId) {
        const blogs = this.getBlogs();
        const filtered = blogs.filter(b => b.id !== blogId);
        localStorage.setItem(this.storageKeys.blogs, JSON.stringify(filtered));
        return filtered;
    }

    // 설정 관련 스토리지
    getSettings() {
        return JSON.parse(localStorage.getItem(this.storageKeys.settings) || '{}');
    }

    saveSettings(settings) {
        localStorage.setItem(this.storageKeys.settings, JSON.stringify(settings));
        return settings;
    }

    // 전체 데이터 초기화
    clearAll() {
        Object.values(this.storageKeys).forEach(key => {
            localStorage.removeItem(key);
        });
    }
}

// 전역 스토리지 관리자 인스턴스
window.storageManager = new StorageManager();