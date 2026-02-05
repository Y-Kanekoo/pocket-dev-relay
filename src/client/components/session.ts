/**
 * セッションタブUIコンポーネント
 * セッションの開始・停止とUI更新
 */

import type { SessionMode, ServerMessage, ClientMessage } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';
import { showToast } from './toast.js';
import { updateTabLabel, fitActiveSession } from './terminal.js';
import { connectWebSocket, sendMessage, sendResize } from '../services/websocket.js';

// ==================================================
// DOM要素の参照
// ==================================================

interface SessionElements {
  modeGrid: HTMLElement | null;
  cwdInput: HTMLInputElement | null;
  commandRow: HTMLElement | null;
  commandInput: HTMLInputElement | null;
  startBtn: HTMLButtonElement | null;
  stopBtn: HTMLButtonElement | null;
  clearBtn: HTMLButtonElement | null;
  sessionMeta: HTMLElement | null;
  wsDot: HTMLElement | null;
  statusText: HTMLElement | null;
  terminalPanel: HTMLElement | null;
  filesPanel: HTMLElement | null;
  tabs: HTMLElement | null;
}

let elements: SessionElements = {
  modeGrid: null,
  cwdInput: null,
  commandRow: null,
  commandInput: null,
  startBtn: null,
  stopBtn: null,
  clearBtn: null,
  sessionMeta: null,
  wsDot: null,
  statusText: null,
  terminalPanel: null,
  filesPanel: null,
  tabs: null,
};

// コールバック関数
let onClearTerminal: (() => void) | null = null;

// ==================================================
// ステータス表示
// ==================================================

/**
 * ステータス表示を更新
 */
export function setStatus(text: string, color: string): void {
  if (elements.statusText) {
    elements.statusText.textContent = text;
  }
  if (elements.wsDot) {
    elements.wsDot.style.background = color;
    elements.wsDot.style.boxShadow = `0 0 12px ${color}`;
  }
}

// ==================================================
// UI更新関数
// ==================================================

/**
 * セッションメタ情報を更新
 */
export function updateSessionMeta(): void {
  if (!elements.sessionMeta) return;

  const activeSessionId = sessionStore.getActiveSessionId();
  if (!activeSessionId) {
    elements.sessionMeta.textContent = 'セッション未開始';
    return;
  }

  const session = sessionStore.getSession(activeSessionId);
  if (!session) {
    elements.sessionMeta.textContent = 'セッション未開始';
    return;
  }

  if (session.active) {
    elements.sessionMeta.textContent = `${session.label} - ${session.cwd}`;
  } else {
    elements.sessionMeta.textContent = `${session.label} - 未開始`;
  }
}

/**
 * ボタン状態を更新
 */
export function updateButtons(): void {
  const session = sessionStore.getActiveSession();
  const sessionActive = session ? session.active : false;

  if (elements.startBtn) {
    elements.startBtn.disabled = sessionActive;
  }
  if (elements.stopBtn) {
    elements.stopBtn.disabled = !sessionActive;
  }
}

/**
 * モードUIを更新
 */
export function updateModeUI(): void {
  const mode = sessionStore.getMode();
  const buttons = elements.modeGrid?.querySelectorAll<HTMLButtonElement>('[data-mode]');
  buttons?.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
  if (elements.commandRow) {
    elements.commandRow.style.display = mode === 'custom' ? 'grid' : 'none';
  }
}

// ==================================================
// セッション操作
// ==================================================

/**
 * セッションを開始
 */
export async function startSession(): Promise<void> {
  const activeSessionId = sessionStore.getActiveSessionId();
  if (!activeSessionId) {
    showToast('セッションを選択してください', 'warning');
    return;
  }

  const session = sessionStore.getSession(activeSessionId);
  if (!session) return;

  if (session.active) {
    showToast('このセッションは既に開始しています', 'warning');
    return;
  }

  try {
    await connectWebSocket();
    const message: ClientMessage = {
      type: 'start',
      sessionId: activeSessionId,
      mode: sessionStore.getMode(),
      cwd: elements.cwdInput?.value.trim() || '.',
      command: elements.commandInput?.value.trim()
    };
    sendMessage(message);
  } catch {
    session.term.writeln('\r\n[エラー] サーバーに接続できません');
  }
}

