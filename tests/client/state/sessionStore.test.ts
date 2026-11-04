/**
 * sessionStore のテスト
 * ブラウザ環境（localStorage, WebSocket）をモックしてテストする
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// ブラウザAPI モック
// ============================================================

// localStorage のモック
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    /** テスト用: 内部ストアに直接値をセット */
    _setStore(data: Record<string, string>) {
      store = { ...data };
    },
  };
})();

// WebSocket 定数のモック
const WebSocketMock = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

// グローバルにブラウザAPIを注入
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'WebSocket', { value: WebSocketMock, writable: true });

// ============================================================
// テスト本体
// ============================================================

// sessionStore はシングルトンなので、テストごとに再インポートする
async function importFreshStore() {
  // モジュールキャッシュをリセットして新しいインスタンスを取得
  vi.resetModules();
  const mod = await import('../../../src/client/state/sessionStore.js');
  return mod;
}

// ClientSessionInfo のモックファクトリ
function createMockSession(
  overrides: Partial<{
    id: string;
    num: number;
    active: boolean;
    label: string;
    cwd: string;
  }> = {},
) {
  const id = overrides.id ?? 'session-1';
  return {
    id,
    num: overrides.num ?? 1,
    term: {
      cols: 80,
      rows: 24,
      options: { fontSize: 13 },
      buffer: {
        active: {
          length: 0,
          getLine: () => undefined,
        },
      },
      loadAddon: vi.fn(),
      open: vi.fn(),
      write: vi.fn(),
      writeln: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn(),
    },
    fitAddon: { fit: vi.fn() },
    element: {} as HTMLElement,
    tabElement: {} as HTMLElement,
    active: overrides.active ?? false,
    label: overrides.label ?? `Session ${id}`,
    cwd: overrides.cwd ?? '/workspace',
  };
}

