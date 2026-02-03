/**
 * Pocket Dev Relay クライアント
 * TypeScript版 - 複数セッション対応
 */

// 型定義をインポート
import type {
  SessionMode,
  ClientMessage,
  ServerMessage,
  AppConfig,
  ToastType,
  AccessUrl,
  FileItem,
  ReconnectConfig,
} from '../types/index.js';

// ==================================================
// xterm.js のグローバル変数宣言（CDNから読み込み）
// ==================================================

// xterm.js はCDNから読み込まれるため、グローバル変数として宣言
declare const Terminal: {
  new (options?: {
    cursorBlink?: boolean;
    fontSize?: number;
    fontFamily?: string;
    theme?: {
      background?: string;
      foreground?: string;
      cursor?: string;
      selection?: string;
    };
  }): TerminalInstance;
};

// Terminal インスタンスの型
interface TerminalInstance {
  cols: number;
  rows: number;
  options: {
    fontSize: number;
  };
  loadAddon(addon: FitAddonInstance): void;
  open(container: HTMLElement): void;
  write(data: string): void;
  writeln(data: string): void;
  clear(): void;
  dispose(): void;
  onData(callback: (data: string) => void): void;
}

// FitAddon のグローバル変数
declare const FitAddon: {
  FitAddon: {
    new (): FitAddonInstance;
  };
};

// FitAddon インスタンスの型
interface FitAddonInstance {
  fit(): void;
}

// ==================================================
// クライアント側のセッション情報型
// ==================================================

interface ClientSessionInfo {
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
// DOM要素の型
// ==================================================

interface DOMElements {
  modeGrid: HTMLElement | null;
  customMode: HTMLElement | null;
  cwdInput: HTMLInputElement | null;
  commandRow: HTMLElement | null;
  commandInput: HTMLInputElement | null;
  startBtn: HTMLButtonElement | null;
  stopBtn: HTMLButtonElement | null;
  clearBtn: HTMLButtonElement | null;
  terminalPanel: HTMLElement | null;
  filesPanel: HTMLElement | null;
  tabs: HTMLElement | null;
  sessionMeta: HTMLElement | null;
  wsDot: HTMLElement | null;
  statusText: HTMLElement | null;
  urlList: HTMLElement | null;
  qrImage: HTMLImageElement | null;
  qrLabel: HTMLElement | null;
  fileList: HTMLElement | null;
  filePath: HTMLElement | null;
  fileName: HTMLElement | null;
  fileContent: HTMLTextAreaElement | null;
  fileStatus: HTMLElement | null;
  saveFile: HTMLButtonElement | null;
  authOverlay: HTMLElement | null;
  authInput: HTMLInputElement | null;
  authSave: HTMLButtonElement | null;
  toastContainer: HTMLElement | null;
  themeToggle: HTMLButtonElement | null;
  sessionTabs: HTMLElement | null;
  sessionTabList: HTMLElement | null;
  sessionAddBtn: HTMLButtonElement | null;
  terminalContainer: HTMLElement | null;
}

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
}

// ==================================================
// 即時実行関数でスコープを分離
// ==================================================

