/**
 * ログルーター
 * /api/logs, /api/log/:fileName エンドポイント
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

import {
  SessionMode,
  SessionLogsResponse,
  SessionLogContentResponse,
} from '../types/index.js';
import { ENABLE_SESSION_LOGS, LOG_DIR } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionLogs } from '../services/session.js';
import {
  FeatureDisabledError,
  ValidationError,
  NotFoundError,
} from '../errors/AppError.js';

const router = Router();

/**
 * GET /api/logs - セッションログ一覧を取得
 */
router.get('/logs', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  if (!ENABLE_SESSION_LOGS) {
    throw new FeatureDisabledError('セッションログ');
  }

  // ディスク上のログファイルを取得
  const files = await fs.readdir(LOG_DIR).catch(() => [] as string[]);
  const logFiles = files
    .filter((f) => f.startsWith('session-') && f.endsWith('.log'))
    .sort()
    .reverse();

  // メタデータとマージ
  const logs = await Promise.all(
    logFiles.map(async (fileName) => {
      // メモリ上のメタデータを検索
      for (const [, meta] of sessionLogs) {
        if (meta.fileName === fileName) {
          return meta;
        }
      }
      // メタデータがない場合はファイル情報から生成
      const filePath = path.join(LOG_DIR, fileName);
      const stats = await fs.stat(filePath).catch(() => null);
      return {
        id: '',
        fileName,
        mode: 'shell' as SessionMode,
        label: '',
        cwd: '',
        startedAt: stats ? stats.birthtime.toISOString() : '',
        endedAt: null,
        size: stats ? stats.size : 0,
      };
    })
  );

  const response: SessionLogsResponse = { logs };
  res.json(response);
}));

/**
 * GET /api/log/:fileName - セッションログ内容を取得
 */
router.get('/log/:fileName', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  if (!ENABLE_SESSION_LOGS) {
    throw new FeatureDisabledError('セッションログ');
  }

  const fileName = req.params.fileName as string;
  // ディレクトリトラバーサル防止
  if (fileName.includes('/') || fileName.includes('..')) {
    throw new ValidationError('無効なファイル名です');
  }
  if (!fileName.startsWith('session-') || !fileName.endsWith('.log')) {
    throw new ValidationError('無効なファイル名です');
  }

  const logPath = path.join(LOG_DIR, fileName);
  let content: string;
  try {
    content = await fs.readFile(logPath, 'utf8');
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      throw new NotFoundError('ログファイル');
    }
    throw error;
  }

  const response: SessionLogContentResponse = { fileName, content };
  res.json(response);
}));

export default router;
