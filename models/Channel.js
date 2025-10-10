const mongoose = require('mongoose');

/**
 * YouTube 채널 정보 스키마
 * 자동 수집된 한국 여행 채널 정보를 저장
 */
const channelSchema = new mongoose.Schema({
  // YouTube 채널 고유 ID
  channelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // 채널 이름
  channelName: {
    type: String,
    required: true
  },

  // 채널 URL
  channelUrl: {
    type: String,
    required: true
  },

  // 구독자 수
  subscriberCount: {
    type: Number,
    default: 0,
    index: true
  },

  // 채널 설명
  description: {
    type: String,
    default: ''
  },

  // 총 영상 개수
  videoCount: {
    type: Number,
    default: 0
  },

  // 총 조회수
  viewCount: {
    type: Number,
    default: 0
  },

  // 채널 썸네일 URL
  thumbnail: {
    type: String,
    default: ''
  },

  // 카테고리/태그 (여행 관련 키워드)
  category: {
    type: [String],
    default: ['여행', '해외여행']
  },

  // 수집 상태
  status: {
    type: String,
    enum: ['pending', 'collected', 'processing', 'completed', 'error'],
    default: 'collected'
  },

  // 검색 키워드 (이 채널을 발견한 키워드)
  searchKeyword: {
    type: String,
    default: ''
  },

  // 채널 생성일
  publishedAt: {
    type: Date
  },

  // 마지막 업데이트 일시
  lastUpdated: {
    type: Date,
    default: Date.now
  },

  // 수집 일시
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // 우선순위
  priority: {
    type: Number,
    default: 999,  // 높을수록 낮은 우선순위
    index: true
  },

  // 자막 통계
  subtitleStats: {
    totalVideosChecked: {
      type: Number,
      default: 0
    },
    videosWithSubtitles: {
      type: Number,
      default: 0
    },
    videosNoSubtitles: {
      type: Number,
      default: 0
    },
    lastCheckedAt: {
      type: Date
    },
    hasAnySubtitles: {
      type: Boolean,
      default: null  // null=미확인, true=자막있음, false=자막없음
    }
  },

  // 추가 메타데이터
  metadata: {
    country: {
      type: String,
      default: 'KR'
    },
    language: {
      type: String,
      default: 'ko'
    },
    customUrl: String,
    // 활동 여부 체크를 위한 최근 영상 업로드 날짜
    lastVideoUploadDate: Date
  }
}, {
  timestamps: true
});

// 인덱스 설정
channelSchema.index({ subscriberCount: 1, createdAt: -1 });
channelSchema.index({ status: 1, createdAt: -1 });
channelSchema.index({ category: 1 });

// 채널 업데이트 메서드
channelSchema.methods.updateInfo = function(data) {
  this.channelName = data.channelName || this.channelName;
  this.subscriberCount = data.subscriberCount || this.subscriberCount;
  this.description = data.description || this.description;
  this.videoCount = data.videoCount || this.videoCount;
  this.viewCount = data.viewCount || this.viewCount;
  this.thumbnail = data.thumbnail || this.thumbnail;
  this.lastUpdated = new Date();
  return this.save();
};

// 자막 통계 업데이트 메서드
channelSchema.methods.updateSubtitleStats = async function() {
  const Video = require('./Video');

  const stats = await Video.aggregate([
    { $match: { channelId: this.channelId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        withSubtitles: {
          $sum: { $cond: [{ $eq: ['$hasSubtitle', true] }, 1, 0] }
        },
        noSubtitles: {
          $sum: { $cond: [{ $eq: ['$subtitleStatus', 'no_subtitle'] }, 1, 0] }
        }
      }
    }
  ]);

  if (stats.length > 0) {
    this.subtitleStats.totalVideosChecked = stats[0].total;
    this.subtitleStats.videosWithSubtitles = stats[0].withSubtitles;
    this.subtitleStats.videosNoSubtitles = stats[0].noSubtitles;
    this.subtitleStats.lastCheckedAt = new Date();
    this.subtitleStats.hasAnySubtitles = stats[0].withSubtitles > 0;
  }

  return this.save();
};

const Channel = mongoose.model('Channel', channelSchema);

module.exports = Channel;
