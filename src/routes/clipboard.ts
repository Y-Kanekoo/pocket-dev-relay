/**
 * クリップボードルーター
 * /api/clipboard エンドポイント
 * PC⇔スマホ間でテキストを転送する機能
 */

import { Router, Request, Response } from 'express';
import { ClipboardData, ClipboardResponse } from '../types/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../errors/AppError.js';
import { JsonStore } from '../utils/store.js';

const router = Router();

/** クリップボードデータの永続化ストア */
const store = new JsonStore<ClipboardData | null>('clipboard.json', null);

/**
 * GET /api/clipboard - クリップボード内容を取得
 */
router.get('/clipboard', authMiddleware, (_req: Request, res: Response) => {
  const data = store.load();
  if (!data) {
    const response: ClipboardResponse = {
      text: '',
      updatedAt: '',
    };
    res.json(response);
    return;
  }

  const response: ClipboardResponse = {
    text: data.text,
    updatedAt: data.updatedAt,
  };
  res.json(response);
});

/**
 * POST /api/clipboard - クリップボードにテキストを設定
 */
router.post('/clipboard', authMiddleware, (req: Request, res: Response) => {
  const { text } = req.body;

  if (typeof text !== 'string') {
    throw new ValidationError('テキストが不正です');
  }

  const data: ClipboardData = {
    text,
    updatedAt: new Date().toISOString(),
  };
  store.save(data);

  const response: ClipboardResponse = {
    text: data.text,
    updatedAt: data.updatedAt,
  };
  res.json(response);
});

/**
 * DELETE /api/clipboard - クリップボードをクリア
 */
router.delete('/clipboard', authMiddleware, (_req: Request, res: Response) => {
  store.save(null);
  res.json({ ok: true });
});

export default router;
