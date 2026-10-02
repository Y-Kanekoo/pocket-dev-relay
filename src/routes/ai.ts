/**
 * AI解析ルーター
 * POST /api/ai/analyze - ターミナル出力をAIで解析
 * GET /api/ai/status - AI機能のステータスを取得
 */

import { Router, Request, Response } from 'express';

import type { AIAnalyzeRequest, AIAnalyzeResponse, AIStatusResponse } from '../types/index.js';
import { AI_MAX_CONTEXT_LINES } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError } from '../errors/AppError.js';
import { createAIProvider, type AIProvider } from '../services/ai.js';

const router = Router();

// AIプロバイダーをサーバー起動時に一度だけ作成
const aiProvider: AIProvider | null = createAIProvider();

/**
 * GET /api/ai/status - AI機能のステータスを取得
 */
router.get('/ai/status', authMiddleware, (_req: Request, res: Response) => {
  const response: AIStatusResponse = {
    enabled: aiProvider !== null,
    provider: aiProvider ? aiProvider.name : null,
    model: aiProvider ? aiProvider.model : null,
  };
  res.json(response);
});

/**
 * POST /api/ai/analyze - ターミナル出力をAIで解析
 */
router.post(
  '/ai/analyze',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    // AI機能が無効の場合
    if (!aiProvider) {
      res.status(503).json({
        error: 'AI_NOT_AVAILABLE',
        message:
          'AI機能が有効になっていません。ANTHROPIC_API_KEY または OPENAI_API_KEY を設定してください。',
      });
      return;
    }

    // リクエストボディの検証
    const body = req.body as AIAnalyzeRequest;
    if (!body.context || typeof body.context !== 'string') {
      throw new ValidationError('context（ターミナル出力）は必須です');
    }

    // コンテキストの行数を制限
    const lines = body.context.split('\n');
    const limitedContext = lines.slice(-AI_MAX_CONTEXT_LINES).join('\n');

    const question = typeof body.question === 'string' ? body.question.trim() : '';

    // AI APIを呼び出し
    const answer = await aiProvider.analyze(limitedContext, question);

    const response: AIAnalyzeResponse = {
      answer,
      provider: aiProvider.name,
      model: aiProvider.model,
    };
    res.json(response);
  }),
);

export default router;
