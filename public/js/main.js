// 메인 애플리케이션 로직
class YouTubeBlogApp {
    constructor() {
        this.init();
    }

    init() {
        // 페이지 로드 시 초기 설정
        document.addEventListener('DOMContentLoaded', () => {
            this.setupEventListeners();
            this.loadInitialData();
        });
    }

    setupEventListeners() {
        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('settings-modal');
            if (event.target === modal) {
                uiManager.closeSettings();
            }
        });

        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                uiManager.closeSettings();
            }
        });
    }

    loadInitialData() {
        // 저장된 자막과 블로그 개수 표시
        const subtitleCount = storageManager.getSubtitles().length;
        const blogCount = storageManager.getBlogs().length;

        console.log(`저장된 자막: ${subtitleCount}개, 블로그: ${blogCount}개`);
    }

    // YouTube URL 처리
    async processYouTubeURL() {
        const urlInput = document.getElementById('youtube-url');
        const url = urlInput?.value.trim();

        if (!url) {
            uiManager.showStatus('url-status', 'URL을 입력해주세요', 'error');
            return;
        }

        try {
            uiManager.showLoading('url-status', 'YouTube 채널/비디오 분석 중...');

            const result = await apiClient.analyzeYouTubeURL(url);

            if (result.error) {
                uiManager.showStatus('url-status', `오류: ${result.error}`, 'error');
                return;
            }

            if (result.type === 'channel' && result.videos) {
                uiManager.showStatus('url-status',
                    `채널 분석 완료: ${result.videos.length}개의 여행 관련 비디오를 찾았습니다`,
                    'success');
                uiManager.displayVideos(result.videos);
            } else if (result.type === 'video') {
                uiManager.showStatus('url-status', '비디오 분석 완료', 'success');
                uiManager.displayVideos([result.video]);
            }

        } catch (error) {
            console.error('YouTube URL 처리 오류:', error);
            uiManager.showStatus('url-status', `처리 중 오류가 발생했습니다: ${error.message}`, 'error');
        }
    }

    // 자막 추출
    async extractSubtitle(videoId) {
        if (!videoId) return;

        try {
            uiManager.showLoading('url-status', '자막 추출 중...');

            const result = await apiClient.extractSubtitle(videoId);

            if (result.error) {
                uiManager.showStatus('url-status', `자막 추출 실패: ${result.error}`, 'error');
                return;
            }

            if (result.subtitle) {
                const video = uiManager.currentVideos.find(v => v.id === videoId);
                const subtitleData = {
                    videoId: videoId,
                    title: video?.title || '제목 없음',
                    text: result.subtitle,
                    savedAt: new Date().toISOString()
                };

                storageManager.saveSubtitle(subtitleData);
                uiManager.showStatus('url-status', '자막이 저장되었습니다', 'success');

                // 자막 저장소 탭이 활성화되어 있으면 목록 업데이트
                if (uiManager.currentTab === 'storage') {
                    uiManager.displaySubtitles();
                }
            }

        } catch (error) {
            console.error('자막 추출 오류:', error);
            uiManager.showStatus('url-status', `자막 추출 중 오류가 발생했습니다: ${error.message}`, 'error');
        }
    }

    // 선택된 자막으로 블로그 생성
    async generateBlogFromSelected() {
        const checkboxes = document.querySelectorAll('.subtitle-storage-checkbox:checked');

        if (checkboxes.length === 0) {
            alert('블로그를 생성할 자막을 선택해주세요.');
            return;
        }

        const selectedVideoIds = Array.from(checkboxes).map(cb => cb.value);
        const subtitles = storageManager.getSubtitles();
        const selectedSubtitles = subtitles.filter(s => selectedVideoIds.includes(s.videoId));

        try {
            uiManager.showLoading('blog-generation-status', '블로그 생성 중...');

            // 자막 텍스트들을 합친 프롬프트 생성
            const combinedText = selectedSubtitles
                .map(s => `[${s.title}]\n${s.text}`)
                .join('\n\n---\n\n');

            const settings = storageManager.getSettings();
            const guidelines = settings.blogGuidelines || '제공된 자막을 바탕으로 흥미로운 블로그 글을 작성해주세요.';

            const prompt = `${guidelines}\n\n다음은 YouTube 비디오의 자막입니다:\n\n${combinedText}`;

            const result = await apiClient.generateBlog(prompt);

            if (result.error) {
                uiManager.showStatus('blog-generation-status', `블로그 생성 실패: ${result.error}`, 'error');
                return;
            }

            if (result.content) {
                const blogData = {
                    title: selectedSubtitles[0]?.title || '자동 생성된 블로그',
                    content: result.content,
                    sourceVideos: selectedVideoIds
                };

                storageManager.saveBlog(blogData);
                uiManager.showStatus('blog-generation-status', '블로그가 생성되었습니다', 'success');

                // 블로그 탭이 활성화되어 있으면 목록 업데이트
                if (uiManager.currentTab === 'blog') {
                    uiManager.displayBlogs();
                }

                // 체크박스 초기화
                checkboxes.forEach(cb => cb.checked = false);
            }

        } catch (error) {
            console.error('블로그 생성 오류:', error);
            uiManager.showStatus('blog-generation-status', `블로그 생성 중 오류가 발생했습니다: ${error.message}`, 'error');
        }
    }

    // 선택된 자막 삭제
    deleteSelectedSubtitles() {
        const checkboxes = document.querySelectorAll('.subtitle-storage-checkbox:checked');

        if (checkboxes.length === 0) {
            alert('삭제할 자막을 선택해주세요.');
            return;
        }

        if (confirm(`선택한 ${checkboxes.length}개의 자막을 삭제하시겠습니까?`)) {
            const selectedVideoIds = Array.from(checkboxes).map(cb => cb.value);
            storageManager.deleteSelectedSubtitles(selectedVideoIds);
            uiManager.displaySubtitles();

            // 선택된 자막의 내용도 초기화
            const subtitleContent = document.getElementById('subtitle-content');
            if (subtitleContent && selectedVideoIds.includes(uiManager.selectedSubtitleId)) {
                subtitleContent.innerHTML = '<p style="color: #999; text-align: center;">좌측 목록에서 자막을 선택하세요</p>';
                uiManager.selectedSubtitleId = null;
            }
        }
    }

    // 블로그 복사
    copyBlogContent() {
        const blogs = storageManager.getBlogs();
        const blog = blogs.find(b => b.id === uiManager.selectedBlogId);

        if (!blog) {
            alert('복사할 블로그를 선택해주세요.');
            return;
        }

        navigator.clipboard.writeText(blog.content)
            .then(() => alert('블로그 내용이 클립보드에 복사되었습니다.'))
            .catch(() => alert('복사에 실패했습니다.'));
    }

    // 블로그 다운로드
    downloadBlogContent() {
        const blogs = storageManager.getBlogs();
        const blog = blogs.find(b => b.id === uiManager.selectedBlogId);

        if (!blog) {
            alert('다운로드할 블로그를 선택해주세요.');
            return;
        }

        const blob = new Blob([blog.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${blog.title || 'blog'}_${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 전체 자막 선택/해제
    toggleSelectAll() {
        const selectAllCheckbox = document.querySelector('.select-all-checkbox');
        const checkboxes = document.querySelectorAll('.subtitle-storage-checkbox');

        checkboxes.forEach(cb => {
            cb.checked = selectAllCheckbox.checked;
        });
    }
}

// 전역 함수들 (HTML에서 직접 호출용)
window.processYouTubeURL = () => app.processYouTubeURL();
window.extractSubtitle = (videoId) => app.extractSubtitle(videoId);
window.generateBlogFromSelected = () => app.generateBlogFromSelected();
window.deleteSelectedSubtitles = () => app.deleteSelectedSubtitles();
window.copyBlogContent = () => app.copyBlogContent();
window.downloadBlogContent = () => app.downloadBlogContent();
window.toggleSelectAll = () => app.toggleSelectAll();
window.openSettings = () => uiManager.openSettings();
window.closeSettings = () => uiManager.closeSettings();
window.saveSettings = () => uiManager.saveSettings();

// 앱 초기화
window.app = new YouTubeBlogApp();