// UI 관리 모듈
class UIManager {
    constructor() {
        this.currentTab = 'analysis';
        this.currentVideos = [];
        this.selectedSubtitleId = null;
        this.selectedBlogId = null;
    }

    // 탭 전환
    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        const targetBtn = document.querySelector(`.tab-btn[onclick="uiManager.switchTab('${tab}')"]`);
        if (targetBtn) targetBtn.classList.add('active');

        const targetContent = document.getElementById(`${tab}-tab`);
        if (targetContent) targetContent.classList.add('active');

        this.currentTab = tab;

        // 탭별 데이터 로드
        if (tab === 'storage') {
            this.displaySubtitles();
        } else if (tab === 'blog') {
            this.displayBlogs();
        }
    }

    // 상태 메시지 표시
    showStatus(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.innerHTML = `
            <div class="status-message status-${type}">
                ${message}
            </div>
        `;

        if (type !== 'loading') {
            setTimeout(() => {
                element.innerHTML = '';
            }, 5000);
        }
    }

    // 로딩 표시
    showLoading(elementId, message = '처리 중...') {
        this.showStatus(elementId, `${message} <div class="spinner"></div>`, 'loading');
    }

    // 비디오 목록 표시
    displayVideos(videos) {
        const videoList = document.getElementById('video-list');
        if (!videoList || !videos || videos.length === 0) return;

        this.currentVideos = videos;
        videoList.innerHTML = videos.map(video => `
            <div class="video-item" onclick="uiManager.selectVideo('${video.id}')">
                <div class="video-info">
                    <h3>${this.escapeHtml(video.title)}</h3>
                    <p>조회수: ${video.viewCount?.toLocaleString() || 'N/A'} |
                       길이: ${this.formatDuration(video.duration)} |
                       업로드: ${video.publishedAt}</p>
                </div>
                <div class="video-actions">
                    <button class="btn btn-small" onclick="event.stopPropagation(); uiManager.extractSubtitle('${video.id}')">
                        자막 추출
                    </button>
                </div>
            </div>
        `).join('');
    }

    // 자막 목록 표시
    displaySubtitles() {
        const subtitles = storageManager.getSubtitles();
        const subtitleItems = document.getElementById('subtitle-items');

        if (!subtitleItems) return;

        if (subtitles.length === 0) {
            subtitleItems.innerHTML = `
                <div style="padding: 20px; color: #999; text-align: center;">
                    저장된 자막이 없습니다
                </div>
            `;
            return;
        }

        subtitleItems.innerHTML = subtitles.map(subtitle => `
            <div class="subtitle-item" onclick="uiManager.selectSubtitle('${subtitle.videoId}')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="subtitle-storage-checkbox"
                           value="${subtitle.videoId}" onclick="event.stopPropagation();">
                    <div style="flex: 1;">
                        <h4>${this.escapeHtml(subtitle.title)}</h4>
                        <p style="font-size: 12px; color: #666; margin-top: 5px;">
                            길이: ${subtitle.text.length.toLocaleString()}자 |
                            저장: ${new Date(subtitle.savedAt).toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 블로그 목록 표시
    displayBlogs() {
        const blogs = storageManager.getBlogs();
        const blogItems = document.getElementById('blog-items');

        if (!blogItems) return;

        if (blogs.length === 0) {
            blogItems.innerHTML = `
                <div style="padding: 20px; color: #999; text-align: center;">
                    생성된 블로그 글이 없습니다
                </div>
            `;
            return;
        }

        blogItems.innerHTML = blogs.map(blog => `
            <div class="blog-item" onclick="uiManager.selectBlog('${blog.id}')">
                <h4>${this.escapeHtml(blog.title || '제목 없음')}</h4>
                <p style="font-size: 12px; color: #666; margin-top: 5px;">
                    생성: ${new Date(blog.createdAt).toLocaleString()}
                </p>
            </div>
        `).join('');
    }

    // 자막 선택
    selectSubtitle(videoId) {
        const subtitles = storageManager.getSubtitles();
        const subtitle = subtitles.find(s => s.videoId === videoId);

        if (!subtitle) return;

        this.selectedSubtitleId = videoId;

        // 활성 상태 표시
        document.querySelectorAll('.subtitle-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.closest('.subtitle-item').classList.add('active');

        // 자막 내용 표시
        const subtitleContent = document.getElementById('subtitle-content');
        if (subtitleContent) {
            subtitleContent.innerHTML = `
                <h3>${this.escapeHtml(subtitle.title)}</h3>
                <div style="margin-top: 15px; white-space: pre-wrap; line-height: 1.6;">
                    ${this.escapeHtml(subtitle.text)}
                </div>
            `;
        }
    }

    // 블로그 선택
    selectBlog(blogId) {
        const blogs = storageManager.getBlogs();
        const blog = blogs.find(b => b.id === blogId);

        if (!blog) return;

        this.selectedBlogId = blogId;

        // 활성 상태 표시
        document.querySelectorAll('.blog-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.closest('.blog-item').classList.add('active');

        // 블로그 내용 표시
        const blogContent = document.getElementById('blog-content');
        const blogActions = document.getElementById('blog-actions');

        if (blogContent) {
            blogContent.innerHTML = `
                <h3>${this.escapeHtml(blog.title || '제목 없음')}</h3>
                <div style="margin-top: 15px; white-space: pre-wrap; line-height: 1.6;">
                    ${this.escapeHtml(blog.content)}
                </div>
            `;
        }

        if (blogActions) {
            blogActions.style.display = 'block';
        }
    }

    // 유틸리티 함수들
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDuration(seconds) {
        if (!seconds) return 'N/A';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // 설정 모달 관련
    openSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.style.display = 'block';

            const settings = storageManager.getSettings();
            const openaiKey = document.getElementById('openai-key');
            const guidelines = document.getElementById('blog-guidelines');

            if (openaiKey && settings.openaiKey) {
                openaiKey.value = settings.openaiKey;
            }
            if (guidelines && settings.blogGuidelines) {
                guidelines.value = settings.blogGuidelines;
            }
        }
    }

    closeSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    saveSettings() {
        const openaiKey = document.getElementById('openai-key')?.value;
        const blogGuidelines = document.getElementById('blog-guidelines')?.value;

        const settings = {
            openaiKey: openaiKey || '',
            blogGuidelines: blogGuidelines || ''
        };

        storageManager.saveSettings(settings);
        this.closeSettings();

        this.showStatus('settings-status', '설정이 저장되었습니다', 'success');
    }
}

// 전역 UI 관리자 인스턴스
window.uiManager = new UIManager();