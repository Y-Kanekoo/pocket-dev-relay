/**
 * errorHandler.ts のテスト
 * エラーハンドリングユーティリティの純粋関数をテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getErrorMessage,
  translateError,
  extractErrorMessage,
  handleApiError,
  handleFetchError,
  handleNetworkError,
} from '../../../src/client/services/errorHandler.js';

// ============================================================
// getErrorMessage のテスト
// ============================================================

describe('getErrorMessage', () => {
  it('認証関連のエラーコードを日本語に変換する', () => {
    expect(getErrorMessage('AUTHENTICATION_FAILED')).toBe(
      '認証に失敗しました。トークンを確認してください。',
    );
    expect(getErrorMessage('unauthorized')).toBe(
      '認証に失敗しました。トークンを確認してください。',
    );
  });

  it('ファイル関連のエラーコードを日本語に変換する', () => {
    expect(getErrorMessage('NOT_FOUND')).toBe('リソースが見つかりません。');
    expect(getErrorMessage('NOT_A_FILE')).toBe('ファイルではありません。');
    expect(getErrorMessage('NOT_A_DIRECTORY')).toBe('ディレクトリではありません。');
    expect(getErrorMessage('FILE_TOO_LARGE')).toBe('ファイルサイズが上限を超えています。');
    expect(getErrorMessage('file-too-large')).toBe('ファイルサイズが上限を超えています。');
    expect(getErrorMessage('INVALID_PATH')).toBe(
      'パスが無効です。ワークスペース外にはアクセスできません。',
    );
  });

  it('機能関連のエラーコードを日本語に変換する', () => {
    expect(getErrorMessage('FEATURE_DISABLED')).toBe('この機能は無効化されています。');
    expect(getErrorMessage('file-write-disabled')).toBe(
      'ファイル書き込みは無効化されています。',
    );
    expect(getErrorMessage('write-disabled')).toBe('ファイル書き込みが無効になっています。');
    expect(getErrorMessage('session-logs-disabled')).toBe(
      'セッションログは無効化されています。',
    );
    expect(getErrorMessage('custom-commands-disabled')).toBe(
      'カスタムコマンドは無効になっています。管理者に連絡してください。',
    );
  });

  it('バリデーション関連のエラーコードを日本語に変換する', () => {
    expect(getErrorMessage('VALIDATION_ERROR')).toBe('入力値が不正です。');
    expect(getErrorMessage('invalid-content')).toBe('コンテンツが不正です。');
    expect(getErrorMessage('missing-text')).toBe('テキストが指定されていません。');
    expect(getErrorMessage('invalid-filename')).toBe('ファイル名が不正です。');
  });

  it('セッション関連のエラーコードを日本語に変換する', () => {
    expect(getErrorMessage('session-already-running')).toContain('セッションは既に実行中です');
    expect(getErrorMessage('failed-to-start')).toContain('セッションの開始に失敗しました');
    expect(getErrorMessage('session-timeout')).toBe('セッションがタイムアウトしました。');
    expect(getErrorMessage('unknown-mode')).toBe('不明なモードです。');
    expect(getErrorMessage('missing-command')).toBe('コマンドが指定されていません。');
  });

  it('SSH関連のエラーコードを日本語に変換する', () => {
    expect(getErrorMessage('ssh-disabled')).toContain('SSH機能は無効になっています');
    expect(getErrorMessage('ssh-host-required')).toBe('ホスト名を入力してください。');
    expect(getErrorMessage('ssh-username-required')).toBe('ユーザー名を入力してください。');
    expect(getErrorMessage('ssh-password-required')).toBe('パスワードを入力してください。');
    expect(getErrorMessage('ssh-config-required')).toBe('SSH接続設定が不足しています。');
  });

  it('一般エラーコードを日本語に変換する', () => {
    expect(getErrorMessage('INTERNAL_SERVER_ERROR')).toBe('サーバーエラーが発生しました。');
    expect(getErrorMessage('server-error')).toBe('サーバーエラーが発生しました。');
    expect(getErrorMessage('failed-to-generate')).toBe('QRコードの生成に失敗しました。');
    expect(getErrorMessage('failed-to-list')).toBe('ファイル一覧の取得に失敗しました。');
    expect(getErrorMessage('failed-to-read')).toBe('ファイルの読み込みに失敗しました。');
    expect(getErrorMessage('failed-to-write')).toBe('ファイルの書き込みに失敗しました。');
  });

  it('未知のエラーコードはフォールバックメッセージを返す', () => {
    expect(getErrorMessage('unknown-code')).toBe('エラーが発生しました: unknown-code');
    expect(getErrorMessage('xyz')).toBe('エラーが発生しました: xyz');
  });
});

// ============================================================
// translateError のテスト
// ============================================================

describe('translateError', () => {
  it('既知のエラーコードを日本語メッセージに変換する', () => {
    expect(translateError('unauthorized')).toBe(
      '認証に失敗しました。トークンを確認してください。',
    );
    expect(translateError('NOT_FOUND')).toBe('リソースが見つかりません。');
  });

  it('未知のエラーコードはそのまま返す', () => {
    expect(translateError('some-unknown-code')).toBe('some-unknown-code');
    expect(translateError('custom-error')).toBe('custom-error');
  });
});

// ============================================================
// extractErrorMessage のテスト
// ============================================================

describe('extractErrorMessage', () => {
  it('message フィールドがある場合はそれを返す', () => {
    const response = { error: 'some-error', message: 'カスタムメッセージ' };
    expect(extractErrorMessage(response)).toBe('カスタムメッセージ');
  });

  it('message がなく error がある場合はエラーコードから変換する', () => {
    const response = { error: 'unauthorized', message: '' };
    expect(extractErrorMessage(response)).toBe(
      '認証に失敗しました。トークンを確認してください。',
    );
  });

  it('message も error も空の場合はデフォルトメッセージを返す', () => {
    const response = { error: '', message: '' };
    expect(extractErrorMessage(response)).toBe('予期しないエラーが発生しました');
  });
});

// ============================================================
// handleApiError のテスト
// ============================================================

describe('handleApiError', () => {
  let showToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showToast = vi.fn();
  });

  it('ApiErrorResponse型のエラーを処理する', () => {
    const error = { error: 'unauthorized', message: '認証に失敗しました' };
    handleApiError(error, showToast);
    expect(showToast).toHaveBeenCalledWith('認証に失敗しました', 'error');
  });

  it('Errorインスタンスを処理する', () => {
    const error = new Error('テストエラー');
    handleApiError(error, showToast);
    expect(showToast).toHaveBeenCalledWith('テストエラー', 'error');
  });

  it('Errorインスタンスのmessageが空の場合はデフォルトメッセージを使用する', () => {
    const error = new Error('');
    handleApiError(error, showToast);
    expect(showToast).toHaveBeenCalledWith('予期しないエラーが発生しました', 'error');
  });

  it('カスタムデフォルトメッセージを使用できる', () => {
    const error = new Error('');
    handleApiError(error, showToast, 'カスタムメッセージ');
    expect(showToast).toHaveBeenCalledWith('カスタムメッセージ', 'error');
  });

  it('その他の型のエラーはデフォルトメッセージを表示する', () => {
    handleApiError('文字列エラー', showToast);
    expect(showToast).toHaveBeenCalledWith('予期しないエラーが発生しました', 'error');
  });

  it('nullの場合はデフォルトメッセージを表示する', () => {
    handleApiError(null, showToast);
    expect(showToast).toHaveBeenCalledWith('予期しないエラーが発生しました', 'error');
  });

  it('undefinedの場合はデフォルトメッセージを表示する', () => {
    handleApiError(undefined, showToast);
    expect(showToast).toHaveBeenCalledWith('予期しないエラーが発生しました', 'error');
  });

  it('数値の場合はデフォルトメッセージを表示する', () => {
    handleApiError(42, showToast);
    expect(showToast).toHaveBeenCalledWith('予期しないエラーが発生しました', 'error');
  });
});

// ============================================================
// handleFetchError のテスト
// ============================================================

describe('handleFetchError', () => {
  let showToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showToast = vi.fn();
  });

  it('レスポンスがokの場合はfalseを返す', async () => {
    const response = { ok: true } as Response;
    const result = await handleFetchError(response, showToast);
    expect(result).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('JSONパース可能なエラーレスポンスを処理する', async () => {
    const errorData = { error: 'unauthorized', message: '認証エラー' };
    const response = {
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue(errorData),
    } as unknown as Response;

    const result = await handleFetchError(response, showToast);
    expect(result).toBe(true);
    expect(showToast).toHaveBeenCalledWith('認証エラー', 'error');
  });

  it('JSONパース失敗時はステータスコードに応じたメッセージを表示する', async () => {
    const response = {
      ok: false,
      status: 400,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    } as unknown as Response;

    const result = await handleFetchError(response, showToast);
    expect(result).toBe(true);
    expect(showToast).toHaveBeenCalledWith('不正なリクエストです', 'error');
  });

  it('401のステータスコードに対応する', async () => {
    const response = {
      ok: false,
      status: 401,
      json: vi.fn().mockRejectedValue(new Error()),
    } as unknown as Response;

    await handleFetchError(response, showToast);
    expect(showToast).toHaveBeenCalledWith('認証が必要です', 'error');
  });

  it('403のステータスコードに対応する', async () => {
    const response = {
      ok: false,
      status: 403,
      json: vi.fn().mockRejectedValue(new Error()),
    } as unknown as Response;

    await handleFetchError(response, showToast);
    expect(showToast).toHaveBeenCalledWith('アクセスが拒否されました', 'error');
  });

  it('404のステータスコードに対応する', async () => {
    const response = {
      ok: false,
      status: 404,
      json: vi.fn().mockRejectedValue(new Error()),
    } as unknown as Response;

    await handleFetchError(response, showToast);
    expect(showToast).toHaveBeenCalledWith('リソースが見つかりません', 'error');
  });

  it('413のステータスコードに対応する', async () => {
    const response = {
      ok: false,
      status: 413,
      json: vi.fn().mockRejectedValue(new Error()),
    } as unknown as Response;

    await handleFetchError(response, showToast);
    expect(showToast).toHaveBeenCalledWith('ファイルサイズが大きすぎます', 'error');
  });

  it('500のステータスコードに対応する', async () => {
    const response = {
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error()),
    } as unknown as Response;

    await handleFetchError(response, showToast);
    expect(showToast).toHaveBeenCalledWith('サーバーエラーが発生しました', 'error');
  });

  it('未知のステータスコードはコードを含むメッセージを表示する', async () => {
    const response = {
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new Error()),
    } as unknown as Response;

    await handleFetchError(response, showToast);
    expect(showToast).toHaveBeenCalledWith('エラーが発生しました (503)', 'error');
  });
});

// ============================================================
// handleNetworkError のテスト
// ============================================================

describe('handleNetworkError', () => {
  let showToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showToast = vi.fn();
  });

  it('fetchを含むTypeErrorはネットワークエラーとして処理する', () => {
    const error = new TypeError('Failed to fetch');
    handleNetworkError(error, showToast);
    expect(showToast).toHaveBeenCalledWith(
      'ネットワークエラー: サーバーに接続できません',
      'error',
    );
  });

  it('fetch以外のTypeErrorはhandleApiErrorにフォールバックする', () => {
    const error = new TypeError('Cannot read properties');
    handleNetworkError(error, showToast);
    expect(showToast).toHaveBeenCalledWith('Cannot read properties', 'error');
  });

  it('一般的なErrorはhandleApiErrorにフォールバックする', () => {
    const error = new Error('一般エラー');
    handleNetworkError(error, showToast);
    expect(showToast).toHaveBeenCalledWith('一般エラー', 'error');
  });

  it('ApiErrorResponseオブジェクトはhandleApiErrorにフォールバックする', () => {
    const error = { error: 'NOT_FOUND', message: 'リソースが見つかりません' };
    handleNetworkError(error, showToast);
    expect(showToast).toHaveBeenCalledWith('リソースが見つかりません', 'error');
  });
});
