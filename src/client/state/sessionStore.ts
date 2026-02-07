/**
 * セッション状態管理
 * 複数セッションの状態を一元管理するストア
 */

import type { SessionMode, AppConfig, ReconnectConfig } from '../../types/index.js';

// ==================================================
// xterm.js のグローバル変数宣言（CDNから読み込み）
// ==================================================

// xterm.js はCDNから読み込まれるため、グローバル変数として宣言
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const Terminal: {
  new (options?: TerminalOptions): TerminalInstance;
};

// ターミナルオプションの型
export interface TerminalOptions {
  cursorBlink?: boolean;
  fontSize?: number;
  fontFamily?: string;
  theme?: {
    background?: string;
    foreground?: string;
    cursor?: string;
    selection?: string;
  };
}

// ターミナルバッファ行の型
export interface BufferLine {
  translateToString(trimRight?: boolean): string;
}

// ターミナルバッファの型
export interface TerminalBuffer {
  readonly length: number;
  getLine(y: number): BufferLine | undefined;
}

// ターミナルバッファマネージャの型
export interface TerminalBufferNamespace {
  readonly active: TerminalBuffer;
}

// Terminal インスタンスの型
export interface TerminalInstance {
  cols: number;
  rows: number;
  options: {
    fontSize: number;
  };
  buffer: TerminalBufferNamespace;
  loadAddon(addon: FitAddonInstance): void;
  open(container: HTMLElement): void;
  write(data: string): void;
  writeln(data: string): void;
  clear(): void;
  dispose(): void;
  onData(callback: (data: string) => void): void;
}

// FitAddon のグローバル変数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const FitAddon: {
  FitAddon: {
    new (): FitAddonInstance;
  };
};

// FitAddon インスタンスの型
export interface FitAddonInstance {
  fit(): void;
}

// ==================================================
// クライアント側のセッション情報型
// ==================================================

export interface ClientSessionInfo {
  id: string;
  num: number;
  term: TerminalInstance;
  fitAddon: FitAddonInstance;
  element: HTMLElement;
  tabElement: HTMLElement;
  active: boolean;
  label: string;
  cwd: string;
}

// ==================================================
// 定数定義
// ==================================================

// 最大セッション数
export const MAX_SESSIONS = 5;

// フォントサイズ設定
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 13;
export const FONT_SIZE_KEY = 'pdr_terminal_font_size';

// テーマ設定
export const THEME_STORAGE_KEY = 'pdr_theme';

// トークン保存キー
export const TOKEN_STORAGE_KEY = 'pdr_token';

// ==================================================
// 状態管理の型
// ==================================================

interface AppState {
  mode: SessionMode;
  ws: WebSocket | null;
  config: AppConfig | null;
  token: string;
  sessions: Map<string, ClientSessionInfo>;
  activeSessionId: string | null;
  nextSessionNum: number;
  reconnect: ReconnectConfig & { timer: ReturnType<typeof setTimeout> | null };
  currentFontSize: number;
}

// ==================================================
// シングルトン状態ストア
// ==================================================

/**
 * アプリケーション状態を管理するストア
 */
class SessionStore {
  private state: AppState;

  constructor() {
    this.state = {
      mode: 'codex',
      ws: null,
      config: null,
      token: localStorage.getItem(TOKEN_STORAGE_KEY) || '',
      sessions: new Map<string, ClientSessionInfo>(),
      activeSessionId: null,
      nextSessionNum: 1,
      reconnect: {
        enabled: true,
        attempts: 0,
        maxAttempts: 10,
        baseDelay: 1000,
        maxDelay: 30000,
        timer: null,
        manualDisconnect: false,
      },
      currentFontSize: this.getStoredFontSize(),
    };
  }

  // ==================================================
  // フォントサイズ関連
  // ==================================================

  /**
   * LocalStorageからフォントサイズを取得
   */
  private getStoredFontSize(): number {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    if (stored) {
      const size = parseInt(stored, 10);
      if (!isNaN(size) && size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX) {
        return size;
      }
    }
    return FONT_SIZE_DEFAULT;
  }

  /**
   * 現在のフォントサイズを取得
   */
  getCurrentFontSize(): number {
    return this.state.currentFontSize;
  }

  /**
   * フォントサイズを設定
   */
  setFontSize(size: number): void {
    this.state.currentFontSize = size;
    localStorage.setItem(FONT_SIZE_KEY, String(size));
  }

