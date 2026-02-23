/**
 * クリップボードAPIのテスト
 * expressアプリにルーターをマウントしてテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

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
      this.data = defaultValue;
    }
    initDir(): void {
      // テストでは何もしない
    }
    load(): T {
      return this.data;
    }
    save(data: T): void {
      this.data = data;
    }
  }
  return { JsonStore: MockJsonStore };
});

describe('クリップボード API', () => {
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
          this.data = defaultValue;
        }
        initDir(): void {
          // テストでは何もしない
        }
        load(): T {
          return this.data;
        }
        save(data: T): void {
          this.data = data;
        }
      }
      return { JsonStore: MockJsonStore };
    });

    const clipboardMod = await import('../../src/routes/clipboard.js');
    app = express();
    app.use(express.json());
    app.use('/api', clipboardMod.default);
  });

  /**
   * expressアプリにリクエストを送信するヘルパー
   * supertestを使わずにapp.handleで呼び出す
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
      let headersSent = false;

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
          headersSent = true;
          resolve({ statusCode: resultStatus, body: resultBody });
          return this;
        },
        send(data: string) {
          if (!headersSent) {
            try {
              resultBody = JSON.parse(data);
            } catch {
              resultBody = { raw: data };
            }
            resolve({ statusCode: resultStatus, body: resultBody });
          }
          return this;
        },
        end() {
          if (!headersSent) {
            resolve({ statusCode: resultStatus, body: resultBody });
          }
          return this;
        },
      };

      // expressアプリを直接呼び出す
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as unknown as (req: unknown, res: unknown) => void)(req, res);
    });
  }

  it('POST /api/clipboard でテキストを保存できること', async () => {
    const result = await makeRequest('POST', '/api/clipboard', {
      text: 'テスト用テキスト',
    });
    expect(result.body).toHaveProperty('text', 'テスト用テキスト');
    expect(result.body).toHaveProperty('updatedAt');
  });

  it('GET /api/clipboard で保存したテキストを取得できること', async () => {
    // まずPOSTで保存
    await makeRequest('POST', '/api/clipboard', {
      text: '取得テスト用テキスト',
    });

    // GETで取得
    const result = await makeRequest('GET', '/api/clipboard');
    expect(result.body).toHaveProperty('text', '取得テスト用テキスト');
    expect(result.body).toHaveProperty('updatedAt');
  });

  it('DELETE /api/clipboard でテキストをクリアできること', async () => {
    // まずPOSTで保存
    await makeRequest('POST', '/api/clipboard', {
      text: '削除テスト用テキスト',
    });

    // DELETEでクリア
    const deleteResult = await makeRequest('DELETE', '/api/clipboard');
    expect(deleteResult.body).toHaveProperty('ok', true);

    // GETでクリアされたことを確認
    const getResult = await makeRequest('GET', '/api/clipboard');
    expect(getResult.body).toHaveProperty('text', '');
    expect(getResult.body).toHaveProperty('updatedAt', '');
  });

  it('空のクリップボード取得時に空テキストを返すこと', async () => {
    // 何も保存せずにGET
    const result = await makeRequest('GET', '/api/clipboard');
    expect(result.body).toHaveProperty('text', '');
    expect(result.body).toHaveProperty('updatedAt', '');
  });
});
