/**
 * スニペットAPIのテスト
 * expressアプリにルーターをマウントしてテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';

// 認証をスキップするためAUTH_TOKENを空にモック
vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
  DATA_DIR: '/tmp/test-pocket-dev-relay',
}));

// JsonStoreをメモリベースのモックに差し替え
vi.mock('../../src/utils/store.js', () => {
  class MockJsonStore<T> {
    private data: T;
    constructor(_filename: string, defaultValue: T) {
      this.data = structuredClone(defaultValue);
    }
    initDir(): void {
      // テストでは何もしない
    }
    load(): T {
      return this.data;
    }
    save(data: T): boolean {
      this.data = data;
      return true;
    }
  }
  return { JsonStore: MockJsonStore };
});

// session.ts のモック
vi.mock('../../src/services/session.js', () => ({
  sessions: new Map(),
}));

describe('スニペット API', () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../src/config.js', () => ({
      AUTH_TOKEN: '',
      LOG_LEVEL: 'silent',
      APP_VERSION: '0.0.0-test',
      DATA_DIR: '/tmp/test-pocket-dev-relay',
    }));
    vi.doMock('../../src/utils/store.js', () => {
      class MockJsonStore<T> {
        private data: T;
        constructor(_filename: string, defaultValue: T) {
          this.data = structuredClone(defaultValue);
        }
        initDir(): void {
          // テストでは何もしない
        }
        load(): T {
          return this.data;
        }
        save(data: T): boolean {
          this.data = data;
          return true;
        }
      }
      return { JsonStore: MockJsonStore };
    });
    vi.doMock('../../src/services/session.js', () => ({
      sessions: new Map(),
    }));

    const snippetsMod = await import('../../src/routes/snippets.js');
    app = express();
    app.use(express.json());
    app.use('/api', snippetsMod.default);
    // エラーハンドラを追加（throwされたエラーをキャッチしてJSONレスポンスを返す）
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      const statusCode = (err as unknown as { statusCode?: number }).statusCode || 500;
      res.status(statusCode).json({ error: err.message });
    });
  });

  /**
   * expressアプリにリクエストを送信するヘルパー
   */
  function makeRequest(
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

  it('GET /api/snippets でデフォルトスニペット一覧を取得できること', async () => {
    const result = await makeRequest('GET', '/api/snippets');

    expect(result.body).toHaveProperty('snippets');
    const snippets = (
      result.body as { snippets: Array<{ id: string; label: string; command: string }> }
    ).snippets;
    expect(Array.isArray(snippets)).toBe(true);
    expect(snippets.length).toBeGreaterThanOrEqual(4); // デフォルト4つ

    // デフォルトスニペットのラベルを確認
    const labels = snippets.map((s) => s.label);
    expect(labels).toContain('git status');
    expect(labels).toContain('git log');
    expect(labels).toContain('ls -la');
    expect(labels).toContain('npm test');
  });

  it('POST /api/snippets でスニペットを追加できること', async () => {
    const result = await makeRequest('POST', '/api/snippets', {
      label: 'テストコマンド',
      command: 'echo "hello"\n',
    });

    expect(result.body).toHaveProperty('id');
    expect(result.body).toHaveProperty('label', 'テストコマンド');
    expect(result.body).toHaveProperty('command', 'echo "hello"\n');
  });

  it('DELETE /api/snippets/:id でスニペットを削除できること', async () => {
    // まずGETでスニペット一覧を取得してIDを把握
    const getResult = await makeRequest('GET', '/api/snippets');
    const snippets = (
      getResult.body as {
        snippets: Array<{ id: string; label: string }>;
      }
    ).snippets;
    const targetId = snippets[0].id;
    const initialCount = snippets.length;

    // DELETEで削除
    const deleteResult = await makeRequest('DELETE', `/api/snippets/${targetId}`);
    expect(deleteResult.body).toHaveProperty('ok', true);

    // 削除後にGETでスニペット数が減っていることを確認
    const getResult2 = await makeRequest('GET', '/api/snippets');
    const snippets2 = (
      getResult2.body as {
        snippets: Array<{ id: string }>;
      }
    ).snippets;
    expect(snippets2.length).toBe(initialCount - 1);
  });

  it('POST /api/snippets/:id/execute でアクティブセッションがない場合はメッセージを返すこと', async () => {
    // まずスニペット一覧を取得してIDを把握
    const getResult = await makeRequest('GET', '/api/snippets');
    const snippets = (
      getResult.body as {
        snippets: Array<{ id: string }>;
      }
    ).snippets;
    const targetId = snippets[0].id;

    // executeを呼び出す
    const execResult = await makeRequest('POST', `/api/snippets/${targetId}/execute`);
    // アクティブセッションがないため ok: false を期待
    expect(execResult.body).toHaveProperty('ok', false);
    expect(execResult.body).toHaveProperty('message');
  });

  it('POST /api/snippets でラベルが空の場合はバリデーションエラーになること', async () => {
    const result = await makeRequest('POST', '/api/snippets', {
      label: '',
      command: 'echo test',
    });
    // ValidationErrorがthrowされエラーハンドラが400を返す
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.body).toHaveProperty('error');
    expect((result.body as { error: string }).error).toContain('ラベル');
  });

  it('POST /api/snippets でコマンドが空の場合はバリデーションエラーになること', async () => {
    const result = await makeRequest('POST', '/api/snippets', {
      label: 'テスト',
      command: '',
    });
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.body).toHaveProperty('error');
    expect((result.body as { error: string }).error).toContain('コマンド');
  });
});
