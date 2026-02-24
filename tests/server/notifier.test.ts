/**
 * 通知サービスのテスト
 * エラーパターン検知・通知送信・クールダウン・プロセス終了通知
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// session.ts のモック（send関数を含む）
vi.mock('../../src/services/session.js', () => ({
  send: vi.fn(),
  sessions: new Map(),
}));

describe('detectError', () => {
  let detectError: (data: string) => string | null;

  beforeEach(async () => {
    vi.resetModules();
    // session.jsを再度モック
    vi.doMock('../../src/services/session.js', () => ({
      send: vi.fn(),
      sessions: new Map(),
    }));
    const mod = await import('../../src/services/notifier.js');
    detectError = mod.detectError;
  });

  // ============================================================
  // エラーパターンの検知
  // ============================================================

  describe('エラーパターンの検知', () => {
    it('"Error:" を含む行が検知されること', () => {
      const result = detectError('TypeError: Cannot read property');
      expect(result).toBeTruthy();
      expect(result).toContain('TypeError');
    });

    it('"error[E" を含む行が検知されること（Rustコンパイラ形式）', () => {
      const result = detectError('error[E0308]: mismatched types');
      expect(result).toBeTruthy();
      expect(result).toContain('error[E0308]');
    });

    it('"FAILED" を含む行が検知されること', () => {
      const result = detectError('Test suite FAILED');
      expect(result).toBeTruthy();
      expect(result).toContain('FAILED');
    });

    it('"exception" を含む行が検知されること', () => {
      const result = detectError('Unhandled exception at line 42');
      expect(result).toBeTruthy();
    });

    it('"ENOENT" を含む行が検知されること', () => {
      const result = detectError('ENOENT: no such file or directory');
      expect(result).toBeTruthy();
    });

    it('"permission denied" を含む行が検知されること', () => {
      const result = detectError('bash: permission denied');
      expect(result).toBeTruthy();
    });

    it('"segmentation fault" を含む行が検知されること', () => {
      const result = detectError('Segmentation fault (core dumped)');
      expect(result).toBeTruthy();
    });

    it('複数行の場合、最初にマッチした行を返すこと', () => {
      const data = 'line 1\nline 2 Error: something\nline 3 FAILED';
      const result = detectError(data);
      expect(result).toContain('Error');
    });
  });

  // ============================================================
  // 誤検知の抑制
  // ============================================================

  describe('誤検知の抑制', () => {
    it('"error_count" は除外パターンに含まれないため検知されること', () => {
      // error_count は error[._-]?code の除外パターンには該当しない
      // (countとcodeは異なる)
      // 注: 将来的にerror_countも除外パターンに追加すべきかもしれない
      const result = detectError('error_count: 0');
      expect(result).not.toBeNull();
    });

    it('"No errors" は検知しないこと', () => {
      const result = detectError('No errors found');
      expect(result).toBeNull();
    });

    it('"0 errors" は検知しないこと', () => {
      const result = detectError('Compiled with 0 errors');
      expect(result).toBeNull();
    });

    it('"errorHandler" は検知しないこと', () => {
      const result = detectError('import { errorHandler } from "./middleware"');
      expect(result).toBeNull();
    });

    it('"error_message" は検知しないこと', () => {
      const result = detectError('const error_message = "test"');
      expect(result).toBeNull();
    });

    it('"error_code" は検知しないこと', () => {
      const result = detectError('error_code: 200');
      expect(result).toBeNull();
    });

    it('"onError" は検知しないこと', () => {
      const result = detectError('ws.onError(handleError)');
      expect(result).toBeNull();
    });

    it('"if (error)" は検知しないこと', () => {
      const result = detectError('if (error) { handle(); }');
      expect(result).toBeNull();
    });

    it('"catch (error)" は検知しないこと', () => {
      const result = detectError('} catch (error) {');
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // エッジケース
  // ============================================================

  describe('エッジケース', () => {
    it('空文字列はnullを返すこと', () => {
      const result = detectError('');
      expect(result).toBeNull();
    });

    it('通常のテキストはnullを返すこと', () => {
      const result = detectError('Hello, World!');
      expect(result).toBeNull();
    });

    it('ANSIエスケープシーケンスを含むエラーを検知できること', () => {
      // ANSIの赤色エスケープ付き
      const result = detectError('\x1B[31mError: something went wrong\x1B[0m');
      expect(result).toBeTruthy();
      // ANSIコードは除去された文字列が返される
      expect(result).not.toContain('\x1B');
    });

    it('200文字を超えるエラー行は切り詰められること', () => {
      const longError = 'Error: ' + 'a'.repeat(300);
      const result = detectError(longError);
      expect(result).toBeTruthy();
      expect(result!.length).toBeLessThanOrEqual(203); // 200文字 + "..."
      expect(result).toContain('...');
    });
  });
});

// ============================================================
// sendErrorNotification のテスト
// ============================================================

describe('sendErrorNotification', () => {
  let sendErrorNotification: (ws: unknown, sessionId: string, errorLine: string) => void;
  let clearNotificationState: (sessionId: string) => void;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockSend = vi.fn();
    vi.doMock('../../src/services/session.js', () => ({
      send: mockSend,
      sessions: new Map(),
    }));
    const mod = await import('../../src/services/notifier.js');
    sendErrorNotification = mod.sendErrorNotification;
    clearNotificationState = mod.clearNotificationState;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('エラー通知が正しいフォーマットで送信されること', () => {
    const mockWs = {};
    sendErrorNotification(mockWs, 'session-1', 'Error: テスト失敗');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const notification = mockSend.mock.calls[0][1];
    expect(notification).toEqual({
      type: 'notification',
      title: 'エラーを検知しました',
      body: 'Error: テスト失敗',
      level: 'error',
      sessionId: 'session-1',
    });
  });

  it('クールダウン期間中は重複通知が抑制されること', () => {
    const mockWs = {};

    // 1回目: 送信される
    sendErrorNotification(mockWs, 'session-dup', 'Error: 1回目');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // 2回目: クールダウン中なので送信されない
    sendErrorNotification(mockWs, 'session-dup', 'Error: 2回目');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('異なるセッションIDではクールダウンが独立していること', () => {
    const mockWs = {};

    sendErrorNotification(mockWs, 'session-A', 'Error: A');
    sendErrorNotification(mockWs, 'session-B', 'Error: B');

    // 異なるセッションなのでそれぞれ送信される
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('クールダウン期間経過後は再度通知が送信されること', () => {
    const mockWs = {};
    vi.useFakeTimers();

    try {
      // 1回目の送信
      sendErrorNotification(mockWs, 'session-cd', 'Error: 1回目');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // 5秒（クールダウン期間）経過させる
      vi.advanceTimersByTime(5000);

      // クールダウン解除後に再送信可能
      sendErrorNotification(mockWs, 'session-cd', 'Error: 2回目');
      expect(mockSend).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearNotificationStateでクールダウン状態がリセットされること', () => {
    const mockWs = {};

    // 1回目: 送信される
    sendErrorNotification(mockWs, 'session-clear', 'Error: 1回目');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // クールダウン中に状態をクリア
    clearNotificationState('session-clear');

    // クリア後は即座に再送信可能
    sendErrorNotification(mockWs, 'session-clear', 'Error: 2回目');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('WebSocketオブジェクトが正しくsendに渡されること', () => {
    const mockWs = { id: 'test-ws' };
    sendErrorNotification(mockWs, 'session-ws', 'Error: test');

    expect(mockSend).toHaveBeenCalledWith(mockWs, expect.objectContaining({
      type: 'notification',
      level: 'error',
    }));
  });
});

// ============================================================
// sendExitNotification のテスト
// ============================================================

describe('sendExitNotification', () => {
  let sendExitNotification: (
    ws: unknown,
    sessionId: string,
    exitCode: number,
    signal: number | undefined,
    label: string,
  ) => void;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockSend = vi.fn();
    vi.doMock('../../src/services/session.js', () => ({
      send: mockSend,
      sessions: new Map(),
    }));
    const mod = await import('../../src/services/notifier.js');
    sendExitNotification = mod.sendExitNotification;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常終了（exitCode=0）の場合はsuccessレベルの通知が送信されること', () => {
    const mockWs = {};
    sendExitNotification(mockWs, 'session-1', 0, undefined, 'Shell');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const notification = mockSend.mock.calls[0][1];
    expect(notification).toEqual({
      type: 'notification',
      title: 'Shell が正常終了しました',
      body: '終了コード: 0',
      level: 'success',
      sessionId: 'session-1',
    });
  });

  it('異常終了（exitCode!=0）の場合はwarningレベルの通知が送信されること', () => {
    const mockWs = {};
    sendExitNotification(mockWs, 'session-2', 1, undefined, 'npm run build');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const notification = mockSend.mock.calls[0][1];
    expect(notification).toEqual({
      type: 'notification',
      title: 'npm run build が異常終了しました',
      body: '終了コード: 1',
      level: 'warning',
      sessionId: 'session-2',
    });
  });

  it('シグナルがある場合はbodyに含まれること', () => {
    const mockWs = {};
    sendExitNotification(mockWs, 'session-3', 137, 9, 'テストプロセス');

    const notification = mockSend.mock.calls[0][1];
    expect(notification.body).toBe('終了コード: 137 (シグナル: 9)');
    expect(notification.level).toBe('warning');
  });

  it('シグナルがundefinedの場合はbodyに含まれないこと', () => {
    const mockWs = {};
    sendExitNotification(mockWs, 'session-4', 2, undefined, 'プロセス');

    const notification = mockSend.mock.calls[0][1];
    expect(notification.body).toBe('終了コード: 2');
    expect(notification.body).not.toContain('シグナル');
  });

  it('ラベルがタイトルに正しく反映されること', () => {
    const mockWs = {};

    sendExitNotification(mockWs, 's1', 0, undefined, 'SSH: user@host');
    expect(mockSend.mock.calls[0][1].title).toBe('SSH: user@host が正常終了しました');

    sendExitNotification(mockWs, 's2', 1, undefined, 'Claude Code');
    expect(mockSend.mock.calls[1][1].title).toBe('Claude Code が異常終了しました');
  });
});

// ============================================================
// clearNotificationState のテスト
// ============================================================

describe('clearNotificationState', () => {
  let sendErrorNotification: (ws: unknown, sessionId: string, errorLine: string) => void;
  let clearNotificationState: (sessionId: string) => void;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockSend = vi.fn();
    vi.doMock('../../src/services/session.js', () => ({
      send: mockSend,
      sessions: new Map(),
    }));
    const mod = await import('../../src/services/notifier.js');
    sendErrorNotification = mod.sendErrorNotification;
    clearNotificationState = mod.clearNotificationState;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('存在しないセッションIDでもエラーにならないこと', () => {
    expect(() => clearNotificationState('non-existent')).not.toThrow();
  });

  it('クリア後に同じセッションで即座に通知が送信できること', () => {
    const mockWs = {};

    // 通知送信 → クールダウン状態になる
    sendErrorNotification(mockWs, 'session-x', 'Error: first');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // クールダウン中なので送信されない
    sendErrorNotification(mockWs, 'session-x', 'Error: blocked');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // 状態クリア
    clearNotificationState('session-x');

    // クリア後は即座に送信可能
    sendErrorNotification(mockWs, 'session-x', 'Error: after clear');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('他のセッションのクールダウンに影響しないこと', () => {
    const mockWs = {};

    // 両方のセッションで通知送信
    sendErrorNotification(mockWs, 'session-p', 'Error: p');
    sendErrorNotification(mockWs, 'session-q', 'Error: q');
    expect(mockSend).toHaveBeenCalledTimes(2);

    // session-pだけクリア
    clearNotificationState('session-p');

    // session-pは再送信可能
    sendErrorNotification(mockWs, 'session-p', 'Error: p again');
    expect(mockSend).toHaveBeenCalledTimes(3);

    // session-qはまだクールダウン中
    sendErrorNotification(mockWs, 'session-q', 'Error: q again');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});
