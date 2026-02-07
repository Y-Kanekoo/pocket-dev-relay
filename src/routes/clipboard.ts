/**
 * クリップボードルーター
 * /api/clipboard エンドポイント
 * PC⇔スマホ間でテキストを転送する機能
 */

import { Router, Request, Response } from 'express';
import { ClipboardData, ClipboardResponse } from '../types/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../errors/AppError.js';

const router = Router();

/** メモリ上のクリップボードデータ */
let clipboardStore: ClipboardData | null = null;

/**
 * GET /api/clipboard - クリップボード内容を取得
 */
router.get('/clipboard', authMiddleware, (_req: Request, res: Response) => {
  if (!clipboardStore) {
    const response: ClipboardResponse = {
      text: '',
      updatedAt: '',
    };
    res.json(response);
    return;
  }

  const response: ClipboardResponse = {
    text: clipboardStore.text,
    updatedAt: clipboardStore.updatedAt,
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

  clipboardStore = {
    text,
    updatedAt: new Date().toISOString(),
  };

  const response: ClipboardResponse = {
    text: clipboardStore.text,
    updatedAt: clipboardStore.updatedAt,
  };
  res.json(response);
});

/**
 * DELETE /api/clipboard - クリップボードをクリア
 */
router.delete('/clipboard', authMiddleware, (_req: Request, res: Response) => {
  clipboardStore = null;
  res.json({ ok: true });
});

export default router;
