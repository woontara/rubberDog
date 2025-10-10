const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    index: true
  },
  videoTitle: {
    type: String,
    required: true
  },
  channelName: String,
  blogContent: {
    type: String,
    required: true
  },
  usage: {
    inputTokens: Number,
    outputTokens: Number
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// 인덱스
blogPostSchema.index({ createdAt: -1 });
blogPostSchema.index({ videoId: 1, createdAt: -1 });

module.exports = mongoose.models.BlogPost || mongoose.model('BlogPost', blogPostSchema);