  // ==================================================
  // モード関連
  // ==================================================

  /**
   * 現在のモードを取得
   */
  getMode(): SessionMode {
    return this.state.mode;
  }

  /**
   * モードを設定
   */
  setMode(mode: SessionMode): void {
    this.state.mode = mode;
  }

  // ==================================================
  // WebSocket関連
  // ==================================================

  /**
   * WebSocket接続を取得
   */
  getWebSocket(): WebSocket | null {
    return this.state.ws;
  }

  /**
   * WebSocket接続を設定
   */
  setWebSocket(ws: WebSocket | null): void {
    this.state.ws = ws;
  }

  /**
   * WebSocketが接続中かどうか
   */
  isConnected(): boolean {
    return this.state.ws !== null && this.state.ws.readyState === WebSocket.OPEN;
  }

  // ==================================================
  // 設定関連
  // ==================================================

  /**
   * アプリケーション設定を取得
   */
  getConfig(): AppConfig | null {
    return this.state.config;
  }

  /**
   * アプリケーション設定を設定
   */
  setConfig(config: AppConfig): void {
    this.state.config = config;
  }

  // ==================================================
  // 認証関連
  // ==================================================

  /**
   * トークンを取得
   */
  getToken(): string {
    return this.state.token;
  }

  /**
   * トークンを設定
   */
  setToken(token: string): void {
    this.state.token = token;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  // ==================================================
  // セッション関連
  // ==================================================

  /**
   * 全セッションを取得
   */
  getSessions(): Map<string, ClientSessionInfo> {
    return this.state.sessions;
  }

  /**
   * セッションを取得
   */
  getSession(sessionId: string): ClientSessionInfo | undefined {
    return this.state.sessions.get(sessionId);
  }

  /**
   * セッションを追加
   */
  addSession(session: ClientSessionInfo): void {
    this.state.sessions.set(session.id, session);
  }

  /**
   * セッションを削除
   */
  deleteSession(sessionId: string): void {
    this.state.sessions.delete(sessionId);
  }

  /**
   * セッション数を取得
   */
  getSessionCount(): number {
    return this.state.sessions.size;
  }

  /**
   * アクティブセッションIDを取得
   */
  getActiveSessionId(): string | null {
    return this.state.activeSessionId;
  }

  /**
   * アクティブセッションを取得
   */
  getActiveSession(): ClientSessionInfo | undefined {
    if (!this.state.activeSessionId) return undefined;
    return this.state.sessions.get(this.state.activeSessionId);
  }

  /**
   * アクティブセッションIDを設定
   */
  setActiveSessionId(sessionId: string | null): void {
    this.state.activeSessionId = sessionId;
  }

  /**
   * 次のセッション番号を取得してインクリメント
   */
  getNextSessionNum(): number {
    return this.state.nextSessionNum++;
  }

  // ==================================================
  // 再接続関連
  // ==================================================

  /**
   * 再接続設定を取得
   */
  getReconnectConfig(): ReconnectConfig & { timer: ReturnType<typeof setTimeout> | null } {
    return this.state.reconnect;
  }

  /**
   * 再接続試行回数をインクリメント
   */
  incrementReconnectAttempts(): void {
    this.state.reconnect.attempts += 1;
  }

  /**
   * 再接続タイマーを設定
   */
  setReconnectTimer(timer: ReturnType<typeof setTimeout> | null): void {
    this.state.reconnect.timer = timer;
  }

  /**
   * 手動切断フラグを設定
   */
  setManualDisconnect(value: boolean): void {
    this.state.reconnect.manualDisconnect = value;
  }

  /**
   * 再接続状態をリセット
   */
  resetReconnect(): void {
    if (this.state.reconnect.timer) {
      clearTimeout(this.state.reconnect.timer);
    }
    this.state.reconnect.attempts = 0;
    this.state.reconnect.timer = null;
    this.state.reconnect.manualDisconnect = false;
  }

  /**
   * 再接続の遅延時間を計算（指数バックオフ）
   */
  getReconnectDelay(): number {
    const { baseDelay, attempts, maxDelay } = this.state.reconnect;
    const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);
    return delay;
  }
}

// シングルトンインスタンスをエクスポート
export const sessionStore = new SessionStore();
