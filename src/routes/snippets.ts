/**
 * スニペットルーター
 * /api/snippets エンドポイント
 * よく使うコマンドをワンタップで実行する機能
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import {
  Snippet,
  SnippetsResponse,
  SnippetExecuteResponse,
} from '../types/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../errors/AppError.js';
import { sessions } from '../services/session.js';
import { JsonStore } from '../utils/store.js';

const router = Router();

/** デフォルトスニペット */
const DEFAULT_SNIPPETS: Snippet[] = [
  { id: nanoid(8), label: 'git status', command: 'git status\n' },
  { id: nanoid(8), label: 'git log', command: 'git log --oneline -10\n' },
  { id: nanoid(8), label: 'ls -la', command: 'ls -la\n' },
  { id: nanoid(8), label: 'npm test', command: 'npm test\n' },
];

/** スニペットデータの永続化ストア */
const store = new JsonStore<Snippet[]>('snippets.json', DEFAULT_SNIPPETS);

/**
 * GET /api/snippets - スニペット一覧を取得
 */
router.get('/snippets', authMiddleware, (_req: Request, res: Response) => {
  const response: SnippetsResponse = {
    snippets: store.load(),
  };
  res.json(response);
});

/**
 * POST /api/snippets - スニペットを追加
 */
router.post('/snippets', authMiddleware, (req: Request, res: Response) => {
  const { label, command } = req.body;

  if (typeof label !== 'string' || !label.trim()) {
    throw new ValidationError('ラベルは必須です');
  }
  if (typeof command !== 'string' || !command.trim()) {
    throw new ValidationError('コマンドは必須です');
  }

  const snippet: Snippet = {
    id: nanoid(8),
    label: label.trim(),
    command: command,
  };

  const snippets = store.load();
  snippets.push(snippet);

  if (!store.save(snippets)) {
    res.status(500).json({ error: 'データの保存に失敗しました' });
    return;
  }
  res.json(snippet);
});

/**
 * DELETE /api/snippets/:id - スニペットを削除
 */
router.delete('/snippets/:id', authMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const snippets = store.load();
  const index = snippets.findIndex((s) => s.id === id);

  if (index === -1) {
    throw new NotFoundError('スニペット');
  }

  snippets.splice(index, 1);

  if (!store.save(snippets)) {
    res.status(500).json({ error: 'データの保存に失敗しました' });
    return;
  }
  res.json({ ok: true });
});

/**
 * POST /api/snippets/:id/execute - スニペットをアクティブセッションで実行
 */
router.post(
  '/snippets/:id/execute',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const snippets = store.load();
    const snippet = snippets.find((s) => s.id === id);

    if (!snippet) {
      throw new NotFoundError('スニペット');
    }

    // アクティブセッションを探す（PTYが存在するセッションのみ）
    let executed = false;
    for (const [, session] of sessions) {
      if (!session.pty) continue;
      // 最初に見つかったアクティブセッションにコマンドを送信
      try {
        session.pty.write(snippet.command);
        executed = true;
        break;
      } catch {
        // このセッションへの書き込みが失敗した場合は次を試す
        continue;
      }
    }

    if (!executed) {
      const response: SnippetExecuteResponse = {
        ok: false,
        message: 'アクティブなセッションがありません',
      };
      res.json(response);
      return;
    }

    const response: SnippetExecuteResponse = {
      ok: true,
      message: `コマンド "${snippet.label}" を実行しました`,
    };
    res.json(response);
  }),
);

export default router;
