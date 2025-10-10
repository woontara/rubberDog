const mongoose = require('mongoose');

/**
 * YouTube 영상 정보 스키마
 */
const videoSchema = new mongoose.Schema({
  // YouTube 영상 고유 ID
  videoId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // 채널 정보
  channelId: {
    type: String,
    required: true,
    index: true,
    ref: 'Channel'
  },

  channelName: {
    type: String,
    required: true
  },

  // 영상 정보
  title: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: ''
  },

  thumbnail: {
    type: String,
    default: ''
  },

  // 영상 통계
  viewCount: {
    type: Number,
    default: 0
  },

  likeCount: {
    type: Number,
    default: 0
  },

  commentCount: {
    type: Number,
    default: 0
  },

  duration: {
    type: String,
    default: ''
  },

  // 영상 URL
  videoUrl: {
    type: String,
    required: true
  },

  // 발행일
  publishedAt: {
    type: Date,
    index: true
  },

  // 자막 정보
  hasSubtitle: {
    type: Boolean,
    default: false,
    index: true
  },

  subtitleLanguage: {
    type: String,
    default: ''
  },

  subtitleText: {
    type: String,
    default: ''
  },

  // 자막 수집 상태
  subtitleStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'no_subtitle'],
    default: 'pending',
    index: true
  },

  subtitleCollectedAt: {
    type: Date
  },

  subtitleError: {
    type: String,
    default: ''
  },

  // 수집 일시
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  lastUpdated: {
    type: Date,
    default: Date.now
  },

  // 추가 메타데이터
  metadata: {
    tags: [String],
    categoryId: String,
    defaultLanguage: String,
    isLiveContent: Boolean
  }
}, {
  timestamps: true
});

// 복합 인덱스
videoSchema.index({ channelId: 1, publishedAt: -1 });
videoSchema.index({ hasSubtitle: 1, subtitleStatus: 1 });
videoSchema.index({ channelId: 1, subtitleStatus: 1 });

// 영상 업데이트 메서드
videoSchema.methods.updateSubtitle = function(subtitleData) {
  this.hasSubtitle = true;
  this.subtitleText = subtitleData.subtitle;
  this.subtitleLanguage = subtitleData.language;
  this.subtitleStatus = 'completed';
  this.subtitleCollectedAt = new Date();
  this.lastUpdated = new Date();
  return this.save();
};

// 자막 수집 실패 처리
videoSchema.methods.markSubtitleFailed = function(errorMessage) {
  this.subtitleStatus = 'failed';
  this.subtitleError = errorMessage;
  this.lastUpdated = new Date();
  return this.save();
};

// 자막 없음 처리
videoSchema.methods.markNoSubtitle = function() {
  this.hasSubtitle = false;
  this.subtitleStatus = 'no_subtitle';
  this.lastUpdated = new Date();
  return this.save();
};

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
