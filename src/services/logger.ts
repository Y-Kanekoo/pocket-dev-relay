/**
 * 構造化ログサービス
 * pinoを使用してJSON形式のログを出力
 */
import pino from 'pino';
import { LOG_LEVEL } from '../config.js';
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: LOG_LEVEL,
  transport: IS_DEVELOPMENT
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  // 本番環境ではJSON出力
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

export default logger;
