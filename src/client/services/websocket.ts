/**
 * WebSocket通信サービス
 * サーバーとのリアルタイム通信を管理
 * FSM（有限状態マシン）パターンで接続状態を管理
 */

import type { ClientMessage, ServerMessage } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';
import { showToast } from '../components/toast.js';

// ==================================================
// 接続状態FSM定義
// ==================================================

/**
 * WebSocket接続状態の列挙型
 * 状態遷移:
 *   DISCONNECTED -> CONNECTING（初回接続）
 *   CONNECTING -> CONNECTED（接続成功）
 *   CONNECTING -> DISCONNECTED（接続失敗、リトライ上限）
 *   CONNECTED -> RECONNECTING（接続切断）
 *   RECONNECTING -> CONNECTING（リトライ）
 *   RECONNECTING -> DISCONNECTED（リトライ上限）
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

// ==================================================
// 型定義
// ==================================================

interface WebSocketCallbacks {
  onStatusChange: (text: string, color: string) => void;
  onMessage: (payload: ServerMessage) => void;
  onDisconnect: () => void;
}

// ==================================================
// 接続品質インジケータの色定義
// ==================================================

/** 状態ごとのインジケータ色 */
const STATE_COLORS: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: '#077363',
  [ConnectionState.CONNECTING]: '#f0b94b',
  [ConnectionState.RECONNECTING]: '#f0b94b',
  [ConnectionState.DISCONNECTED]: '#b5461e',
};

/** 状態ごとのインジケータCSSクラス */
const STATE_CSS_CLASSES: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: 'connected',
  [ConnectionState.CONNECTING]: 'connecting',
  [ConnectionState.RECONNECTING]: 'reconnecting',
  [ConnectionState.DISCONNECTED]: 'disconnected',
};

// ==================================================
// 入力バッファリング定数
// ==================================================

/** 保留メッセージの最大数 */
const MAX_PENDING_MESSAGES = 100;

// ==================================================
// モジュール内部状態
// ==================================================

// コールバック関数の保持
let callbacks: WebSocketCallbacks | null = null;

// メッセージベース認証の待機用
let pendingAuthResolve: (() => void) | null = null;
let pendingAuthReject: ((err: Error) => void) | null = null;

// FSM: 現在の接続状態
let connectionState: ConnectionState = ConnectionState.DISCONNECTED;

// 入力バッファリング: 切断中に蓄積するメッセージキュー
let pendingMessages: ClientMessage[] = [];

// ==================================================
// FSM状態管理
// ==================================================

/**
 * 許可された状態遷移の定義
 */
const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  [ConnectionState.DISCONNECTED]: [ConnectionState.CONNECTING],
  [ConnectionState.CONNECTING]: [ConnectionState.CONNECTED, ConnectionState.DISCONNECTED],
  [ConnectionState.CONNECTED]: [ConnectionState.RECONNECTING, ConnectionState.DISCONNECTED],
  [ConnectionState.RECONNECTING]: [ConnectionState.CONNECTING, ConnectionState.DISCONNECTED],
};

/**
 * 接続状態を遷移させる
 * 不正な遷移の場合はfalseを返す
 */
function transition(nextState: ConnectionState): boolean {
  const allowed = VALID_TRANSITIONS[connectionState];
  if (!allowed.includes(nextState)) {
    return false;
  }
  connectionState = nextState;
  updateConnectionIndicator(nextState);
  return true;
}

/**
 * 現在の接続状態を取得
 */
export function getConnectionState(): ConnectionState {
  return connectionState;
}

// ==================================================
// 接続品質インジケータ
// ==================================================

/**
 * 接続品質インジケータのDOM表示を更新
 */
function updateConnectionIndicator(state: ConnectionState): void {
  const indicator = document.getElementById('connection-indicator');
  if (!indicator) return;

  // 全状態クラスを削除して現在の状態クラスを追加
  for (const cls of Object.values(STATE_CSS_CLASSES)) {
    indicator.classList.remove(cls);
  }
  indicator.classList.add(STATE_CSS_CLASSES[state]);

  // ドットの色を更新
  const dot = indicator.querySelector('.connection-dot') as HTMLElement | null;
  if (dot) {
    dot.style.background = STATE_COLORS[state];
  }

  // ラベルテキストを更新
  const label = indicator.querySelector('.connection-label') as HTMLElement | null;
  if (label) {
    switch (state) {
      case ConnectionState.CONNECTED:
        label.textContent = '接続中';
        break;
      case ConnectionState.CONNECTING:
        label.textContent = '接続試行中';
        break;
      case ConnectionState.RECONNECTING:
        label.textContent = '再接続待機中';
        break;
      case ConnectionState.DISCONNECTED:
        label.textContent = '切断';
        break;
    }
  }
}

// ==================================================
// 入力バッファリング
// ==================================================

/**
 * 保留メッセージキューの件数を取得
 */
export function getPendingMessageCount(): number {
  return pendingMessages.length;
}

/**
 * 保留メッセージキューをクリア
 */
export function clearPendingMessages(): void {
  pendingMessages = [];
}

/**
 * 保留メッセージキューをフラッシュ（再接続成功時に呼び出し）
 */
function flushPendingMessages(): void {
  if (pendingMessages.length === 0) return;

  const ws = sessionStore.getWebSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const messages = [...pendingMessages];
  pendingMessages = [];

  for (const msg of messages) {
    ws.send(JSON.stringify(msg));
  }

  if (messages.length > 0) {
    showToast(`${messages.length}件の保留メッセージを送信しました`, 'info');
  }
}

