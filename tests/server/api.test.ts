/**
 * APIルーターのテスト（/api/config, /api/addresses, /api/qr）
 * expressアプリにルーターをマウントしてテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';

// 認証をスキップするためAUTH_TOKENを空にモック
vi.mock('../../src/config.js', () => ({
  PORT: 4173,
  ROOT_DIR: '/tmp/test-workspace',
  AUTH_TOKEN: '',
  ALLOW_CUSTOM_COMMANDS: false,
  ALLOW_FILE_WRITE: true,
  MAX_FILE_SIZE: 1048576,
  ENABLE_SESSION_LOGS: true,
  ENABLE_SSH: false,
  SSH_DEFAULT_HOST: '',
  SSH_DEFAULT_PORT: 22,
  SSH_DEFAULT_USER: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// networkユーティリティのモック
vi.mock('../../src/utils/network.js', () => ({
  buildAccessUrls: vi.fn(() => [
    {
      type: 'local',
      name: 'localhost',
      host: 'localhost',
      url: 'http://localhost:4173',
    },
  ]),
}));

// PTYのPRESETSモック
vi.mock('../../src/services/pty.js', () => ({
  PRESETS: {
    codex: { label: 'Codex CLI', command: 'codex', args: [] },
    claude: { label: 'Claude Code', command: 'claude', args: [] },
    shell: { label: 'Shell', command: 'zsh', args: [] },
  },
}));

// QRCodeモジュールのモック
vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,mockQRCode'),
}));

/**
 * expressアプリにリクエストを送信するヘルパー
 */
function makeRequest(
  app: Express,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const req = {
      method: method.toUpperCase(),
      url: path,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: body,
      query: {} as Record<string, string>,
    };

    // URLからクエリパラメータを抽出
    const urlParts = path.split('?');
    if (urlParts.length > 1) {
      req.url = urlParts[0];
      const params = new URLSearchParams(urlParts[1]);
      params.forEach((value, key) => {
        req.query[key] = value;
      });
    }

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
const errorMiddleware = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const statusCode =
    (err as unknown as { statusCode?: number }).statusCode || 500;
  res.status(statusCode).json({ error: err.message });
};

