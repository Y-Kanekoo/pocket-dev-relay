/**
 * ターミナル管理コンポーネント
 * xterm.js インスタンスの作成と管理
 */

import type { ClientMessage } from '../../types/index.js';
import {
  sessionStore,
  MAX_SESSIONS,
  type ClientSessionInfo,
  type TerminalOptions,
  type TerminalInstance,
  type FitAddonInstance,
} from '../state/sessionStore.js';
import { showToast } from './toast.js';
import { sendMessage, sendResize } from '../services/websocket.js';

// ==================================================
// xterm.js のグローバル変数宣言（CDNから読み込み）
// ==================================================

// xterm.js はCDNから読み込まれるため、グローバル変数として宣言
declare const Terminal: {
  new (options?: TerminalOptions): TerminalInstance;
};

// FitAddon のグローバル変数
declare const FitAddon: {
  FitAddon: {
    new (): FitAddonInstance;
  };
};

// ==================================================
// DOM要素の参照
// ==================================================

let terminalContainer: HTMLElement | null = null;
let sessionTabList: HTMLElement | null = null;
let sessionAddBtn: HTMLButtonElement | null = null;

// コールバック関数
let onSessionChange: (() => void) | null = null;

/** リサイズデバウンス用タイマー */
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

// ==================================================
// セッション管理
// ==================================================

/**
 * ユニークなセッションIDを生成
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 新しいセッションを作成
 */
export function createSession(): ClientSessionInfo | null {
  if (sessionStore.getSessionCount() >= MAX_SESSIONS) {
    showToast(`最大${MAX_SESSIONS}セッションまでです`, 'warning');
    return null;
  }

  const sessionId = generateSessionId();
  const sessionNum = sessionStore.getNextSessionNum();
  const currentFontSize = sessionStore.getCurrentFontSize();

  // ターミナル用のDOM要素を作成
  const terminalElement = document.createElement('div');
  terminalElement.className = 'terminal-shell';
  terminalElement.id = `terminal-${sessionId}`;
  terminalContainer?.appendChild(terminalElement);

  // xtermインスタンスを作成
  const term = new Terminal({
    cursorBlink: true,
    fontSize: currentFontSize,
    fontFamily: '"JetBrains Mono", "Menlo", monospace',
    theme: {
      background: '#14110d',
      foreground: '#f5efe6',
      cursor: '#f0b94b',
      selection: 'rgba(240, 185, 75, 0.3)',
    },
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalElement);
  fitAddon.fit();

  // 入力をWebSocketに送信（セッションIDを含める）
  term.onData((data: string) => {
    const message: ClientMessage = {
      type: 'input',
      sessionId: sessionId,
      data,
    };
    sendMessage(message);
  });

  // タブ要素を作成
  const tabElement = document.createElement('div');
  tabElement.className = 'session-tab';
  tabElement.dataset.sessionId = sessionId;
  tabElement.innerHTML = `
    <span class="session-tab-label">セッション ${sessionNum}</span>
    <button class="session-tab-close" title="セッションを閉じる">\u00d7</button>
  `;

  // タブクリックでセッション切り替え
  tabElement.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('session-tab-close')) {
      switchSession(sessionId);
    }
  });

  // 閉じるボタン
  const closeBtn = tabElement.querySelector('.session-tab-close');
  closeBtn?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    closeSession(sessionId);
  });

  sessionTabList?.appendChild(tabElement);

  // セッション情報を保存
  const session: ClientSessionInfo = {
    id: sessionId,
    num: sessionNum,
    term,
    fitAddon,
    element: terminalElement,
    tabElement,
    active: false,
    label: `セッション ${sessionNum}`,
    cwd: '.',
  };

  sessionStore.addSession(session);

  // セッション追加ボタンの有効/無効を更新
  updateAddButtonState();

  return session;
}

/**
 * セッションを切り替え
 */
