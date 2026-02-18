/**
 * ヘルスチェックルーター
 * サーバーの稼働状態を確認するエンドポイント（認証不要）
 */

import { Router, Request, Response } from 'express';

import { APP_VERSION } from '../config.js';
import { HealthResponse } from '../types/index.js';
import { sessions } from '../services/session.js';

const router = Router();

/**
 * GET /api/health - サーバーの稼働状態を返す
 * 認証不要のエンドポイント
 */
router.get('/api/health', (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();

  const response: HealthResponse = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
    memory: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
    },
  };

  res.json(response);
});

export default router;