(() => {
  // ==================================================
  // 定数定義
  // ==================================================

  // 最大セッション数
  const MAX_SESSIONS = 5;

  // フォントサイズ設定
  const FONT_SIZE_MIN = 10;
  const FONT_SIZE_MAX = 24;
  const FONT_SIZE_DEFAULT = 13;
  const FONT_SIZE_KEY = 'pdr_terminal_font_size';

  // テーマ設定
  const THEME_STORAGE_KEY = 'pdr_theme';

  // ==================================================
  // 状態管理
  // ==================================================

  const state: AppState = {
    mode: 'codex',
    ws: null,
    config: null,
    token: localStorage.getItem('pdr_token') || '',
    // 複数セッション管理
    sessions: new Map<string, ClientSessionInfo>(),
    activeSessionId: null,
    nextSessionNum: 1,
    // 自動再接続用の状態
    reconnect: {
      enabled: true,
      attempts: 0,
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 30000,
      timer: null,
      manualDisconnect: false
    }
  };

  // ==================================================
  // DOM要素の参照
  // ==================================================

  const elements: DOMElements = {
    modeGrid: document.getElementById('mode-grid'),
    customMode: document.getElementById('custom-mode'),
    cwdInput: document.getElementById('cwd-input') as HTMLInputElement | null,
    commandRow: document.getElementById('custom-command-row'),
    commandInput: document.getElementById('command-input') as HTMLInputElement | null,
    startBtn: document.getElementById('start-btn') as HTMLButtonElement | null,
    stopBtn: document.getElementById('stop-btn') as HTMLButtonElement | null,
    clearBtn: document.getElementById('clear-btn') as HTMLButtonElement | null,
    terminalPanel: document.getElementById('terminal-panel'),
    filesPanel: document.getElementById('files-panel'),
    tabs: document.getElementById('tabs'),
    sessionMeta: document.getElementById('session-meta'),
    wsDot: document.getElementById('ws-dot'),
    statusText: document.getElementById('status-text'),
    urlList: document.getElementById('url-list'),
    qrImage: document.getElementById('qr-image') as HTMLImageElement | null,
    qrLabel: document.getElementById('qr-label'),
    fileList: document.getElementById('file-list'),
    filePath: document.getElementById('file-path'),
    fileName: document.getElementById('file-name'),
    fileContent: document.getElementById('file-content') as HTMLTextAreaElement | null,
    fileStatus: document.getElementById('file-status'),
    saveFile: document.getElementById('save-file') as HTMLButtonElement | null,
    authOverlay: document.getElementById('auth-overlay'),
    authInput: document.getElementById('auth-input') as HTMLInputElement | null,
    authSave: document.getElementById('auth-save') as HTMLButtonElement | null,
    toastContainer: document.getElementById('toast-container'),
    themeToggle: document.getElementById('theme-toggle') as HTMLButtonElement | null,
    sessionTabs: document.getElementById('session-tabs'),
    sessionTabList: document.getElementById('session-tab-list'),
    sessionAddBtn: document.getElementById('session-add-btn') as HTMLButtonElement | null,
    terminalContainer: document.getElementById('terminal-container')
  };

  // ==================================================
  // テーマ管理
  // ==================================================

  /**
   * 現在のテーマを取得（light / dark）
   */
  function getCurrentTheme(): 'light' | 'dark' {
    // LocalStorageに保存された設定を優先
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    // システム設定に追従
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * テーマを適用
   */
  function applyTheme(theme: 'light' | 'dark'): void {
    document.documentElement.setAttribute('data-theme', theme);
    // meta theme-color も更新（PWA対応）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#f4efe8');
    }
  }

  /**
   * テーマを切り替え
   */
  function toggleTheme(): void {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    // 手動切替なのでLocalStorageに保存
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  /**
   * システム設定の変更を監視
   */
  function watchSystemTheme(): void {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e: MediaQueryListEvent) => {
      // LocalStorageに保存された設定がなければシステム設定に追従
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * テーマ初期化
   */
  function initTheme(): void {
    const theme = getCurrentTheme();
    applyTheme(theme);
    watchSystemTheme();

    // テーマ切替ボタンのイベントリスナー
    if (elements.themeToggle) {
      elements.themeToggle.addEventListener('click', toggleTheme);
    }
  }

  // 即座にテーマを適用（FOUC防止）
  initTheme();

  // ==================================================
  // トースト通知
  // ==================================================

  /**
   * トースト通知を表示
   */
  function showToast(message: string, type: ToastType = 'info', duration = 3000): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons: Record<ToastType, string> = {
      success: '✓',
      error: '✕',
      warning: '!',
      info: 'i'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    elements.toastContainer?.appendChild(toast);

    // 自動で消える
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
  }

  // ==================================================
  // フォントサイズ管理
  // ==================================================

  /**
   * LocalStorageからフォントサイズを取得
   */
  function getStoredFontSize(): number {
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
   * フォントサイズをLocalStorageに保存
   */
  function saveFontSize(size: number): void {
    localStorage.setItem(FONT_SIZE_KEY, String(size));
  }

  // 現在のフォントサイズ
  let currentFontSize = getStoredFontSize();

  // フォントサイズコントロールの要素取得
  const fontDecreaseBtn = document.getElementById('font-decrease') as HTMLButtonElement | null;
  const fontIncreaseBtn = document.getElementById('font-increase') as HTMLButtonElement | null;
  const fontSizeLabel = document.getElementById('font-size-label');

  /**
   * フォントサイズのUI更新
   */
  function updateFontSizeUI(): void {
    if (fontSizeLabel) {
      fontSizeLabel.textContent = `${currentFontSize}px`;
    }
    // ボタンの有効/無効を更新
    if (fontDecreaseBtn) {
      fontDecreaseBtn.disabled = currentFontSize <= FONT_SIZE_MIN;
    }
    if (fontIncreaseBtn) {
      fontIncreaseBtn.disabled = currentFontSize >= FONT_SIZE_MAX;
    }
  }

  /**
   * フォントサイズ変更（全セッションに適用）
   */
  function changeFontSize(delta: number): void {
    const newSize = currentFontSize + delta;
    if (newSize < FONT_SIZE_MIN || newSize > FONT_SIZE_MAX) {
      return;
    }
    currentFontSize = newSize;
    saveFontSize(currentFontSize);

    // 全セッションのターミナルにフォントサイズを適用
    state.sessions.forEach((session) => {
      session.term.options.fontSize = currentFontSize;
      session.fitAddon.fit();
    });

    // アクティブなセッションのリサイズを送信
    sendResize();
    updateFontSizeUI();
  }

  // フォントサイズボタンのイベントリスナー
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => changeFontSize(-1));
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => changeFontSize(1));
  }

  // 初期状態のUI更新
  updateFontSizeUI();

  // ==================================================
  // 複数セッション管理
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
  function createSession(): ClientSessionInfo | null {
    if (state.sessions.size >= MAX_SESSIONS) {
      showToast(`最大${MAX_SESSIONS}セッションまでです`, 'warning');
      return null;
    }

    const sessionId = generateSessionId();
    const sessionNum = state.nextSessionNum++;

    // ターミナル用のDOM要素を作成
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-shell';
    terminalElement.id = `terminal-${sessionId}`;
    elements.terminalContainer?.appendChild(terminalElement);

    // xtermインスタンスを作成
    const term = new Terminal({
      cursorBlink: true,
      fontSize: currentFontSize,
      fontFamily: '"JetBrains Mono", "Menlo", monospace',
      theme: {
        background: '#14110d',
        foreground: '#f5efe6',
        cursor: '#f0b94b',
        selection: 'rgba(240, 185, 75, 0.3)'
      }
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalElement);
    fitAddon.fit();

    // 入力をWebSocketに送信（セッションIDを含める）
    term.onData((data: string) => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      const message: ClientMessage = {
        type: 'input',
        sessionId: sessionId,
        data
      };
      state.ws.send(JSON.stringify(message));
    });

    // タブ要素を作成
    const tabElement = document.createElement('div');
    tabElement.className = 'session-tab';
    tabElement.dataset.sessionId = sessionId;
    tabElement.innerHTML = `
      <span class="session-tab-label">セッション ${sessionNum}</span>
      <button class="session-tab-close" title="セッションを閉じる">×</button>
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

    elements.sessionTabList?.appendChild(tabElement);

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
      cwd: '.'
    };

    state.sessions.set(sessionId, session);

    // セッション追加ボタンの有効/無効を更新
    updateAddButtonState();

    return session;
  }

  /**
   * セッションを切り替え
   */
  function switchSession(sessionId: string): void {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    // 以前のアクティブセッションを非アクティブに
    if (state.activeSessionId) {
      const prevSession = state.sessions.get(state.activeSessionId);
      if (prevSession) {
        prevSession.element.classList.remove('active');
        prevSession.tabElement.classList.remove('active');
      }
    }

    // 新しいセッションをアクティブに
    session.element.classList.add('active');
    session.tabElement.classList.add('active');
    state.activeSessionId = sessionId;

    // フィットとリサイズ
    session.fitAddon.fit();
    sendResize();

    // セッションメタ情報を更新
    updateSessionMeta();

    // ボタン状態を更新
    updateButtons();
  }

  /**
   * セッションを閉じる
   */
  function closeSession(sessionId: string): void {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    // サーバー側のセッションを停止
    if (session.active && state.ws && state.ws.readyState === WebSocket.OPEN) {
      const message: ClientMessage = {
        type: 'stop',
        sessionId: sessionId
      };
      state.ws.send(JSON.stringify(message));
    }

    // DOM要素を削除
    session.element.remove();
    session.tabElement.remove();

    // ターミナルを破棄
    session.term.dispose();

    // セッションを削除
    state.sessions.delete(sessionId);

    // アクティブセッションが閉じられた場合、別のセッションに切り替え
    if (state.activeSessionId === sessionId) {
      state.activeSessionId = null;
      const remainingSessions = Array.from(state.sessions.keys());
      if (remainingSessions.length > 0) {
        switchSession(remainingSessions[remainingSessions.length - 1]);
      } else {
        updateSessionMeta();
        updateButtons();
      }
    }

    // セッション追加ボタンの有効/無効を更新
    updateAddButtonState();
  }

  /**
   * セッション追加ボタンの状態を更新
   */
  function updateAddButtonState(): void {
    if (elements.sessionAddBtn) {
      elements.sessionAddBtn.disabled = state.sessions.size >= MAX_SESSIONS;
    }
  }

  /**
   * 初期セッションを作成
   */
  function initSessions(): void {
    const session = createSession();
    if (session) {
      switchSession(session.id);
    }
  }

  // ==================================================
  // UI更新関数
  // ==================================================

  /**
   * ステータス表示を更新
   */
  function setStatus(text: string, color: string): void {
    if (elements.statusText) {
      elements.statusText.textContent = text;
    }
    if (elements.wsDot) {
      elements.wsDot.style.background = color;
      elements.wsDot.style.boxShadow = `0 0 12px ${color}`;
    }
  }

  /**
   * セッションメタ情報を更新
   */
  function updateSessionMeta(): void {
    if (!elements.sessionMeta) return;

    if (!state.activeSessionId) {
      elements.sessionMeta.textContent = 'セッション未開始';
      return;
    }

    const session = state.sessions.get(state.activeSessionId);
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
  function updateButtons(): void {
    const session = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
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
  function updateModeUI(): void {
    const buttons = elements.modeGrid?.querySelectorAll<HTMLButtonElement>('[data-mode]');
    buttons?.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === state.mode);
    });
    if (elements.commandRow) {
      elements.commandRow.style.display = state.mode === 'custom' ? 'grid' : 'none';
    }
  }

  /**
   * ファイルエディタUIを更新
   */
  function updateFileEditor(): void {
    if (!state.config) return;
    const writable = Boolean(state.config.fileWriteEnabled);
    if (elements.fileContent) {
      elements.fileContent.readOnly = !writable;
    }
    if (elements.saveFile) {
      elements.saveFile.disabled = !writable || !elements.fileContent?.value;
    }
    if (elements.fileStatus) {
      if (!writable) {
        elements.fileStatus.textContent =
          '読み取り専用です（ALLOW_FILE_WRITE=true で保存可）。';
      } else {
        elements.fileStatus.textContent = '';
      }
    }
  }

  /**
   * タブのラベルを更新
   */
  function updateTabLabel(sessionId: string, label: string): void {
    const session = state.sessions.get(sessionId);
    if (!session) return;

    session.label = label;
    const labelElement = session.tabElement.querySelector('.session-tab-label');
    if (labelElement) {
      labelElement.textContent = label;
      (labelElement as HTMLElement).title = label;
    }
  }

  // ==================================================
  // URL・QR関連
  // ==================================================

  /**
   * URLエントリのラベルを取得
   */
  function labelForUrl(entry: AccessUrl): string {
    if (entry.type === 'mdns') return `mDNS (${entry.host})`;
    if (entry.type === 'lan') return `LAN (${entry.name})`;
    if (entry.type === 'local') return 'このPC (localhost)';
    return entry.host || entry.url || 'URL';
  }

  /**
   * テキストをクリップボードにコピー
   */
  async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
    const original = button.textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      button.textContent = 'コピー済み';
      button.classList.add('success');
    } catch {
      button.textContent = '失敗';
    }
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('success');
    }, 1600);
  }

  /**
   * 最適なURLを選択
   */
  function pickBestUrl(urls: AccessUrl[]): AccessUrl | undefined {
    return urls.find((entry) => entry.type !== 'local') || urls[0];
  }

  /**
   * URL一覧をレンダリング
   */
  function renderUrlList(urls: AccessUrl[]): void {
    if (!elements.urlList) return;

    elements.urlList.innerHTML = '';
    if (!urls.length) {
      elements.urlList.textContent = '接続URLが見つかりません。';
      return;
    }

    urls.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'url-item';

      const meta = document.createElement('div');
      meta.className = 'url-meta';

      const label = document.createElement('div');
      label.className = 'url-label';
      label.textContent = labelForUrl(entry);

      const text = document.createElement('div');
      text.className = 'url-text';
      text.textContent = entry.url;

      const copyBtn = document.createElement('button') as HTMLButtonElement;
      copyBtn.type = 'button';
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'コピー';
      copyBtn.addEventListener('click', () => copyText(entry.url, copyBtn));

      meta.append(label, text);
      row.append(meta, copyBtn);
      elements.urlList?.appendChild(row);
    });
  }

  /**
   * QRコードを読み込み
   */
  async function loadQr(url: string): Promise<void> {
    if (!url) return;
    if (elements.qrLabel) {
      elements.qrLabel.textContent = url;
    }
    try {
      const res = await fetch(`/api/qr?text=${encodeURIComponent(url)}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        showAuth();
        return;
      }
      if (!res.ok) {
        if (elements.qrLabel) {
          elements.qrLabel.textContent = 'QRの生成に失敗しました。';
        }
        return;
      }
      const data = await res.json();
      if (elements.qrImage) {
        elements.qrImage.src = data.dataUrl;
      }
    } catch {
      if (elements.qrLabel) {
        elements.qrLabel.textContent = 'QRの生成に失敗しました。';
      }
    }
  }

  /**
   * アドレス一覧を読み込み
   */
  async function loadAddresses(): Promise<void> {
    try {
      const res = await fetch('/api/addresses', { headers: authHeaders() });
      if (res.status === 401) {
        showAuth();
        return;
      }
      const data = await res.json();
      const urls: AccessUrl[] = Array.isArray(data.urls) ? data.urls : [];
      renderUrlList(urls);
      const best = pickBestUrl(urls);
      if (best) {
        await loadQr(best.url);
      }
    } catch {
      if (elements.urlList) {
        elements.urlList.textContent = '接続URLの取得に失敗しました。';
      }
    }
  }

  // ==================================================
  // 認証関連
  // ==================================================

  /**
   * 認証ヘッダーを取得
   */
  function authHeaders(): Record<string, string> {
    if (!state.token) return {};
    return { Authorization: `Bearer ${state.token}` };
  }

  /**
   * 設定を取得
   */
  async function fetchConfig(): Promise<void> {
    const res = await fetch('/api/config', { headers: authHeaders() });
    if (res.status === 401) {
      showAuth();
      throw new Error('unauthorized');
    }
    const config: AppConfig = await res.json();
    state.config = config;

    const allowedModes = new Set<string>(config.modes || []);
    elements.modeGrid?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const mode = button.dataset.mode;
      const allowed = mode ? allowedModes.has(mode) : false;
      button.disabled = !allowed || (mode === 'custom' && !config.allowCustomCommands);
      if (!allowed && state.mode === mode) {
        const firstMode = allowedModes.values().next().value;
        state.mode = (firstMode as SessionMode) || 'shell';
      }
    });

    if (!config.allowCustomCommands && elements.customMode) {
      elements.customMode.style.display = 'none';
    }

    updateModeUI();
    updateFileEditor();
  }

  /**
   * 認証オーバーレイを表示
   */
  function showAuth(): void {
    elements.authOverlay?.classList.remove('hidden');
  }

  /**
   * 認証オーバーレイを非表示
   */
  function hideAuth(): void {
    elements.authOverlay?.classList.add('hidden');
  }

  // 認証ボタンのイベントリスナー
  elements.authSave?.addEventListener('click', () => {
    const token = elements.authInput?.value.trim();
    if (!token) return;
    state.token = token;
    localStorage.setItem('pdr_token', token);
    hideAuth();
    init();
  });

  // ==================================================
  // WebSocket管理
  // ==================================================

  /**
   * WebSocket URLを取得
   */
  function getWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const token = state.token ? `?token=${encodeURIComponent(state.token)}` : '';
    return `${protocol}://${window.location.host}/ws${token}`;
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

    // sessionIdが含まれている場合は該当セッションに振り分け
    const sessionId = 'sessionId' in payload ? payload.sessionId : undefined;

    if (payload.type === 'data') {
      // セッションIDがある場合は該当セッションに出力
      if (sessionId) {
        const session = state.sessions.get(sessionId);
        if (session) {
          session.term.write(payload.data);
        }
      } else {
        // 後方互換性: sessionIdがない場合はアクティブセッションに出力
        if (state.activeSessionId) {
          const activeSession = state.sessions.get(state.activeSessionId);
          if (activeSession) {
            activeSession.term.write(payload.data);
          }
        }
      }
      return;
    }

    if (payload.type === 'started') {
      // セッション開始通知
      const targetSessionId = sessionId || state.activeSessionId;
      if (targetSessionId) {
        const session = state.sessions.get(targetSessionId);
        if (session) {
          session.active = true;
          session.label = payload.label || payload.mode || `セッション ${session.num}`;
          session.cwd = payload.cwd || '.';
          updateTabLabel(targetSessionId, session.label);
          if (targetSessionId === state.activeSessionId) {
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
      const targetSessionId = sessionId || state.activeSessionId;
      if (targetSessionId) {
        const session = state.sessions.get(targetSessionId);
        if (session) {
          session.active = false;
          if (targetSessionId === state.activeSessionId) {
            updateSessionMeta();
            updateButtons();
          }
        }
      }
      return;
    }

    if (payload.type === 'error') {
      // エラー通知
      const targetSessionId = state.activeSessionId;
      if (targetSessionId) {
        const session = state.sessions.get(targetSessionId);
        if (session) {
          session.term.writeln(`\r\n[エラー] ${payload.message}`);
        }
      }
    }
  }

  /**
   * 再接続の遅延時間を計算（指数バックオフ）
   */
  function getReconnectDelay(): number {
    const delay = Math.min(
      state.reconnect.baseDelay * Math.pow(2, state.reconnect.attempts),
      state.reconnect.maxDelay
    );
    return delay;
  }

  /**
   * 再接続をスケジュール
   */
  function scheduleReconnect(): void {
    if (!state.reconnect.enabled || state.reconnect.manualDisconnect) {
      return;
    }

    if (state.reconnect.attempts >= state.reconnect.maxAttempts) {
      showToast('再接続の上限に達しました。手動で再接続してください。', 'error', 5000);
      return;
    }

    const delay = getReconnectDelay();
    state.reconnect.attempts += 1;

    showToast(`再接続中... (${state.reconnect.attempts}/${state.reconnect.maxAttempts})`, 'warning', delay);
    setStatus(`再接続中 (${Math.round(delay / 1000)}秒後)`, '#f0b94b');

    state.reconnect.timer = setTimeout(() => {
      connectWebSocket().catch(() => {
        // エラーはcloseイベントで処理される
      });
    }, delay);
  }

  /**
   * 再接続をキャンセル
   */
  function cancelReconnect(): void {
    if (state.reconnect.timer) {
      clearTimeout(state.reconnect.timer);
      state.reconnect.timer = null;
    }
  }

  /**
   * 再接続状態をリセット
   */
  function resetReconnect(): void {
    cancelReconnect();
    state.reconnect.attempts = 0;
    state.reconnect.manualDisconnect = false;
  }

  /**
   * WebSocket接続を確立
   */
  function connectWebSocket(): Promise<void> {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // 既存の接続があれば閉じる
    if (state.ws) {
      state.reconnect.manualDisconnect = true;
      state.ws.close();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(getWsUrl());
      state.ws = ws;

      ws.addEventListener('open', () => {
        setStatus('接続済み', '#0b8f7a');
        // 再接続成功時
        if (state.reconnect.attempts > 0) {
          showToast('接続しました', 'success');
        }
        resetReconnect();
        resolve();
      });

      ws.addEventListener('message', handleWsMessage);

      ws.addEventListener('close', () => {
        setStatus('未接続', '#d95a2b');

        // 全セッションを非アクティブに
        state.sessions.forEach((session) => {
          session.active = false;
        });
        updateButtons();

        // 意図しない切断の場合は再接続を試みる
        if (!state.reconnect.manualDisconnect && state.reconnect.enabled) {
          if (state.reconnect.attempts === 0) {
            showToast('接続が切れました', 'error');
          }
          scheduleReconnect();
        }
      });

      ws.addEventListener('error', () => {
        setStatus('エラー', '#d95a2b');
        reject(new Error('ws-error'));
      });
    });
  }

  /**
   * リサイズ情報を送信（アクティブセッション）
   */
  function sendResize(): void {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!state.activeSessionId) return;

    const session = state.sessions.get(state.activeSessionId);
    if (!session) return;

    const message: ClientMessage = {
      type: 'resize',
      sessionId: state.activeSessionId,
      cols: session.term.cols,
      rows: session.term.rows
    };
    state.ws.send(JSON.stringify(message));
  }

  // ウィンドウリサイズ時の処理
  window.addEventListener('resize', () => {
    // アクティブセッションをフィット
    if (state.activeSessionId) {
      const session = state.sessions.get(state.activeSessionId);
      if (session) {
        session.fitAddon.fit();
        sendResize();
      }
    }
  });

  // ==================================================
  // セッション操作
  // ==================================================

  /**
   * セッションを開始
   */
  async function startSession(): Promise<void> {
    if (!state.activeSessionId) {
      showToast('セッションを選択してください', 'warning');
      return;
    }

    const session = state.sessions.get(state.activeSessionId);
    if (!session) return;

    if (session.active) {
      showToast('このセッションは既に開始しています', 'warning');
      return;
    }

    try {
      await connectWebSocket();
      const message: ClientMessage = {
        type: 'start',
        sessionId: state.activeSessionId,
        mode: state.mode,
        cwd: elements.cwdInput?.value.trim() || '.',
        command: elements.commandInput?.value.trim()
      };
      state.ws?.send(JSON.stringify(message));
    } catch {
      session.term.writeln('\r\n[エラー] サーバーに接続できません');
    }
  }

  /**
   * セッションを停止
   */
  function stopSession(): void {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!state.activeSessionId) return;

    const session = state.sessions.get(state.activeSessionId);
    if (!session || !session.active) return;

    const message: ClientMessage = {
      type: 'stop',
      sessionId: state.activeSessionId
    };
    state.ws.send(JSON.stringify(message));
  }

  /**
   * ターミナルをクリア
   */
  function clearTerminal(): void {
    if (!state.activeSessionId) return;
    const session = state.sessions.get(state.activeSessionId);
    if (session) {
      session.term.clear();
    }
  }

  // ==================================================
  // イベントリスナー
  // ==================================================

  elements.modeGrid?.addEventListener('click', (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (!button || button.disabled) return;
    const mode = button.dataset.mode as SessionMode | undefined;
    if (mode) {
      state.mode = mode;
      updateModeUI();
    }
  });

  elements.startBtn?.addEventListener('click', startSession);
  elements.stopBtn?.addEventListener('click', stopSession);
  elements.clearBtn?.addEventListener('click', clearTerminal);

  // セッション追加ボタン
  elements.sessionAddBtn?.addEventListener('click', () => {
    const session = createSession();
    if (session) {
      switchSession(session.id);
    }
  });

  // ==================================================
  // ファイル管理
  // ==================================================

  const currentFile: { path: string | null } = {
    path: null
  };

  /**
   * ファイル一覧をレンダリング
   */
  function renderFileList(items: FileItem[], currentPath: string): void {
    if (!elements.fileList || !elements.filePath) return;

    elements.fileList.innerHTML = '';
    elements.filePath.textContent = currentPath;

    if (currentPath !== '.') {
      const parent = document.createElement('div');
      parent.className = 'file-item';
      parent.innerHTML = '<span>[DIR] ..</span><span>&gt;</span>';
      parent.addEventListener('click', () => {
        loadFiles(parentPath(currentPath));
      });
      elements.fileList.appendChild(parent);
    }

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'file-item';
      row.innerHTML = `<span>[${item.type === 'dir' ? 'DIR' : 'FILE'}] ${item.name}</span><span>&gt;</span>`;
      row.addEventListener('click', () => {
        if (item.type === 'dir') {
          loadFiles(joinPath(currentPath, item.name));
        } else {
          loadFile(joinPath(currentPath, item.name));
        }
      });
      elements.fileList?.appendChild(row);
    });
  }

  /**
   * パスを結合
   */
  function joinPath(base: string, name: string): string {
    if (!base || base === '.') return name;
    return `${base}/${name}`;
  }

  /**
   * 親パスを取得
   */
  function parentPath(current: string): string {
    if (!current || current === '.') return '.';
    const parts = current.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? parts.join('/') : '.';
  }

  /**
   * ファイル一覧を読み込み
   */
  async function loadFiles(path: string): Promise<void> {
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path || '.')}`,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        showAuth();
        return;
      }
      const data = await res.json();
      renderFileList(data.items || [], data.path || '.');
    } catch {
      if (elements.fileStatus) {
        elements.fileStatus.textContent = 'ファイル一覧の取得に失敗しました。';
      }
    }
  }

  /**
   * ファイル内容を読み込み
   */
  async function loadFile(path: string): Promise<void> {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        showAuth();
        return;
      }
      if (!res.ok) {
        const info = await res.json();
        if (elements.fileStatus) {
          elements.fileStatus.textContent = `読み込み失敗: ${info.error || 'unknown'}`;
        }
        return;
      }
      const data = await res.json();
      currentFile.path = data.path;
      if (elements.fileName) {
        elements.fileName.textContent = data.path;
      }
      if (elements.fileContent) {
        elements.fileContent.value = data.content || '';
      }
      updateFileEditor();
    } catch {
      if (elements.fileStatus) {
        elements.fileStatus.textContent = 'ファイルの読み込みに失敗しました。';
      }
    }
  }

  // ファイル内容の入力イベント
  elements.fileContent?.addEventListener('input', () => {
    if (!state.config || !state.config.fileWriteEnabled) return;
    if (elements.saveFile) {
      elements.saveFile.disabled = !elements.fileContent?.value;
    }
  });

  // ファイル保存ボタン
  elements.saveFile?.addEventListener('click', async () => {
    if (!currentFile.path || !elements.saveFile) return;
    elements.saveFile.disabled = true;
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          path: currentFile.path,
          content: elements.fileContent?.value || ''
        })
      });
      if (res.status === 401) {
        showAuth();
        return;
      }
      if (!res.ok) {
        const info = await res.json();
        if (elements.fileStatus) {
          elements.fileStatus.textContent = `保存に失敗しました: ${info.error || 'unknown'}`;
        }
      } else {
        if (elements.fileStatus) {
          elements.fileStatus.textContent = '保存しました。';
        }
      }
    } catch {
      if (elements.fileStatus) {
        elements.fileStatus.textContent = '保存に失敗しました。';
      }
    } finally {
      if (elements.saveFile) {
        elements.saveFile.disabled = false;
      }
    }
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
    if (state.activeSessionId) {
      const session = state.sessions.get(state.activeSessionId);
      if (session) {
        session.fitAddon.fit();
        sendResize();
      }
    }
  });

  // ==================================================
  // 初期化
  // ==================================================

  /**
   * アプリケーション初期化
   */
  async function init(): Promise<void> {
    try {
      await fetchConfig();
      updateModeUI();
      await loadAddresses();
      await loadFiles('.');
      elements.terminalPanel?.classList.add('active');

      // 初期セッションを作成
      initSessions();
    } catch {
      // Auth prompts are handled elsewhere.
    }
  }

  setStatus('未接続', '#d95a2b');
  updateButtons();
  init();
})();
