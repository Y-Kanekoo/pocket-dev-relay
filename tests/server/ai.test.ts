/**
 * AI解析APIのテスト
 * expressアプリにルーターをマウントしてテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';

// 認証をスキップするためAUTH_TOKENを空にモック
vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  AI_MAX_CONTEXT_LINES: 100,
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// createAIProviderのモック（デフォルトはnull = AI無効）
vi.mock('../../src/services/ai.js', () => ({
  createAIProvider: vi.fn(() => null),
}));

/**
 * expressアプリにリクエストを送信するヘルパー
 */
function makeRequest(
  app: Express,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const req = {
      method: method.toUpperCase(),
      url: path,
      headers: {
        'content-type': 'application/json',
      },
      body: body,
    };

    let resultBody = {} as Record<string, unknown>;
    let resultStatus = 200;
    let resolved = false;

    const doResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve({ statusCode: resultStatus, body: resultBody });
      }
    };

    const res = {
      statusCode: 200,
      _headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this._headers[name.toLowerCase()] = value;
        return this;
      },
      getHeader(name: string) {
        return this._headers[name.toLowerCase()];
      },
      writeHead(status: number) {
        resultStatus = status;
        return this;
      },
      status(code: number) {
        resultStatus = code;
        this.statusCode = code;
        return this;
      },
      json(data: Record<string, unknown>) {
        resultBody = data;
        doResolve();
        return this;
      },
      send(data: string) {
        try {
          resultBody = JSON.parse(data);
        } catch {
          resultBody = { raw: data };
        }
        doResolve();
        return this;
      },
      end() {
        doResolve();
        return this;
      },
    };

    // expressアプリを直接呼び出す
    (app as unknown as (req: unknown, res: unknown) => void)(req, res);
  });
}

// エラーハンドラ（AppErrorを処理）
const errorMiddleware = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = (err as unknown as { statusCode?: number }).statusCode || 500;
  res.status(statusCode).json({ error: err.message });
};

describe('AI解析 API', () => {
  describe('AI無効時', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        AI_MAX_CONTEXT_LINES: 100,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/services/ai.js', () => ({
        createAIProvider: vi.fn(() => null),
      }));

      const aiMod = await import('../../src/routes/ai.js');
      app = express();
      app.use(express.json());
      app.use('/api', aiMod.default);
      app.use(errorMiddleware);
    });

    it('GET /api/ai/status でAI無効状態を返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/ai/status');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('enabled', false);
      expect(result.body).toHaveProperty('provider', null);
      expect(result.body).toHaveProperty('model', null);
    });

    it('POST /api/ai/analyze で503を返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/ai/analyze', {
        context: 'テストコンテキスト',
      });
      expect(result.statusCode).toBe(503);
      expect(result.body).toHaveProperty('error', 'AI_NOT_AVAILABLE');
    });
  });

  describe('AI有効時', () => {
    let app: Express;
    const mockAnalyze = vi.fn();

    beforeEach(async () => {
      vi.resetModules();
      mockAnalyze.mockReset();
      mockAnalyze.mockResolvedValue('AIの回答');
      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        AI_MAX_CONTEXT_LINES: 100,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/services/ai.js', () => ({
        createAIProvider: vi.fn(() => ({
          name: 'mock-provider',
          model: 'mock-model',
          analyze: mockAnalyze,
        })),
      }));

      const aiMod = await import('../../src/routes/ai.js');
      app = express();
      app.use(express.json());
      app.use('/api', aiMod.default);
      app.use(errorMiddleware);
    });

    it('GET /api/ai/status でAI有効状態を返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/ai/status');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('enabled', true);
      expect(result.body).toHaveProperty('provider', 'mock-provider');
      expect(result.body).toHaveProperty('model', 'mock-model');
    });

    it('POST /api/ai/analyze でAI解析結果を返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/ai/analyze', {
        context: 'エラー: ファイルが見つかりません',
        question: 'このエラーの原因は？',
      });
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('answer', 'AIの回答');
      expect(result.body).toHaveProperty('provider', 'mock-provider');
      expect(result.body).toHaveProperty('model', 'mock-model');
      expect(mockAnalyze).toHaveBeenCalledWith(
        'エラー: ファイルが見つかりません',
        'このエラーの原因は？',
      );
    });

    it('POST /api/ai/analyze でcontext未指定時にバリデーションエラーを返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/ai/analyze', {
        question: '質問だけ',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('POST /api/ai/analyze でcontextが空文字の場合にバリデーションエラーを返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/ai/analyze', {
        context: '',
        question: '質問',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('POST /api/ai/analyze でquestion未指定時も正常に動作すること', async () => {
      const result = await makeRequest(app, 'POST', '/api/ai/analyze', {
        context: 'ターミナル出力',
      });
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('answer', 'AIの回答');
      // questionは空文字として渡される
      expect(mockAnalyze).toHaveBeenCalledWith('ターミナル出力', '');
    });

    it('POST /api/ai/analyze でコンテキスト行数がAI_MAX_CONTEXT_LINESを超える場合に切り詰められること', async () => {
      // 150行のコンテキストを生成（AI_MAX_CONTEXT_LINES = 100）
      const lines = Array.from({ length: 150 }, (_, i) => `行${i + 1}`);
      const context = lines.join('\n');

      const result = await makeRequest(app, 'POST', '/api/ai/analyze', {
        context,
        question: 'テスト',
      });
      expect(result.statusCode).toBe(200);

      // mockAnalyzeに渡されたcontextが後半100行のみであることを確認
      const calledContext = mockAnalyze.mock.calls[0][0] as string;
      const calledLines = calledContext.split('\n');
      expect(calledLines.length).toBe(100);
      expect(calledLines[0]).toBe('行51');
      expect(calledLines[99]).toBe('行150');
    });
  });
});