/**
 * セッションを停止
 */
export function stopSession(): void {
  const activeSessionId = sessionStore.getActiveSessionId();
  if (!activeSessionId) return;

  const session = sessionStore.getSession(activeSessionId);
  if (!session || !session.active) return;

  const message: ClientMessage = {
    type: 'stop',
    sessionId: activeSessionId
  };
  sendMessage(message);
}

// ==================================================
// WebSocketメッセージ処理
// ==================================================

/**
 * サーバーからのメッセージを処理
 */
export function handleServerMessage(payload: ServerMessage): void {
  // sessionIdが含まれている場合は該当セッションに振り分け
  const sessionId = 'sessionId' in payload ? payload.sessionId : undefined;

  if (payload.type === 'data') {
    // セッションIDがある場合は該当セッションに出力
    if (sessionId) {
      const session = sessionStore.getSession(sessionId);
      if (session) {
        session.term.write(payload.data);
      }
    } else {
      // 後方互換性: sessionIdがない場合はアクティブセッションに出力
      const activeSession = sessionStore.getActiveSession();
      if (activeSession) {
        activeSession.term.write(payload.data);
      }
    }
    return;
  }

  if (payload.type === 'started') {
    // セッション開始通知
    const targetSessionId = sessionId || sessionStore.getActiveSessionId();
    if (targetSessionId) {
      const session = sessionStore.getSession(targetSessionId);
      if (session) {
        session.active = true;
        session.label = payload.label || payload.mode || `セッション ${session.num}`;
        session.cwd = payload.cwd || '.';
        updateTabLabel(targetSessionId, session.label);
        if (targetSessionId === sessionStore.getActiveSessionId()) {
          updateSessionMeta();
          updateButtons();
          sendResize();
        }
      }
    }
    return;
  }

  if (payload.type === 'exit' || payload.type === 'stopped') {
    // セッション終了通知
    const targetSessionId = sessionId || sessionStore.getActiveSessionId();
    if (targetSessionId) {
      const session = sessionStore.getSession(targetSessionId);
      if (session) {
        session.active = false;
        if (targetSessionId === sessionStore.getActiveSessionId()) {
          updateSessionMeta();
          updateButtons();
        }
      }
    }
    return;
  }

  if (payload.type === 'error') {
    // エラー通知
    const activeSession = sessionStore.getActiveSession();
    if (activeSession) {
      activeSession.term.writeln(`\r\n[エラー] ${payload.message}`);
    }
  }
}

// ==================================================
// 初期化
// ==================================================

/**
 * セッションUIを初期化
 */
export function initSessionUI(
  elems: SessionElements,
  callbacks: {
    onClearTerminal: () => void;
  }
): void {
  elements = elems;
  onClearTerminal = callbacks.onClearTerminal;

  // モード選択イベント
  elements.modeGrid?.addEventListener('click', (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (!button || button.disabled) return;
    const mode = button.dataset.mode as SessionMode | undefined;
    if (mode) {
      sessionStore.setMode(mode);
      updateModeUI();
    }
  });

  // セッション操作ボタン
  elements.startBtn?.addEventListener('click', startSession);
  elements.stopBtn?.addEventListener('click', stopSession);
  elements.clearBtn?.addEventListener('click', () => {
    onClearTerminal?.();
  });

  // タブ切り替え（ターミナル/ファイル）
  elements.tabs?.addEventListener('click', (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (!button) return;
    const tab = button.dataset.tab;
    elements.tabs?.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tab);
    });
    if (tab === 'terminal') {
      elements.terminalPanel?.classList.add('active');
      elements.filesPanel?.classList.remove('active');
    } else {
      elements.filesPanel?.classList.add('active');
      elements.terminalPanel?.classList.remove('active');
    }
    // アクティブセッションをフィット
    fitActiveSession();
  });

  // 初期状態
  setStatus('未接続', '#d95a2b');
  updateButtons();
}