describe('SessionStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ==================================================
  // 定数のエクスポート
  // ==================================================

  describe('定数のエクスポート', () => {
    it('MAX_SESSIONS が 5 である', async () => {
      const { MAX_SESSIONS } = await importFreshStore();
      expect(MAX_SESSIONS).toBe(5);
    });

    it('フォントサイズ定数が正しい値を持つ', async () => {
      const { FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_DEFAULT } = await importFreshStore();
      expect(FONT_SIZE_MIN).toBe(10);
      expect(FONT_SIZE_MAX).toBe(24);
      expect(FONT_SIZE_DEFAULT).toBe(13);
    });

    it('ストレージキーが定義されている', async () => {
      const { FONT_SIZE_KEY, THEME_STORAGE_KEY, TOKEN_STORAGE_KEY } = await importFreshStore();
      expect(FONT_SIZE_KEY).toBe('pdr_terminal_font_size');
      expect(THEME_STORAGE_KEY).toBe('pdr_theme');
      expect(TOKEN_STORAGE_KEY).toBe('pdr_token');
    });
  });

  // ==================================================
  // 初期状態
  // ==================================================

  describe('初期状態', () => {
    it('初期モードが codex である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getMode()).toBe('codex');
    });

    it('WebSocket が初期状態で null である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getWebSocket()).toBeNull();
    });

    it('設定が初期状態で null である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getConfig()).toBeNull();
    });

    it('トークンが初期状態で空文字である（localStorage に値がない場合）', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getToken()).toBe('');
    });

    it('localStorage にトークンがある場合、初期状態でそのトークンを持つ', async () => {
      localStorageMock._setStore({ pdr_token: 'stored-token' });
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getToken()).toBe('stored-token');
    });

    it('セッション数が初期状態で 0 である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getSessionCount()).toBe(0);
    });

    it('アクティブセッションIDが初期状態で null である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getActiveSessionId()).toBeNull();
    });

    it('アクティブセッションが初期状態で undefined である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getActiveSession()).toBeUndefined();
    });

    it('フォントサイズが初期状態でデフォルト値（13）である', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getCurrentFontSize()).toBe(13);
    });

    it('localStorage に保存されたフォントサイズを読み込む', async () => {
      localStorageMock._setStore({ pdr_terminal_font_size: '18' });
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getCurrentFontSize()).toBe(18);
    });

    it('localStorage のフォントサイズが範囲外の場合はデフォルト値を使う', async () => {
      localStorageMock._setStore({ pdr_terminal_font_size: '99' });
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getCurrentFontSize()).toBe(13);
    });

    it('localStorage のフォントサイズが数値でない場合はデフォルト値を使う', async () => {
      localStorageMock._setStore({ pdr_terminal_font_size: 'abc' });
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getCurrentFontSize()).toBe(13);
    });
  });

  // ==================================================
  // フォントサイズ関連
  // ==================================================

  describe('フォントサイズ管理', () => {
    it('フォントサイズを設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setFontSize(20);
      expect(sessionStore.getCurrentFontSize()).toBe(20);
    });

    it('フォントサイズ設定時に localStorage に保存される', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setFontSize(16);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pdr_terminal_font_size', '16');
    });
  });

  // ==================================================
  // モード関連
  // ==================================================

  describe('モード管理', () => {
    it('モードを設定・取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setMode('shell');
      expect(sessionStore.getMode()).toBe('shell');
    });

    it('すべてのモードに切り替えできる', async () => {
      const { sessionStore } = await importFreshStore();
      const modes = ['codex', 'claude', 'shell', 'custom', 'ssh'] as const;
      for (const mode of modes) {
        sessionStore.setMode(mode);
        expect(sessionStore.getMode()).toBe(mode);
      }
    });
  });

  // ==================================================
  // WebSocket 関連
  // ==================================================

  describe('WebSocket 管理', () => {
    it('WebSocket を設定・取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      const mockWs = { readyState: WebSocketMock.OPEN } as unknown as WebSocket;
      sessionStore.setWebSocket(mockWs);
      expect(sessionStore.getWebSocket()).toBe(mockWs);
    });

    it('WebSocket を null に設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      const mockWs = { readyState: WebSocketMock.OPEN } as unknown as WebSocket;
      sessionStore.setWebSocket(mockWs);
      sessionStore.setWebSocket(null);
      expect(sessionStore.getWebSocket()).toBeNull();
    });

    it('WebSocket が OPEN 状態の場合、isConnected が true を返す', async () => {
      const { sessionStore } = await importFreshStore();
      const mockWs = { readyState: WebSocketMock.OPEN } as unknown as WebSocket;
      sessionStore.setWebSocket(mockWs);
      expect(sessionStore.isConnected()).toBe(true);
    });

    it('WebSocket が CLOSED 状態の場合、isConnected が false を返す', async () => {
      const { sessionStore } = await importFreshStore();
      const mockWs = { readyState: WebSocketMock.CLOSED } as unknown as WebSocket;
      sessionStore.setWebSocket(mockWs);
      expect(sessionStore.isConnected()).toBe(false);
    });

    it('WebSocket が CONNECTING 状態の場合、isConnected が false を返す', async () => {
      const { sessionStore } = await importFreshStore();
      const mockWs = { readyState: WebSocketMock.CONNECTING } as unknown as WebSocket;
      sessionStore.setWebSocket(mockWs);
      expect(sessionStore.isConnected()).toBe(false);
    });

    it('WebSocket が null の場合、isConnected が false を返す', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.isConnected()).toBe(false);
    });
  });

  // ==================================================
  // 設定関連
  // ==================================================

  describe('設定管理', () => {
    it('設定を設定・取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      const config = {
        workspaceRoot: '/workspace/project',
        workspaceName: 'project',
        modes: ['codex', 'shell'] as Array<'codex' | 'shell'>,
        allowCustomCommands: false,
        fileWriteEnabled: true,
        authEnabled: true,
        maxFileSize: 1048576,
        sessionLogsEnabled: true,
        sshEnabled: false,
      };
      sessionStore.setConfig(config);
      expect(sessionStore.getConfig()).toEqual(config);
    });
  });

  // ==================================================
  // 認証関連
  // ==================================================

  describe('認証管理', () => {
    it('トークンを設定・取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setToken('new-token');
      expect(sessionStore.getToken()).toBe('new-token');
    });

    it('トークン設定時に localStorage に保存される', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setToken('my-secret-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pdr_token', 'my-secret-token');
    });

    it('空のトークンも設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setToken('some-token');
      sessionStore.setToken('');
      expect(sessionStore.getToken()).toBe('');
    });
  });

  // ==================================================
  // セッション管理
  // ==================================================

  describe('セッション管理', () => {
    it('セッションを追加できる', async () => {
      const { sessionStore } = await importFreshStore();
      const session = createMockSession({ id: 'sess-1', num: 1 });
      sessionStore.addSession(session);
      expect(sessionStore.getSessionCount()).toBe(1);
      expect(sessionStore.getSession('sess-1')).toBe(session);
    });

    it('複数のセッションを追加できる', async () => {
      const { sessionStore } = await importFreshStore();
      const session1 = createMockSession({ id: 'sess-1', num: 1 });
      const session2 = createMockSession({ id: 'sess-2', num: 2 });
      const session3 = createMockSession({ id: 'sess-3', num: 3 });
      sessionStore.addSession(session1);
      sessionStore.addSession(session2);
      sessionStore.addSession(session3);
      expect(sessionStore.getSessionCount()).toBe(3);
    });

    it('存在しないセッションIDで取得すると undefined を返す', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getSession('nonexistent')).toBeUndefined();
    });

    it('セッションを削除できる', async () => {
      const { sessionStore } = await importFreshStore();
      const session = createMockSession({ id: 'sess-1' });
      sessionStore.addSession(session);
      expect(sessionStore.getSessionCount()).toBe(1);
      sessionStore.deleteSession('sess-1');
      expect(sessionStore.getSessionCount()).toBe(0);
      expect(sessionStore.getSession('sess-1')).toBeUndefined();
    });

    it('存在しないセッションを削除してもエラーにならない', async () => {
      const { sessionStore } = await importFreshStore();
      expect(() => sessionStore.deleteSession('nonexistent')).not.toThrow();
    });

    it('全セッション Map を取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      const session1 = createMockSession({ id: 'sess-1' });
      const session2 = createMockSession({ id: 'sess-2' });
      sessionStore.addSession(session1);
      sessionStore.addSession(session2);
      const sessions = sessionStore.getSessions();
      expect(sessions).toBeInstanceOf(Map);
      expect(sessions.size).toBe(2);
      expect(sessions.get('sess-1')).toBe(session1);
      expect(sessions.get('sess-2')).toBe(session2);
    });

    it('同じIDのセッションを追加すると上書きされる', async () => {
      const { sessionStore } = await importFreshStore();
      const session1 = createMockSession({ id: 'sess-1', label: 'First' });
      const session2 = createMockSession({ id: 'sess-1', label: 'Second' });
      sessionStore.addSession(session1);
      sessionStore.addSession(session2);
      expect(sessionStore.getSessionCount()).toBe(1);
      expect(sessionStore.getSession('sess-1')?.label).toBe('Second');
    });
  });

  // ==================================================
  // アクティブセッション管理
  // ==================================================

  describe('アクティブセッション管理', () => {
    it('アクティブセッションIDを設定・取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setActiveSessionId('sess-1');
      expect(sessionStore.getActiveSessionId()).toBe('sess-1');
    });

    it('アクティブセッションIDを null に設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setActiveSessionId('sess-1');
      sessionStore.setActiveSessionId(null);
      expect(sessionStore.getActiveSessionId()).toBeNull();
    });

    it('アクティブセッションを取得できる', async () => {
      const { sessionStore } = await importFreshStore();
      const session = createMockSession({ id: 'sess-1' });
      sessionStore.addSession(session);
      sessionStore.setActiveSessionId('sess-1');
      expect(sessionStore.getActiveSession()).toBe(session);
    });

    it('アクティブセッションIDが null の場合、getActiveSession は undefined を返す', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getActiveSession()).toBeUndefined();
    });

    it('アクティブセッションIDが存在しないセッションを指す場合、undefined を返す', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setActiveSessionId('nonexistent');
      expect(sessionStore.getActiveSession()).toBeUndefined();
    });
  });

  // ==================================================
  // セッション番号管理
  // ==================================================

  describe('セッション番号管理', () => {
    it('初回の getNextSessionNum が 1 を返す', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getNextSessionNum()).toBe(1);
    });

    it('呼び出すたびにインクリメントされる', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getNextSessionNum()).toBe(1);
      expect(sessionStore.getNextSessionNum()).toBe(2);
      expect(sessionStore.getNextSessionNum()).toBe(3);
    });
  });

  // ==================================================
  // 再接続管理
  // ==================================================

  describe('再接続管理', () => {
    it('再接続設定の初期値が正しい', async () => {
      const { sessionStore } = await importFreshStore();
      const config = sessionStore.getReconnectConfig();
      expect(config.enabled).toBe(true);
      expect(config.attempts).toBe(0);
      expect(config.maxAttempts).toBe(10);
      expect(config.baseDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
      expect(config.timer).toBeNull();
      expect(config.manualDisconnect).toBe(false);
    });

    it('再接続試行回数をインクリメントできる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.incrementReconnectAttempts();
      expect(sessionStore.getReconnectConfig().attempts).toBe(1);
      sessionStore.incrementReconnectAttempts();
      expect(sessionStore.getReconnectConfig().attempts).toBe(2);
    });

    it('再接続タイマーを設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      const timer = setTimeout(() => {}, 1000);
      sessionStore.setReconnectTimer(timer);
      expect(sessionStore.getReconnectConfig().timer).toBe(timer);
      clearTimeout(timer);
    });

    it('再接続タイマーを null に設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      const timer = setTimeout(() => {}, 1000);
      sessionStore.setReconnectTimer(timer);
      sessionStore.setReconnectTimer(null);
      expect(sessionStore.getReconnectConfig().timer).toBeNull();
      clearTimeout(timer);
    });

    it('手動切断フラグを設定できる', async () => {
      const { sessionStore } = await importFreshStore();
      sessionStore.setManualDisconnect(true);
      expect(sessionStore.getReconnectConfig().manualDisconnect).toBe(true);
      sessionStore.setManualDisconnect(false);
      expect(sessionStore.getReconnectConfig().manualDisconnect).toBe(false);
    });

    it('再接続状態をリセットできる', async () => {
      const { sessionStore } = await importFreshStore();
      // 状態を変更
      sessionStore.incrementReconnectAttempts();
      sessionStore.incrementReconnectAttempts();
      sessionStore.setManualDisconnect(true);
      const timer = setTimeout(() => {}, 1000);
      sessionStore.setReconnectTimer(timer);

      // リセット
      sessionStore.resetReconnect();

      const config = sessionStore.getReconnectConfig();
      expect(config.attempts).toBe(0);
      expect(config.timer).toBeNull();
      expect(config.manualDisconnect).toBe(false);
    });

    it('resetReconnect でタイマーが clearTimeout される', async () => {
      const { sessionStore } = await importFreshStore();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const timer = setTimeout(() => {}, 10000);
      sessionStore.setReconnectTimer(timer);

      sessionStore.resetReconnect();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
      clearTimeoutSpy.mockRestore();
    });

    it('タイマーが null の状態で resetReconnect しても clearTimeout は呼ばれない', async () => {
      const { sessionStore } = await importFreshStore();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      sessionStore.resetReconnect();

      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  // ==================================================
  // 再接続遅延時間の計算
  // ==================================================

  describe('再接続遅延時間の計算', () => {
    it('初回（attempts=0）は baseDelay（1000ms）を返す', async () => {
      const { sessionStore } = await importFreshStore();
      expect(sessionStore.getReconnectDelay()).toBe(1000);
    });

    it('指数バックオフで遅延が増加する', async () => {
      const { sessionStore } = await importFreshStore();

      // attempts=0: 1000 * 2^0 = 1000
      expect(sessionStore.getReconnectDelay()).toBe(1000);

      sessionStore.incrementReconnectAttempts(); // attempts=1
      // 1000 * 2^1 = 2000
      expect(sessionStore.getReconnectDelay()).toBe(2000);

      sessionStore.incrementReconnectAttempts(); // attempts=2
      // 1000 * 2^2 = 4000
      expect(sessionStore.getReconnectDelay()).toBe(4000);

      sessionStore.incrementReconnectAttempts(); // attempts=3
      // 1000 * 2^3 = 8000
      expect(sessionStore.getReconnectDelay()).toBe(8000);
    });

    it('maxDelay（30000ms）を超えない', async () => {
      const { sessionStore } = await importFreshStore();

      // attempts を十分に増やす
      for (let i = 0; i < 20; i++) {
        sessionStore.incrementReconnectAttempts();
      }

      expect(sessionStore.getReconnectDelay()).toBe(30000);
    });

    it('リセット後は初回の遅延に戻る', async () => {
      const { sessionStore } = await importFreshStore();

      // いくつかインクリメント
      sessionStore.incrementReconnectAttempts();
      sessionStore.incrementReconnectAttempts();
      sessionStore.incrementReconnectAttempts();
      expect(sessionStore.getReconnectDelay()).toBe(8000);

      // リセット
      sessionStore.resetReconnect();
      expect(sessionStore.getReconnectDelay()).toBe(1000);
    });
  });
});
