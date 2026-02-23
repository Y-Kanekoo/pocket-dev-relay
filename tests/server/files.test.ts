/**
 * ファイルAPIのテスト
 * expressアプリにルーターをマウントしてテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';

// 認証をスキップするためAUTH_TOKENを空にモック
vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  ROOT_DIR: '/tmp/test-workspace',
  ALLOW_FILE_WRITE: true,
  MAX_FILE_SIZE: 1048576,
  MAX_UPLOAD_SIZE: 10485760,
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// fs/promisesのモック
vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
  },
}));

// multerのモック
vi.mock('multer', () => {
  // multer().single()が返すミドルウェアのモック
  const mockMiddleware = vi.fn(
    (req: Request, _res: Response, next: NextFunction) => {
      // テストで req.file を設定可能にする
      // beforeEachで req.file が設定されていなければ何もしない
      next();
    },
  );

  const mockMulterInstance = {
    single: vi.fn(() => mockMiddleware),
  };

  const multerFn = vi.fn(() => mockMulterInstance);

  // diskStorage モック
  multerFn.diskStorage = vi.fn(() => ({}));

  return { default: multerFn };
});

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

describe('ファイル API', () => {
  describe('GET /api/files - ディレクトリ一覧', () => {
    let app: Express;
    let mockStat: ReturnType<typeof vi.fn>;
    let mockReaddir: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.resetModules();
      mockStat = vi.fn();
      mockReaddir = vi.fn();

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ROOT_DIR: '/tmp/test-workspace',
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        MAX_UPLOAD_SIZE: 10485760,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          stat: mockStat,
          readdir: mockReaddir,
          readFile: vi.fn(),
          writeFile: vi.fn(),
          mkdir: vi.fn(),
          unlink: vi.fn(),
          rename: vi.fn(),
        },
      }));
      vi.doMock('multer', () => {
        const mockMiddleware = vi.fn(
          (_req: Request, _res: Response, next: NextFunction) => next(),
        );
        const mockMulterInstance = { single: vi.fn(() => mockMiddleware) };
        const multerFn = vi.fn(() => mockMulterInstance);
        multerFn.diskStorage = vi.fn(() => ({}));
        return { default: multerFn };
      });

      const filesMod = await import('../../src/routes/files.js');
      app = express();
      app.use(express.json());
      app.use('/api', filesMod.default);
      app.use(errorMiddleware);
    });

    it('ディレクトリ一覧を正常に取得できること', async () => {
      mockStat.mockResolvedValue({
        isDirectory: () => true,
      });
      mockReaddir.mockResolvedValue([
        { name: 'src', isDirectory: () => true },
        { name: 'README.md', isDirectory: () => false },
        { name: 'package.json', isDirectory: () => false },
        { name: 'tests', isDirectory: () => true },
      ]);

      const result = await makeRequest(app, 'GET', '/api/files?path=.');
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('path');
      expect(result.body).toHaveProperty('items');

      const items = (
        result.body as { items: Array<{ name: string; type: string }> }
      ).items;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(4);

      // ディレクトリが先にソートされること
      expect(items[0].type).toBe('dir');
      expect(items[1].type).toBe('dir');
      expect(items[2].type).toBe('file');
      expect(items[3].type).toBe('file');

      // 同一タイプ内は名前順ソート（localeCompare）
      expect(items[0].name).toBe('src');
      expect(items[1].name).toBe('tests');
      // ファイルも名前順（localeCompareの結果に依存）
      const fileNames = items.filter((i) => i.type === 'file').map((i) => i.name);
      expect(fileNames).toContain('README.md');
      expect(fileNames).toContain('package.json');
    });

    it('パストラバーサル攻撃（../）を拒否すること', async () => {
      const result = await makeRequest(
        app,
        'GET',
        '/api/files?path=../../etc',
      );
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('存在しないディレクトリで404を返すこと', async () => {
      mockStat.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const result = await makeRequest(
        app,
        'GET',
        '/api/files?path=nonexistent',
      );
      expect(result.statusCode).toBe(404);
      expect(result.body).toHaveProperty('error');
    });

    it('ファイルを指定した場合にFileTypeErrorを返すこと', async () => {
      mockStat.mockResolvedValue({
        isDirectory: () => false,
      });

      const result = await makeRequest(
        app,
        'GET',
        '/api/files?path=file.txt',
      );
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('GET /api/file - ファイル内容取得', () => {
    let app: Express;
    let mockStat: ReturnType<typeof vi.fn>;
    let mockReadFile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.resetModules();
      mockStat = vi.fn();
      mockReadFile = vi.fn();

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ROOT_DIR: '/tmp/test-workspace',
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        MAX_UPLOAD_SIZE: 10485760,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          stat: mockStat,
          readdir: vi.fn(),
          readFile: mockReadFile,
          writeFile: vi.fn(),
          mkdir: vi.fn(),
          unlink: vi.fn(),
          rename: vi.fn(),
        },
      }));
      vi.doMock('multer', () => {
        const mockMiddleware = vi.fn(
          (_req: Request, _res: Response, next: NextFunction) => next(),
        );
        const mockMulterInstance = { single: vi.fn(() => mockMiddleware) };
        const multerFn = vi.fn(() => mockMulterInstance);
        multerFn.diskStorage = vi.fn(() => ({}));
        return { default: multerFn };
      });

      const filesMod = await import('../../src/routes/files.js');
      app = express();
      app.use(express.json());
      app.use('/api', filesMod.default);
      app.use(errorMiddleware);
    });

    it('ファイル内容を正常に取得できること', async () => {
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 100,
      });
      mockReadFile.mockResolvedValue('ファイルの内容です');

      const result = await makeRequest(
        app,
        'GET',
        '/api/file?path=test.txt',
      );
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('content', 'ファイルの内容です');
      expect(result.body).toHaveProperty('path');
    });

    it('存在しないファイルで404を返すこと', async () => {
      mockStat.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const result = await makeRequest(
        app,
        'GET',
        '/api/file?path=nonexistent.txt',
      );
      expect(result.statusCode).toBe(404);
      expect(result.body).toHaveProperty('error');
    });

    it('パストラバーサル攻撃（../）を拒否すること', async () => {
      const result = await makeRequest(
        app,
        'GET',
        '/api/file?path=../../etc/passwd',
      );
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('ディレクトリを指定した場合にFileTypeErrorを返すこと', async () => {
      mockStat.mockResolvedValue({
        isFile: () => false,
        size: 0,
      });

      const result = await makeRequest(app, 'GET', '/api/file?path=src');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('ファイルサイズがMAX_FILE_SIZEを超える場合に413を返すこと', async () => {
      mockStat.mockResolvedValue({
        isFile: () => true,
        size: 2000000, // 2MB（上限1MB）
      });

      const result = await makeRequest(
        app,
        'GET',
        '/api/file?path=large-file.bin',
      );
      expect(result.statusCode).toBe(413);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('POST /api/file - ファイル書き込み', () => {
    let app: Express;
    let mockMkdir: ReturnType<typeof vi.fn>;
    let mockWriteFile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.resetModules();
      mockMkdir = vi.fn().mockResolvedValue(undefined);
      mockWriteFile = vi.fn().mockResolvedValue(undefined);

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ROOT_DIR: '/tmp/test-workspace',
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        MAX_UPLOAD_SIZE: 10485760,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          stat: vi.fn(),
          readdir: vi.fn(),
          readFile: vi.fn(),
          writeFile: mockWriteFile,
          mkdir: mockMkdir,
          unlink: vi.fn(),
          rename: vi.fn(),
        },
      }));
      vi.doMock('multer', () => {
        const mockMiddleware = vi.fn(
          (_req: Request, _res: Response, next: NextFunction) => next(),
        );
        const mockMulterInstance = { single: vi.fn(() => mockMiddleware) };
        const multerFn = vi.fn(() => mockMulterInstance);
        multerFn.diskStorage = vi.fn(() => ({}));
        return { default: multerFn };
      });

      const filesMod = await import('../../src/routes/files.js');
      app = express();
      app.use(express.json());
      app.use('/api', filesMod.default);
      app.use(errorMiddleware);
    });

    it('ファイルを正常に書き込めること', async () => {
      const result = await makeRequest(app, 'POST', '/api/file', {
        path: 'newfile.txt',
        content: '新しいファイルの内容',
      });
      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('ok', true);
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/test-workspace/newfile.txt',
        '新しいファイルの内容',
        'utf8',
      );
    });

    it('パストラバーサル攻撃を拒否すること', async () => {
      const result = await makeRequest(app, 'POST', '/api/file', {
        path: '../../etc/malicious',
        content: 'evil',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });

    it('contentが文字列でない場合にバリデーションエラーを返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/file', {
        path: 'test.txt',
        content: 12345,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('POST /api/file - ファイル書き込み無効時', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ROOT_DIR: '/tmp/test-workspace',
        ALLOW_FILE_WRITE: false,
        MAX_FILE_SIZE: 1048576,
        MAX_UPLOAD_SIZE: 10485760,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          stat: vi.fn(),
          readdir: vi.fn(),
          readFile: vi.fn(),
          writeFile: vi.fn(),
          mkdir: vi.fn(),
          unlink: vi.fn(),
          rename: vi.fn(),
        },
      }));
      vi.doMock('multer', () => {
        const mockMiddleware = vi.fn(
          (_req: Request, _res: Response, next: NextFunction) => next(),
        );
        const mockMulterInstance = { single: vi.fn(() => mockMiddleware) };
        const multerFn = vi.fn(() => mockMulterInstance);
        multerFn.diskStorage = vi.fn(() => ({}));
        return { default: multerFn };
      });

      const filesMod = await import('../../src/routes/files.js');
      app = express();
      app.use(express.json());
      app.use('/api', filesMod.default);
      app.use(errorMiddleware);
    });

    it('ファイル書き込みが無効の場合に403を返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/file', {
        path: 'test.txt',
        content: 'テスト',
      });
      expect(result.statusCode).toBe(403);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('POST /api/upload - ファイルアップロード', () => {
    let app: Express;
    let mockMkdir: ReturnType<typeof vi.fn>;
    let mockRename: ReturnType<typeof vi.fn>;
    let mockUnlink: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.resetModules();
      mockMkdir = vi.fn().mockResolvedValue(undefined);
      mockRename = vi.fn().mockResolvedValue(undefined);
      mockUnlink = vi.fn().mockResolvedValue(undefined);

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ROOT_DIR: '/tmp/test-workspace',
        ALLOW_FILE_WRITE: true,
        MAX_FILE_SIZE: 1048576,
        MAX_UPLOAD_SIZE: 10485760,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          stat: vi.fn(),
          readdir: vi.fn(),
          readFile: vi.fn(),
          writeFile: vi.fn(),
          mkdir: mockMkdir,
          unlink: mockUnlink,
          rename: mockRename,
        },
      }));

      // multerをモックして、req.fileをテストで制御可能にする
      vi.doMock('multer', () => {
        const mockMiddleware = vi.fn(
          (req: Request, _res: Response, next: NextFunction) => {
            // req.file が既にセットされていない場合はnullのまま
            // テスト側で req.file をセットする代わりに、beforeEachの後でappにミドルウェアを追加する
            next();
          },
        );
        const mockMulterInstance = { single: vi.fn(() => mockMiddleware) };
        const multerFn = vi.fn(() => mockMulterInstance);
        multerFn.diskStorage = vi.fn(() => ({}));
        return { default: multerFn };
      });

      const filesMod = await import('../../src/routes/files.js');
      app = express();
      app.use(express.json());
      app.use('/api', filesMod.default);
      app.use(errorMiddleware);
    });

    it('ファイルが選択されていない場合にバリデーションエラーを返すこと', async () => {
      // multerモックがreq.fileを設定しないので、ファイル未選択状態
      const result = await makeRequest(app, 'POST', '/api/upload');
      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('POST /api/upload - アップロード無効時', () => {
    let app: Express;

    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        ROOT_DIR: '/tmp/test-workspace',
        ALLOW_FILE_WRITE: false,
        MAX_FILE_SIZE: 1048576,
        MAX_UPLOAD_SIZE: 10485760,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      vi.doMock('fs/promises', () => ({
        default: {
          stat: vi.fn(),
          readdir: vi.fn(),
          readFile: vi.fn(),
          writeFile: vi.fn(),
          mkdir: vi.fn(),
          unlink: vi.fn().mockResolvedValue(undefined),
          rename: vi.fn(),
        },
      }));
      vi.doMock('multer', () => {
        const mockMiddleware = vi.fn(
          (_req: Request, _res: Response, next: NextFunction) => next(),
        );
        const mockMulterInstance = { single: vi.fn(() => mockMiddleware) };
        const multerFn = vi.fn(() => mockMulterInstance);
        multerFn.diskStorage = vi.fn(() => ({}));
        return { default: multerFn };
      });

      const filesMod = await import('../../src/routes/files.js');
      app = express();
      app.use(express.json());
      app.use('/api', filesMod.default);
      app.use(errorMiddleware);
    });

    it('アップロードが無効の場合に403を返すこと', async () => {
      const result = await makeRequest(app, 'POST', '/api/upload');
      expect(result.statusCode).toBe(403);
      expect(result.body).toHaveProperty('error');
    });
  });
});
