/**
 * ログAPIのテスト
 * expressアプリにルーターをマウントしてテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';

// 認証をスキップするためAUTH_TOKENを空にモック
vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  ENABLE_SESSION_LOGS: true,
  LOG_DIR: '/tmp/test-logs',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// session.jsのモック
vi.mock('../../src/services/session.js', () => ({
  sessionLogs: new Map(),
}));

// fs/promisesのモック
vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
  },
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

describe('ログ API', () => {
  describe('セッションログ無効時', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ENABLE_SESSION_LOGS: false,
        LOG_DIR: '/tmp/test-logs',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/services/session.js', () => ({
        sessionLogs: new Map(),
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          readdir: vi.fn(),
          stat: vi.fn(),
          readFile: vi.fn(),
        },
      }));

      const logsMod = await import('../../src/routes/logs.js');
      app = express();
      app.use(express.json());
      app.use('/api', logsMod.default);
      app.use(errorMiddleware);
    });

    it('GET /api/logs で FeatureDisabledError (403) を返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/logs');
      expect(result.statusCode).toBe(403);
      expect(result.body).toHaveProperty('error');
    });

    it('GET /api/log/:fileName で FeatureDisabledError (403) を返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/log/session-001.log');
      expect(result.statusCode).toBe(403);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('セッションログ有効時', () => {
    let app: Express;
    let mockReaddir: ReturnType<typeof vi.fn>;
    let mockReadFile: ReturnType<typeof vi.fn>;
    let mockStat: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.resetModules();
      mockReaddir = vi.fn();
      mockReadFile = vi.fn();
      mockStat = vi.fn();

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ENABLE_SESSION_LOGS: true,
        LOG_DIR: '/tmp/test-logs',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/services/session.js', () => ({
        sessionLogs: new Map(),
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          readdir: mockReaddir,
          stat: mockStat,
          readFile: mockReadFile,
        },
      }));

      const logsMod = await import('../../src/routes/logs.js');
      app = express();
      app.use(express.json());
      app.use('/api', logsMod.default);
      app.use(errorMiddleware);
    });

    it('GET /api/logs でログ一覧を返すこと', async () => {
      mockReaddir.mockResolvedValue(['session-001.log', 'session-002.log', 'other.txt']);
      mockStat.mockResolvedValue({ birthtime: new Date('2024-01-01'), size: 1234 });

      const result = await makeRequest(app, 'GET', '/api/logs');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('logs');

      const logs = (result.body as { logs: Array<{ fileName: string }> }).logs;
      // 'session-'で始まり'.log'で終わるファイルのみがフィルタリングされる
      expect(logs.length).toBe(2);
      // 逆順ソートされるため session-002 が先
      expect(logs[0].fileName).toBe('session-002.log');
      expect(logs[1].fileName).toBe('session-001.log');
    });

    it('GET /api/logs でディレクトリ読み込み失敗時は空配列を返すこと', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));

      const result = await makeRequest(app, 'GET', '/api/logs');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('logs');

      const logs = (result.body as { logs: Array<unknown> }).logs;
      expect(logs.length).toBe(0);
    });

    it('GET /api/log/:fileName でログ内容を返すこと', async () => {
      mockReadFile.mockResolvedValue('ログの内容\n2行目のログ');

      const result = await makeRequest(app, 'GET', '/api/log/session-001.log');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('fileName', 'session-001.log');
      expect(result.body).toHaveProperty('content', 'ログの内容\n2行目のログ');
    });

    it('GET /api/log/:fileName でファイル未存在時は404を返すこと', async () => {
      mockReadFile.mockRejectedValue(
        Object.assign(new Error('ファイルが見つかりません'), { code: 'ENOENT' }),
      );

      const result = await makeRequest(app, 'GET', '/api/log/session-999.log');
      expect(result.statusCode).toBe(404);
      expect(result.body).toHaveProperty('error');
    });

    it('GET /api/log/:fileName でディレクトリトラバーサル(..)を拒否すること', async () => {
      // '..'を含むがスラッシュは含まないケース（Expressのルートパラメータとしてマッチする）
      const result = await makeRequest(app, 'GET', '/api/log/session-..secret.log');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('GET /api/log/:fileName で無効なファイル名（session-で始まらない）を拒否すること', async () => {
      const result = await makeRequest(app, 'GET', '/api/log/invalid-name.log');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('GET /api/log/:fileName で無効なファイル名（.logで終わらない）を拒否すること', async () => {
      const result = await makeRequest(app, 'GET', '/api/log/session-001.txt');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });
  });
});
