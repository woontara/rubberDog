# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a YouTube-to-Blog automation system called RubberDog that extracts YouTube video subtitles and generates travel blog posts using AI. The system consists of a Node.js web server frontend and Python backend services for YouTube data processing.

## Development Commands

### Server Operations
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start
# or
node server.js

# Alternative server start (from src directory)
cd src && node server.js
```

### Python Dependencies
```bash
# Install Python dependencies for YouTube processing
pip install -r requirements.txt
pip install -r requirements-youtube.txt

# Install RubberDog package in development mode
pip install -e .
```

### Build & Test
```bash
# Build for production
npm run build

# Development build with watch
npm run watch

# Run tests
npm test

# Lint JavaScript code
npm run lint
```

### Project Structure
```bash
# Clean project structure (remove test/temp files)
# Use this after significant cleanup
ls -la  # Review current state
```

## Architecture Overview

### Multi-Language Architecture
The project combines Node.js (web interface) and Python (YouTube processing) through child process communication:

**Frontend (Node.js)**:
- `src/server.js` - Main HTTP server serving web interface and API endpoints
- `public/index.html` - Single-page application with YouTube analysis and blog generation
- `server.js` - Entry point that loads `src/server.js`

**Backend (Python)**:
- `youtube_api.py` - YouTube Data API integration with quota management
- `youtube_subtitle_real.py` - YouTube subtitle extraction using youtube-transcript-api
- `rubberdog/` - Core Python package for YouTube data collection and processing

### API Integration Points

**Claude API Integration**:
- Embedded API key in `src/server.js` (CLAUDE_API_KEY constant)
- Uses Claude 3.5 Sonnet model for blog generation
- Called via `/api/blog/generate` endpoint

**YouTube API Integration**:
- Dual API keys for quota management in `youtube_api.py`
- Supports both channel analysis and single video processing
- Includes travel video detection and subtitle availability checking

### Data Flow
1. **YouTube URL Analysis**: `youtube_api.py analyze` → Channel/video metadata extraction
2. **Subtitle Extraction**: `youtube_subtitle_real.py` → Text content extraction
3. **Blog Generation**: Node.js server → Claude API → AI-generated travel blog content
4. **Web Interface**: Single-page app with tab-based UI for all operations

### Key Configuration Files

**Node.js Configuration**:
- `package.json` - Dependencies and scripts
- Port 3001 (configurable via PORT environment variable)

**Python Configuration**:
- `config.yaml` - YouTube API keys, Claude API settings, scheduler configuration
- `requirements.txt` & `requirements-youtube.txt` - Python dependencies

**API Keys Management**:
- YouTube API keys: Dual-key system with automatic failover
- Claude API key: Embedded in server code (not in config files)

### Development Notes

**Child Process Communication**:
- Server spawns Python scripts via `child_process.spawn()`
- JSON communication between Node.js and Python
- UTF-8 encoding explicitly configured for Korean content support

**Error Handling Patterns**:
- API quota management with automatic key switching
- Graceful degradation when services unavailable
- Client-side error display with user-friendly messages

**File Organization**:
- Keep Python scripts in project root (youtube_api.py, youtube_subtitle_real.py)
- Web assets in `public/` directory
- Node.js server code in `src/` directory
- Generated blogs stored in `generated_blogs/` directory

### Important Technical Constraints

**YouTube API Limitations**:
- Daily quota limits require key rotation
- Subtitle availability varies by video
- Channel analysis limited to videos with metadata

**Claude API Integration**:
- 4000 token limit per request
- Temperature 0.7 for creative blog generation
- Requires Anthropic API version 2023-06-01

**Character Encoding**:
- Explicit UTF-8 handling for Korean YouTube content
- Browser LocalStorage for client-side data persistence

## Deployment Considerations

The project includes multiple deployment configurations:
- `netlify.toml` - Netlify deployment
- `vercel.json` - Vercel deployment
- `Procfile` - Heroku deployment
- `deploy.bat` - Windows deployment script

Server runs on port 3001 by default, configurable via PORT environment variable.