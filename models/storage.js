const fs = require('fs');
const path = require('path');

class UserDataManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'user_data');
    this.ensureDataDirectory();
  }

  // Ensure user data directory exists
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Get user-specific directory
  getUserDir(userId) {
    const userDir = path.join(this.dataDir, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });

      // Create subdirectories
      fs.mkdirSync(path.join(userDir, 'subtitles'), { recursive: true });
      fs.mkdirSync(path.join(userDir, 'blogs'), { recursive: true });
    }
    return userDir;
  }

  // Save subtitle for user
  saveUserSubtitle(userId, subtitleData) {
    try {
      const userDir = this.getUserDir(userId);
      const subtitlesDir = path.join(userDir, 'subtitles');

      const filename = `subtitle_${Date.now()}_${subtitleData.videoId}.json`;
      const filepath = path.join(subtitlesDir, filename);

      const data = {
        ...subtitleData,
        savedAt: new Date().toISOString(),
        id: filename.replace('.json', '')
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return data.id;
    } catch (error) {
      console.error('Error saving subtitle:', error);
      return null;
    }
  }

  // Get user subtitles
  getUserSubtitles(userId) {
    try {
      const userDir = this.getUserDir(userId);
      const subtitlesDir = path.join(userDir, 'subtitles');

      if (!fs.existsSync(subtitlesDir)) {
        return [];
      }

      const files = fs.readdirSync(subtitlesDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => {
          const timeA = fs.statSync(path.join(subtitlesDir, a)).mtime;
          const timeB = fs.statSync(path.join(subtitlesDir, b)).mtime;
          return timeB - timeA;
        });

      return files.map(file => {
        const content = fs.readFileSync(path.join(subtitlesDir, file), 'utf8');
        return JSON.parse(content);
      });
    } catch (error) {
      console.error('Error getting user subtitles:', error);
      return [];
    }
  }

  // Save blog for user
  saveUserBlog(userId, blogData) {
    try {
      const userDir = this.getUserDir(userId);
      const blogsDir = path.join(userDir, 'blogs');

      const filename = `blog_${Date.now()}_${blogData.videoId || 'generated'}.json`;
      const filepath = path.join(blogsDir, filename);

      const data = {
        ...blogData,
        savedAt: new Date().toISOString(),
        id: filename.replace('.json', '')
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return data.id;
    } catch (error) {
      console.error('Error saving blog:', error);
      return null;
    }
  }

  // Get user blogs
  getUserBlogs(userId) {
    try {
      const userDir = this.getUserDir(userId);
      const blogsDir = path.join(userDir, 'blogs');

      if (!fs.existsSync(blogsDir)) {
        return [];
      }

      const files = fs.readdirSync(blogsDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => {
          const timeA = fs.statSync(path.join(blogsDir, a)).mtime;
          const timeB = fs.statSync(path.join(blogsDir, b)).mtime;
          return timeB - timeA;
        });

      return files.map(file => {
        const content = fs.readFileSync(path.join(blogsDir, file), 'utf8');
        return JSON.parse(content);
      });
    } catch (error) {
      console.error('Error getting user blogs:', error);
      return [];
    }
  }

  // Delete user subtitle
  deleteUserSubtitle(userId, subtitleId) {
    try {
      const userDir = this.getUserDir(userId);
      const filepath = path.join(userDir, 'subtitles', `${subtitleId}.json`);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting subtitle:', error);
      return false;
    }
  }

  // Delete user blog
  deleteUserBlog(userId, blogId) {
    try {
      const userDir = this.getUserDir(userId);
      const filepath = path.join(userDir, 'blogs', `${blogId}.json`);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting blog:', error);
      return false;
    }
  }

  // Get user storage statistics
  getUserStorageStats(userId) {
    try {
      const subtitles = this.getUserSubtitles(userId);
      const blogs = this.getUserBlogs(userId);

      return {
        subtitleCount: subtitles.length,
        blogCount: blogs.length,
        totalItems: subtitles.length + blogs.length
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { subtitleCount: 0, blogCount: 0, totalItems: 0 };
    }
  }
}

module.exports = new UserDataManager();