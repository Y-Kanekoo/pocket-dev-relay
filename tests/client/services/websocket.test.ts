/**
 * websocket.ts のテスト
 * WebSocket通信サービスの接続管理・メッセージ処理ロジックをテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// モック設定（vi.hoisted を使用してホイスティング対応）
// ============================================================

const { mockSessionStore, mockShowToast } = vi.hoisted(() => ({
  mockSessionStore: {
    getWebSocket: vi.fn(),
    setWebSocket: vi.fn(),
    setManualDisconnect: vi.fn(),
    getToken: vi.fn().mockReturnValue(''),
    getReconnectConfig: vi.fn().mockReturnValue({
      enabled: true,
      attempts: 0,
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 30000,
      manualDisconnect: false,
      timer: null,
    }),
    resetReconnect: vi.fn(),
    getSessions: vi.fn().mockReturnValue(new Map()),
    getReconnectDelay: vi.fn().mockReturnValue(1000),
    incrementReconnectAttempts: vi.fn(),
    setReconnectTimer: vi.fn(),
    getActiveSessionId: vi.fn().mockReturnValue(null),
    getSession: vi.fn().mockReturnValue(null),
  },
  mockShowToast: vi.fn(),
}));

vi.mock('../../../src/client/state/sessionStore.js', () => ({
  sessionStore: mockSessionStore,
}));

vi.mock('../../../src/client/components/toast.js', () => ({
  showToast: mockShowToast,
}));

// WebSocket モッククラス
type WsEventHandler = (event?: Record<string, unknown>) => void;

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  private listeners = new Map<string, WsEventHandler[]>();

  send = vi.fn();
  close = vi.fn();

  addEventListener(event: string, handler: WsEventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  // テストヘルパー: イベントを発火
  triggerEvent(event: string, data?: Record<string, unknown>): void {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}

// グローバルWebSocketをモック
vi.stubGlobal('WebSocket', MockWebSocket);

// window.location をモック
vi.stubGlobal('window', {
  location: {
    protocol: 'http:',
    host: 'localhost:4173',
  },
});

// ============================================================
// テスト
// ============================================================

// テスト対象のインポート（モック設定の後に行う）
import { initWebSocket, sendMessage } from '../../../src/client/services/websocket.js';

describe('WebSocket通信サービス', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStore.getWebSocket.mockReturnValue(null);
    mockSessionStore.getToken.mockReturnValue('');
    mockSessionStore.getReconnectConfig.mockReturnValue({
      enabled: true,
      attempts: 0,
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 30000,
      manualDisconnect: false,
      timer: null,
    });
    mockSessionStore.getSessions.mockReturnValue(new Map());
    mockSessionStore.getActiveSessionId.mockReturnValue(null);
  });

  // ============================================================
  // initWebSocket のテスト
  // ============================================================

  describe('initWebSocket', () => {
    it('コールバックを設定できる', () => {
      const callbacks = {
        onStatusChange: vi.fn(),
        onMessage: vi.fn(),
        onDisconnect: vi.fn(),
      };
      // initWebSocket はコールバックを内部に保存するだけなので、エラーなしで呼べることを確認
      expect(() => initWebSocket(callbacks)).not.toThrow();
    });
  });

  // ============================================================
  // sendMessage のテスト
  // ============================================================

  describe('sendMessage', () => {
    it('WebSocket未接続の場合はfalseを返す', () => {
      mockSessionStore.getWebSocket.mockReturnValue(null);
      const result = sendMessage({ type: 'input', sessionId: 'test', data: 'hello' });
      expect(result).toBe(false);
    });

    it('WebSocketがOPEN状態でない場合はfalseを返す', () => {
      const ws = new MockWebSocket();
      ws.readyState = MockWebSocket.CLOSED;
      mockSessionStore.getWebSocket.mockReturnValue(ws);

      const result = sendMessage({ type: 'input', sessionId: 'test', data: 'hello' });
      expect(result).toBe(false);
    });

    it('WebSocketがOPEN状態の場合はメッセージを送信してtrueを返す', () => {
      const ws = new MockWebSocket();
      ws.readyState = MockWebSocket.OPEN;
      mockSessionStore.getWebSocket.mockReturnValue(ws);

      const message = { type: 'input' as const, sessionId: 'test', data: 'hello' };
      const result = sendMessage(message);

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('複数のメッセージタイプを送信できる', () => {
      const ws = new MockWebSocket();
      ws.readyState = MockWebSocket.OPEN;
      mockSessionStore.getWebSocket.mockReturnValue(ws);

      const startMessage = { type: 'start' as const, mode: 'shell' as const };
      sendMessage(startMessage);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(startMessage));

      const resizeMessage = {
        type: 'resize' as const,
        sessionId: 'test',
        cols: 80,
        rows: 24,
      };
      sendMessage(resizeMessage);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(resizeMessage));
    });
  });
});
