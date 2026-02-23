/**
 * WebSocket通信サービス
 * サーバーとのリアルタイム通信を管理
 */

import type { ClientMessage, ServerMessage } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';
import { showToast } from '../components/toast.js';

// ==================================================
// 型定義
// ==================================================

interface WebSocketCallbacks {
  onStatusChange: (text: string, color: string) => void;
  onMessage: (payload: ServerMessage) => void;
  onDisconnect: () => void;
}

// コールバック関数の保持
let callbacks: WebSocketCallbacks | null = null;

// メッセージベース認証の待機用
let pendingAuthResolve: (() => void) | null = null;
let pendingAuthReject: ((err: Error) => void) | null = null;

// ==================================================
// WebSocket管理
// ==================================================

/**
 * WebSocket URLを取得
 * 認証はメッセージベースで行うため、クエリパラメータにトークンを含めない
 */
function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

/**
 * WebSocketを初期化
 */
export function initWebSocket(cbs: WebSocketCallbacks): void {
  callbacks = cbs;
}

/**
 * WebSocket接続を確立
 */
export function connectWebSocket(): Promise<void> {
  const ws = sessionStore.getWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  // 既存の接続があれば閉じる
  if (ws) {
    sessionStore.setManualDisconnect(true);
    ws.close();
  }

  return new Promise((resolve, reject) => {
    const newWs = new WebSocket(getWsUrl());
    sessionStore.setWebSocket(newWs);

    newWs.addEventListener('open', () => {
      const token = sessionStore.getToken();
      if (token) {
        // メッセージベース認証を送信
        pendingAuthResolve = () => {
          callbacks?.onStatusChange('接続済み', '#0b8f7a');
          const reconnect = sessionStore.getReconnectConfig();
          if (reconnect.attempts > 0) {
            showToast('接続しました', 'success');
          }
          sessionStore.resetReconnect();
          resolve();
        };
        pendingAuthReject = reject;
        newWs.send(JSON.stringify({ type: 'auth', token }));
      } else {
        // トークンなし：認証不要
        callbacks?.onStatusChange('接続済み', '#0b8f7a');
        const reconnect = sessionStore.getReconnectConfig();
        if (reconnect.attempts > 0) {
          showToast('接続しました', 'success');
        }
        sessionStore.resetReconnect();
        resolve();
      }
    });

    newWs.addEventListener('message', (event: MessageEvent) => {
      handleWsMessage(event);
    });

    newWs.addEventListener('close', () => {
      callbacks?.onStatusChange('未接続', '#d95a2b');

      // 全セッションを非アクティブに
      sessionStore.getSessions().forEach((session) => {
        session.active = false;
      });
      callbacks?.onDisconnect();

      // 意図しない切断の場合は再接続を試みる
      const reconnect = sessionStore.getReconnectConfig();
      if (!reconnect.manualDisconnect && reconnect.enabled) {
        if (reconnect.attempts === 0) {
          showToast('接続が切れました', 'error');
        }
        scheduleReconnect();
      }
    });

    newWs.addEventListener('error', () => {
      callbacks?.onStatusChange('エラー', '#d95a2b');
      reject(new Error('ws-error'));
    });
  });
}

/**
 * WebSocketメッセージを処理
 */
function handleWsMessage(event: MessageEvent): void {
  let payload: ServerMessage;
  try {
    payload = JSON.parse(event.data);
  } catch {
    return;
  }

  // 認証結果の処理
  if (payload.type === 'auth_result') {
    if (payload.ok) {
      if (pendingAuthResolve) {
        pendingAuthResolve();
        pendingAuthResolve = null;
        pendingAuthReject = null;
      }
    } else {
      showToast(payload.message || '認証に失敗しました', 'error');
      if (pendingAuthReject) {
        pendingAuthReject(new Error('auth-failed'));
        pendingAuthResolve = null;
        pendingAuthReject = null;
      }
    }
    return;
  }

  callbacks?.onMessage(payload);
}

/**
 * 再接続をスケジュール
 */
function scheduleReconnect(): void {
  const reconnect = sessionStore.getReconnectConfig();
  if (!reconnect.enabled || reconnect.manualDisconnect) {
    return;
  }

  if (reconnect.attempts >= reconnect.maxAttempts) {
    showToast('再接続の上限に達しました。手動で再接続してください。', 'error', 5000);
    return;
  }

  const delay = sessionStore.getReconnectDelay();
  sessionStore.incrementReconnectAttempts();

  showToast(`再接続中... (${reconnect.attempts + 1}/${reconnect.maxAttempts})`, 'warning', delay);
  callbacks?.onStatusChange(`再接続中 (${Math.round(delay / 1000)}秒後)`, '#f0b94b');

  const timer = setTimeout(() => {
    connectWebSocket().catch(() => {
      // エラーはcloseイベントで処理される
    });
  }, delay);

  sessionStore.setReconnectTimer(timer);
}

/**
 * メッセージを送信
 */
export function sendMessage(message: ClientMessage): boolean {
  const ws = sessionStore.getWebSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  ws.send(JSON.stringify(message));
  return true;
}

/**
 * リサイズ情報を送信（アクティブセッション）
 */
export function sendResize(): void {
  const activeSessionId = sessionStore.getActiveSessionId();
  if (!activeSessionId) return;

  const session = sessionStore.getSession(activeSessionId);
  if (!session) return;

  const message: ClientMessage = {
    type: 'resize',
    sessionId: activeSessionId,
    cols: session.term.cols,
    rows: session.term.rows,
  };
  sendMessage(message);
}
