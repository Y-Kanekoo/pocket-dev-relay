/**
 * API呼び出しのテスト
 * 注: 実際のfetch呼び出しはブラウザ環境で行われるため、
 * ここではAPIレスポンスの型検証とヘルパー関数のテストを行う
 */

import { describe, it, expect } from 'vitest';

// ============================================================
// 型定義（クライアント側の型を再現）
// ============================================================

interface AppConfig {
  workspaceRoot: string;
  workspaceName: string;
  modes: string[];
  allowCustomCommands: boolean;
  fileWriteEnabled: boolean;
  authEnabled: boolean;
  maxFileSize: number;
  sessionLogsEnabled: boolean;
}

interface FileItem {
  name: string;
  type: 'file' | 'dir';
}

interface FileListResponse {
  path: string;
  items: FileItem[];
}

interface FileContentResponse {
  path: string;
  content: string;
}

// ============================================================
// 認証ヘッダー生成のテスト
// ============================================================

/**
 * 認証ヘッダーを生成
 */
function authHeaders(token: string): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

describe('authHeaders', () => {
  it('トークンがある場合はAuthorizationヘッダーを返す', () => {
    const headers = authHeaders('my-token');
    expect(headers).toEqual({ Authorization: 'Bearer my-token' });
  });

  it('トークンが空の場合は空オブジェクトを返す', () => {
    const headers = authHeaders('');
    expect(headers).toEqual({});
  });
});

// ============================================================
// APIレスポンス型検証のテスト
// ============================================================

describe('AppConfig型検証', () => {
  it('有効な設定オブジェクトを検証できる', () => {
    const config: AppConfig = {
      workspaceRoot: '/path/to/workspace',
      workspaceName: 'my-project',
      modes: ['codex', 'claude', 'shell'],
      allowCustomCommands: false,
      fileWriteEnabled: true,
      authEnabled: true,
      maxFileSize: 1048576,
      sessionLogsEnabled: true,
    };

    expect(config.workspaceRoot).toBe('/path/to/workspace');
    expect(config.modes).toContain('codex');
    expect(config.modes).toContain('claude');
    expect(config.modes).toContain('shell');
    expect(config.allowCustomCommands).toBe(false);
    expect(config.fileWriteEnabled).toBe(true);
  });
});

describe('FileListResponse型検証', () => {
  it('ディレクトリ一覧レスポンスを検証できる', () => {
    const response: FileListResponse = {
      path: 'src',
      items: [
        { name: 'index.ts', type: 'file' },
        { name: 'components', type: 'dir' },
      ],
    };

    expect(response.path).toBe('src');
    expect(response.items).toHaveLength(2);
    expect(response.items[0].type).toBe('file');
    expect(response.items[1].type).toBe('dir');
  });
});

describe('FileContentResponse型検証', () => {
  it('ファイル内容レスポンスを検証できる', () => {
    const response: FileContentResponse = {
      path: 'src/index.ts',
      content: 'console.log("hello");',
    };

    expect(response.path).toBe('src/index.ts');
    expect(response.content).toContain('console.log');
  });
});

// ============================================================
// ファイルサイズチェックのテスト
// ============================================================

/**
 * ファイルサイズが上限を超えているかチェック
 */
function isFileTooLarge(size: number, maxSize: number): boolean {
  return size > maxSize;
}

describe('isFileTooLarge', () => {
  const maxSize = 1048576; // 1MB

  it('上限以下のファイルはfalseを返す', () => {
    expect(isFileTooLarge(1000, maxSize)).toBe(false);
    expect(isFileTooLarge(maxSize, maxSize)).toBe(false);
  });

  it('上限を超えるファイルはtrueを返す', () => {
    expect(isFileTooLarge(maxSize + 1, maxSize)).toBe(true);
    expect(isFileTooLarge(2000000, maxSize)).toBe(true);
  });
});

// ============================================================
// WebSocket URLの生成テスト
// ============================================================

/**
 * WebSocket URLを生成
 */
function getWsUrl(
  protocol: string,
  host: string,
  token?: string
): string {
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${wsProtocol}://${host}/ws${tokenParam}`;
}

describe('getWsUrl', () => {
  it('HTTPの場合はwsプロトコルを使用する', () => {
    const url = getWsUrl('http:', 'localhost:4173');
    expect(url).toBe('ws://localhost:4173/ws');
  });

  it('HTTPSの場合はwssプロトコルを使用する', () => {
    const url = getWsUrl('https:', 'localhost:4173');
    expect(url).toBe('wss://localhost:4173/ws');
  });

  it('トークンがある場合はクエリパラメータに追加する', () => {
    const url = getWsUrl('http:', 'localhost:4173', 'my-token');
    expect(url).toBe('ws://localhost:4173/ws?token=my-token');
  });

  it('トークンをURLエンコードする', () => {
    const url = getWsUrl('http:', 'localhost:4173', 'token with spaces');
    expect(url).toBe('ws://localhost:4173/ws?token=token%20with%20spaces');
  });
});

// ============================================================
// エラーレスポンスの処理テスト
// ============================================================

interface ApiErrorResponse {
  error: string;
}

/**
 * APIエラーレスポンスからメッセージを取得
 */
function getErrorMessage(response: ApiErrorResponse): string {
  const errorMessages: Record<string, string> = {
    unauthorized: '認証が必要です',
    'not-found': 'ファイルが見つかりません',
    'file-too-large': 'ファイルサイズが大きすぎます',
    'invalid-path': 'パスが無効です',
    'file-write-disabled': 'ファイル書き込みが無効です',
    'session-logs-disabled': 'セッションログが無効です',
  };

  return errorMessages[response.error] || response.error || '不明なエラー';
}

describe('getErrorMessage', () => {
  it('既知のエラーコードをメッセージに変換する', () => {
    expect(getErrorMessage({ error: 'unauthorized' })).toBe('認証が必要です');
    expect(getErrorMessage({ error: 'not-found' })).toBe(
      'ファイルが見つかりません'
    );
    expect(getErrorMessage({ error: 'file-too-large' })).toBe(
      'ファイルサイズが大きすぎます'
    );
  });

  it('未知のエラーコードはそのまま返す', () => {
    expect(getErrorMessage({ error: 'unknown-error' })).toBe('unknown-error');
  });

  it('空のエラーは不明なエラーを返す', () => {
    expect(getErrorMessage({ error: '' })).toBe('不明なエラー');
  });
});