describe('API ルーター', () => {
  describe('GET /api/config - アプリケーション設定（SSH無効）', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        PORT: 4173,
        ROOT_DIR: '/tmp/test-workspace',
        AUTH_TOKEN: '',
        ALLOW_CUSTOM_COMMANDS: false,
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        ENABLE_SESSION_LOGS: true,
        ENABLE_SSH: false,
        SSH_DEFAULT_HOST: '',
        SSH_DEFAULT_PORT: 22,
        SSH_DEFAULT_USER: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/utils/network.js', () => ({
        buildAccessUrls: vi.fn(() => [
          {
            type: 'local',
            name: 'localhost',
            host: 'localhost',
            url: 'http://localhost:4173',
          },
        ]),
      }));
      vi.doMock('../../src/services/pty.js', () => ({
        PRESETS: {
          codex: { label: 'Codex CLI', command: 'codex', args: [] },
          claude: { label: 'Claude Code', command: 'claude', args: [] },
          shell: { label: 'Shell', command: 'zsh', args: [] },
        },
      }));
      vi.doMock('qrcode', () => ({
        toDataURL: vi.fn(async () => 'data:image/png;base64,mockQRCode'),
      }));

      const apiMod = await import('../../src/routes/api.js');
      app = express();
      app.use(express.json());
      app.use('/api', apiMod.default);
      app.use(errorMiddleware);
    });

    it('設定情報を正常に取得できること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('workspaceRoot', '/tmp/test-workspace');
      expect(result.body).toHaveProperty('workspaceName', 'test-workspace');
      expect(result.body).toHaveProperty('allowCustomCommands', false);
      expect(result.body).toHaveProperty('fileWriteEnabled', true);
      expect(result.body).toHaveProperty('maxFileSize', 1048576);
      expect(result.body).toHaveProperty('sessionLogsEnabled', true);
    });

    it('利用可能なモード一覧にPRESETSのキーが含まれること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      const modes = (result.body as { modes: string[] }).modes;
      expect(modes).toContain('codex');
      expect(modes).toContain('claude');
      expect(modes).toContain('shell');
    });

    it('SSH無効時はモード一覧にsshが含まれないこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      const modes = (result.body as { modes: string[] }).modes;
      expect(modes).not.toContain('ssh');
    });

    it('SSH無効時はSSH設定がundefinedであること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      expect(result.body).toHaveProperty('sshEnabled', false);
      expect(result.body.sshDefaultHost).toBeUndefined();
      expect(result.body.sshDefaultPort).toBeUndefined();
      expect(result.body.sshDefaultUser).toBeUndefined();
    });

    it('AUTH_TOKEN未設定時はauthEnabled=falseであること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      expect(result.body).toHaveProperty('authEnabled', false);
    });

    it('レスポンスにAUTH_TOKENが含まれないこと（セキュリティ確認）', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      const bodyStr = JSON.stringify(result.body);
      // AUTH_TOKENの値やキー自体がレスポンスに含まれていないこと
      expect(bodyStr).not.toContain('AUTH_TOKEN');
      expect(bodyStr).not.toContain('authToken');
    });
  });

  describe('GET /api/config - SSH有効時', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        PORT: 4173,
        ROOT_DIR: '/tmp/test-workspace',
        AUTH_TOKEN: 'test-token-123',
        ALLOW_CUSTOM_COMMANDS: true,
        ALLOW_FILE_WRITE: false,
        MAX_FILE_SIZE: 2097152,
        ENABLE_SESSION_LOGS: false,
        ENABLE_SSH: true,
        SSH_DEFAULT_HOST: 'example.com',
        SSH_DEFAULT_PORT: 2222,
        SSH_DEFAULT_USER: 'testuser',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/utils/network.js', () => ({
        buildAccessUrls: vi.fn(() => []),
      }));
      vi.doMock('../../src/services/pty.js', () => ({
        PRESETS: {
          codex: { label: 'Codex CLI', command: 'codex', args: [] },
          shell: { label: 'Shell', command: 'zsh', args: [] },
        },
      }));
      vi.doMock('qrcode', () => ({
        toDataURL: vi.fn(async () => 'data:image/png;base64,mockQRCode'),
      }));

      const apiMod = await import('../../src/routes/api.js');
      app = express();
      app.use(express.json());
      app.use('/api', apiMod.default);
      app.use(errorMiddleware);
    });

    // 認証ヘッダー（AUTH_TOKENが設定されているため必要）
    const authHeaders = { authorization: 'Bearer test-token-123' };

    it('SSH有効時はモード一覧にsshが含まれること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config', undefined, authHeaders);
      const modes = (result.body as { modes: string[] }).modes;
      expect(modes).toContain('ssh');
    });

    it('SSH有効時はSSH設定が含まれること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config', undefined, authHeaders);
      expect(result.body).toHaveProperty('sshEnabled', true);
      expect(result.body).toHaveProperty('sshDefaultHost', 'example.com');
      expect(result.body).toHaveProperty('sshDefaultPort', 2222);
      expect(result.body).toHaveProperty('sshDefaultUser', 'testuser');
    });

    it('AUTH_TOKEN設定時はauthEnabled=trueであること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config', undefined, authHeaders);
      expect(result.body).toHaveProperty('authEnabled', true);
    });

    it('カスタムコマンド許可状態が反映されること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config', undefined, authHeaders);
      expect(result.body).toHaveProperty('allowCustomCommands', true);
    });

    it('ファイル書き込み無効状態が反映されること', async () => {
      const result = await makeRequest(app, 'GET', '/api/config', undefined, authHeaders);
      expect(result.body).toHaveProperty('fileWriteEnabled', false);
    });

    it('認証なしでアクセスした場合に401を返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/config');
      expect(result.statusCode).toBe(401);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('GET /api/addresses - アクセスURL一覧', () => {
    let app: Express;
    let mockBuildAccessUrls: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.resetModules();
      mockBuildAccessUrls = vi.fn(() => [
        {
          type: 'mdns',
          name: 'my-mac',
          host: 'my-mac.local',
          url: 'http://my-mac.local:4173',
        },
        {
          type: 'lan',
          name: 'en0',
          host: '192.168.1.100',
          url: 'http://192.168.1.100:4173',
        },
        {
          type: 'local',
          name: 'localhost',
          host: 'localhost',
          url: 'http://localhost:4173',
        },
      ]);

      vi.doMock('../../src/config.js', () => ({
        PORT: 4173,
        ROOT_DIR: '/tmp/test-workspace',
        AUTH_TOKEN: '',
        ALLOW_CUSTOM_COMMANDS: false,
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        ENABLE_SESSION_LOGS: false,
        ENABLE_SSH: false,
        SSH_DEFAULT_HOST: '',
        SSH_DEFAULT_PORT: 22,
        SSH_DEFAULT_USER: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/utils/network.js', () => ({
        buildAccessUrls: mockBuildAccessUrls,
      }));
      vi.doMock('../../src/services/pty.js', () => ({
        PRESETS: {
          shell: { label: 'Shell', command: 'zsh', args: [] },
        },
      }));
      vi.doMock('qrcode', () => ({
        toDataURL: vi.fn(async () => 'data:image/png;base64,mockQRCode'),
      }));

      const apiMod = await import('../../src/routes/api.js');
      app = express();
      app.use(express.json());
      app.use('/api', apiMod.default);
      app.use(errorMiddleware);
    });

    it('アクセスURL一覧を正常に取得できること', async () => {
      const result = await makeRequest(app, 'GET', '/api/addresses');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('port', 4173);
      expect(result.body).toHaveProperty('urls');

      const urls = (
        result.body as {
          urls: Array<{ type: string; name: string; host: string; url: string }>;
        }
      ).urls;
      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBe(3);
    });

    it('buildAccessUrlsが呼び出されること', async () => {
      await makeRequest(app, 'GET', '/api/addresses');
      expect(mockBuildAccessUrls).toHaveBeenCalled();
    });

    it('URL一覧にtype, name, host, urlプロパティが含まれること', async () => {
      const result = await makeRequest(app, 'GET', '/api/addresses');
      const urls = (
        result.body as {
          urls: Array<{ type: string; name: string; host: string; url: string }>;
        }
      ).urls;

      for (const entry of urls) {
        expect(entry).toHaveProperty('type');
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('host');
        expect(entry).toHaveProperty('url');
      }
    });
  });

  describe('GET /api/qr - QRコード生成', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('../../src/config.js', () => ({
        PORT: 4173,
        ROOT_DIR: '/tmp/test-workspace',
        AUTH_TOKEN: '',
        ALLOW_CUSTOM_COMMANDS: false,
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        ENABLE_SESSION_LOGS: false,
        ENABLE_SSH: false,
        SSH_DEFAULT_HOST: '',
        SSH_DEFAULT_PORT: 22,
        SSH_DEFAULT_USER: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('../../src/utils/network.js', () => ({
        buildAccessUrls: vi.fn(() => []),
      }));
      vi.doMock('../../src/services/pty.js', () => ({
        PRESETS: {
          shell: { label: 'Shell', command: 'zsh', args: [] },
        },
      }));
      vi.doMock('qrcode', () => ({
        toDataURL: vi.fn(async () => 'data:image/png;base64,mockQRCode'),
      }));

      const apiMod = await import('../../src/routes/api.js');
      app = express();
      app.use(express.json());
      app.use('/api', apiMod.default);
      app.use(errorMiddleware);
    });

    it('テキストからQRコードを正常に生成できること', async () => {
      const result = await makeRequest(
        app,
        'GET',
        '/api/qr?text=http://localhost:4173',
      );
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('dataUrl');
      expect((result.body as { dataUrl: string }).dataUrl).toContain(
        'data:image/png;base64',
      );
    });

    it('QRコード生成結果がdata URLの形式であること', async () => {
      const result = await makeRequest(
        app,
        'GET',
        '/api/qr?text=http://example.com',
      );
      expect(result.statusCode).toBe(200);
      const dataUrl = (result.body as { dataUrl: string }).dataUrl;
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('テキスト未指定時にバリデーションエラーを返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/qr');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('空文字テキスト指定時にバリデーションエラーを返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/qr?text=');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('空白のみのテキスト指定時にバリデーションエラーを返すこと', async () => {
      const result = await makeRequest(app, 'GET', '/api/qr?text=%20%20');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });
  });
});
