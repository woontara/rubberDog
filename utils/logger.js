/**
 * 로깅 유틸리티
 * 채널 수집 로그를 파일과 MongoDB에 저장
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(logDir = 'logs') {
    this.logDir = logDir;
    this.ensureLogDirectory();
  }

  /**
   * 로그 디렉토리 생성
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 로그 파일 경로 생성
   */
  getLogFilePath(type = 'app') {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${type}-${dateStr}.log`);
  }

  /**
   * 로그 메시지 포맷팅
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logMsg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data) {
      logMsg += `\n${JSON.stringify(data, null, 2)}`;
    }

    return logMsg;
  }

  /**
   * 로그 파일에 쓰기
   */
  writeToFile(logPath, message) {
    try {
      fs.appendFileSync(logPath, message + '\n', 'utf8');
    } catch (error) {
      console.error('로그 파일 쓰기 실패:', error);
    }
  }

  /**
   * INFO 레벨 로그
   */
  info(message, data = null) {
    const formattedMsg = this.formatMessage('info', message, data);
    console.log(formattedMsg);

    const logPath = this.getLogFilePath('app');
    this.writeToFile(logPath, formattedMsg);
  }

  /**
   * ERROR 레벨 로그
   */
  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : null;

    const formattedMsg = this.formatMessage('error', message, errorData);
    console.error(formattedMsg);

    const logPath = this.getLogFilePath('error');
    this.writeToFile(logPath, formattedMsg);
  }

  /**
   * WARN 레벨 로그
   */
  warn(message, data = null) {
    const formattedMsg = this.formatMessage('warn', message, data);
    console.warn(formattedMsg);

    const logPath = this.getLogFilePath('app');
    this.writeToFile(logPath, formattedMsg);
  }

  /**
   * DEBUG 레벨 로그 (verbose 모드에서만)
   */
  debug(message, data = null) {
    if (process.env.LOG_LEVEL === 'debug') {
      const formattedMsg = this.formatMessage('debug', message, data);
      console.log(formattedMsg);

      const logPath = this.getLogFilePath('debug');
      this.writeToFile(logPath, formattedMsg);
    }
  }

  /**
   * 수집 결과 로그 (별도 파일)
   */
  logCollectionResult(results) {
    const logPath = this.getLogFilePath('collection');
    const formattedMsg = this.formatMessage('result', '채널 수집 완료', results);

    console.log(formattedMsg);
    this.writeToFile(logPath, formattedMsg);
  }

  /**
   * Cron Job 실행 로그
   */
  logCronExecution(status, data) {
    const logPath = this.getLogFilePath('cron');
    const formattedMsg = this.formatMessage('cron', `Cron Job ${status}`, data);

    console.log(formattedMsg);
    this.writeToFile(logPath, formattedMsg);
  }
}

// 싱글톤 인스턴스
const logger = new Logger();

module.exports = logger;