/**
 * メッセージをバッファに追加
 * @returns バッファに追加できた場合はtrue
 */
function enqueueMessage(message: ClientMessage): boolean {
  // バッファリング対象: input, resizeのみ（start/stop/authはバッファリングしない）
  if (message.type !== 'input' && message.type !== 'resize') {
    return false;
  }

  if (pendingMessages.length >= MAX_PENDING_MESSAGES) {
    // 最も古いメッセージを削除して新しいメッセージを追加
    pendingMessages.shift();
  }
  pendingMessages.push(message);
  return true;
}

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
 * 接続成功時の共通処理
 */
function onConnectionEstablished(resolve: () => void): void {
  transition(ConnectionState.CONNECTED);
  callbacks?.onStatusChange('接続済み', '#077363');
  const reconnect = sessionStore.getReconnectConfig();
  if (reconnect.attempts > 0) {
    showToast('接続しました', 'success');
  }
  sessionStore.resetReconnect();

  // 保留メッセージをフラッシュ
  flushPendingMessages();

  resolve();
}

/**
 * WebSocket接続を確立
 */
export function connectWebSocket(): Promise<void> {
  const ws = sessionStore.getWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  // CONNECTING状態への遷移を試みる（RECONNECTING -> CONNECTINGも許可）
  if (connectionState === ConnectionState.RECONNECTING) {
    transition(ConnectionState.CONNECTING);
  } else if (connectionState === ConnectionState.DISCONNECTED) {
    transition(ConnectionState.CONNECTING);
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
          onConnectionEstablished(resolve);
        };
        pendingAuthReject = reject;
        newWs.send(JSON.stringify({ type: 'auth', token }));
      } else {
        // トークンなし：認証不要
        onConnectionEstablished(resolve);
      }
    });

    newWs.addEventListener('message', (event: MessageEvent) => {
      handleWsMessage(event);
    });

    newWs.addEventListener('close', () => {
      // 接続中だった場合はRECONNECTINGに遷移、それ以外はDISCONNECTEDに遷移
      if (connectionState === ConnectionState.CONNECTED) {
        transition(ConnectionState.RECONNECTING);
      } else if (
        connectionState === ConnectionState.CONNECTING ||
        connectionState === ConnectionState.RECONNECTING
      ) {
        // CONNECTING中の切断 → 再接続判定に進むためRECONNECTINGに遷移を試みる
        // ただしリトライ上限の場合はDISCONNECTEDになる（scheduleReconnect内で処理）
        // ここでは一旦RECONNECTINGにならずDISCONNECTED扱いで既存ロジックに委ねる
      }

      callbacks?.onStatusChange('未接続', '#b5461e');

      // 認証待ち中の切断はPromiseをrejectする
      // Race Condition対策: ローカル変数にコピーしてからnullクリアし、その後呼び出す
      if (pendingAuthReject) {
        const rejectFn = pendingAuthReject;
        pendingAuthResolve = null;
        pendingAuthReject = null;
        rejectFn(new Error('connection-closed-during-auth'));
      }

      // 全セッションを非アクティブに
      sessionStore.getSessions().forEach((session) => {
        session.active = false;
      });
      callbacks?.onDisconnect();

      // 意図しない切断の場合は再接続を試みる
      const reconnect = sessionStore.getReconnectConfig();
      if (!reconnect.manualDisconnect && reconnect.enabled) {
        // CONNECTED -> close の場合はまだ RECONNECTING にする
        if (connectionState === ConnectionState.CONNECTED) {
          transition(ConnectionState.RECONNECTING);
        }
        if (reconnect.attempts === 0) {
          showToast('接続が切れました', 'error');
        }
        scheduleReconnect();
      } else {
        // 手動切断またはリトライ無効時はDISCONNECTEDに遷移
        transition(ConnectionState.DISCONNECTED);
      }
    });

    newWs.addEventListener('error', () => {
      callbacks?.onStatusChange('エラー', '#b5461e');
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
  // Race Condition対策: ローカル変数にコピーしてからnullクリアし、その後呼び出す
  if (payload.type === 'auth_result') {
    if (payload.ok) {
      if (pendingAuthResolve) {
        const resolve = pendingAuthResolve;
        pendingAuthResolve = null;
        pendingAuthReject = null;
        resolve();
      }
    } else {
      showToast(payload.message || '認証に失敗しました', 'error');
      if (pendingAuthReject) {
        const rejectFn = pendingAuthReject;
        pendingAuthResolve = null;
        pendingAuthReject = null;
        rejectFn(new Error('auth-failed'));
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
    transition(ConnectionState.DISCONNECTED);
    return;
  }

  if (reconnect.attempts >= reconnect.maxAttempts) {
    showToast('再接続の上限に達しました。手動で再接続してください。', 'error', 5000);
    transition(ConnectionState.DISCONNECTED);
    return;
  }

  // RECONNECTING状態に遷移（まだRECONNECTINGでなければ）
  if (connectionState !== ConnectionState.RECONNECTING) {
    transition(ConnectionState.RECONNECTING);
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
 * WebSocket未接続時はバッファリング対象メッセージならキューに追加
 */
export function sendMessage(message: ClientMessage): boolean {
  const ws = sessionStore.getWebSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // 切断中/再接続中の場合はバッファリングを試みる
    if (
      connectionState === ConnectionState.RECONNECTING ||
      connectionState === ConnectionState.CONNECTING
    ) {
      return enqueueMessage(message);
    }
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