export function switchSession(sessionId: string): void {
  const session = sessionStore.getSession(sessionId);
  if (!session) return;

  // 以前のアクティブセッションを非アクティブに
  const prevSessionId = sessionStore.getActiveSessionId();
  if (prevSessionId) {
    const prevSession = sessionStore.getSession(prevSessionId);
    if (prevSession) {
      prevSession.element.classList.remove('active');
      prevSession.tabElement.classList.remove('active');
    }
  }

  // 新しいセッションをアクティブに
  session.element.classList.add('active');
  session.tabElement.classList.add('active');
  sessionStore.setActiveSessionId(sessionId);

  // フィットとリサイズ
  session.fitAddon.fit();
  sendResize();

  // コールバックを呼び出し
  onSessionChange?.();
}

/**
 * セッションを閉じる
 */
export function closeSession(sessionId: string): void {
  const session = sessionStore.getSession(sessionId);
  if (!session) return;

  // サーバー側のセッションを停止
  if (session.active && sessionStore.isConnected()) {
    const message: ClientMessage = {
      type: 'stop',
      sessionId: sessionId,
    };
    sendMessage(message);
  }

  // DOM要素を削除
  session.element.remove();
  session.tabElement.remove();

  // ターミナルを破棄
  session.term.dispose();

  // セッションを削除
  sessionStore.deleteSession(sessionId);

  // アクティブセッションが閉じられた場合、別のセッションに切り替え
  if (sessionStore.getActiveSessionId() === sessionId) {
    sessionStore.setActiveSessionId(null);
    const remainingSessions = Array.from(sessionStore.getSessions().keys());
    if (remainingSessions.length > 0) {
      switchSession(remainingSessions[remainingSessions.length - 1]);
    } else {
      onSessionChange?.();
    }
  }

  // セッション追加ボタンの有効/無効を更新
  updateAddButtonState();
}

/**
 * セッション追加ボタンの状態を更新
 */
export function updateAddButtonState(): void {
  if (sessionAddBtn) {
    sessionAddBtn.disabled = sessionStore.getSessionCount() >= MAX_SESSIONS;
  }
}

/**
 * タブのラベルを更新
 */
export function updateTabLabel(sessionId: string, label: string): void {
  const session = sessionStore.getSession(sessionId);
  if (!session) return;

  session.label = label;
  const labelElement = session.tabElement.querySelector('.session-tab-label');
  if (labelElement) {
    labelElement.textContent = label;
    (labelElement as HTMLElement).title = label;
  }
}

/**
 * アクティブセッションをフィットしてリサイズを送信
 */
export function fitActiveSession(): void {
  const session = sessionStore.getActiveSession();
  if (session) {
    session.fitAddon.fit();
    sendResize();
  }
}

/** デバウンス付きリサイズハンドラ（100ms） */
function handleResize(): void {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = setTimeout(() => {
    fitActiveSession();
    resizeTimer = null;
  }, 100);
}

/**
 * アクティブセッションのターミナルをクリア
 */
export function clearActiveTerminal(): void {
  const session = sessionStore.getActiveSession();
  if (session) {
    session.term.clear();
  }
}

// ==================================================
// 初期化
// ==================================================

/**
 * ターミナル管理を初期化
 */
export function initTerminal(
  elements: {
    terminalContainer: HTMLElement | null;
    sessionTabList: HTMLElement | null;
    sessionAddBtn: HTMLButtonElement | null;
  },
  callbacks: {
    onSessionChange: () => void;
  },
): void {
  terminalContainer = elements.terminalContainer;
  sessionTabList = elements.sessionTabList;
  sessionAddBtn = elements.sessionAddBtn;
  onSessionChange = callbacks.onSessionChange;

  // セッション追加ボタンのイベントリスナー
  sessionAddBtn?.addEventListener('click', () => {
    const session = createSession();
    if (session) {
      switchSession(session.id);
    }
  });

  // ウィンドウリサイズ時の処理（デバウンス付き）
  window.addEventListener('resize', handleResize);
}

/**
 * 初期セッションを作成
 */
export function initSessions(): void {
  const session = createSession();
  if (session) {
    switchSession(session.id);
  }
}
