/**
 * Pocket Dev Relay クライアント
 * TypeScript版 - 複数セッション対応
 *
 * このファイルはエントリポイントとして機能し、
 * 各モジュールの初期化と連携を行う
 */

// 型定義をインポート
import type { SessionMode } from '../types/index.js';

// 状態管理
import { sessionStore } from './state/sessionStore.js';

// コンポーネント
import { initToast } from './components/toast.js';
import { initSettings } from './components/settings.js';
import { initTerminal, initSessions, clearActiveTerminal } from './components/terminal.js';
import {
  initSessionUI,
  setStatus,
  updateSessionMeta,
  updateButtons,
  updateModeUI,
  handleServerMessage,
} from './components/session.js';
import {
  initFileBrowser,
  loadFiles,
  loadAddresses,
  updateFileEditor,
} from './components/fileBrowser.js';

// サービス
import { fetchConfig } from './services/api.js';
import { initWebSocket, sendResize } from './services/websocket.js';

// ==================================================
// DOM要素の参照
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
  fontDecrease: HTMLButtonElement | null;
  fontIncrease: HTMLButtonElement | null;
  fontSizeLabel: HTMLElement | null;
}

// ==================================================
// 即時実行関数でスコープを分離
// ==================================================

(() => {
  // ==================================================
  // DOM要素の取得
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
    terminalContainer: document.getElementById('terminal-container'),
    fontDecrease: document.getElementById('font-decrease') as HTMLButtonElement | null,
    fontIncrease: document.getElementById('font-increase') as HTMLButtonElement | null,
    fontSizeLabel: document.getElementById('font-size-label'),
  };

  // ==================================================
  // 認証関連
  // ==================================================

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
    sessionStore.setToken(token);
    hideAuth();
    init();
  });

  // ==================================================
  // 設定読み込みと適用
  // ==================================================

  /**
   * 設定を取得して適用
   */
  async function loadConfig(): Promise<void> {
    const config = await fetchConfig();
    sessionStore.setConfig(config);

    const allowedModes = new Set<string>(config.modes || []);
    elements.modeGrid?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const mode = button.dataset.mode;
      const allowed = mode ? allowedModes.has(mode) : false;
      button.disabled = !allowed || (mode === 'custom' && !config.allowCustomCommands);
      if (!allowed && sessionStore.getMode() === mode) {
        const firstMode = allowedModes.values().next().value;
        sessionStore.setMode((firstMode as SessionMode) || 'shell');
      }
    });

    if (!config.allowCustomCommands && elements.customMode) {
      elements.customMode.style.display = 'none';
    }

    updateModeUI();
    updateFileEditor();
  }

  // ==================================================
  // コンポーネント初期化
  // ==================================================

  // トースト初期化（最初に）
  initToast(elements.toastContainer);

  // 設定UI初期化（テーマを即座に適用）
  initSettings(
    {
      themeToggle: elements.themeToggle,
      fontDecrease: elements.fontDecrease,
      fontIncrease: elements.fontIncrease,
      fontSizeLabel: elements.fontSizeLabel,
    },
    {
      onFontSizeChange: sendResize,
    },
  );

  // WebSocket初期化
  initWebSocket({
    onStatusChange: setStatus,
    onMessage: handleServerMessage,
    onDisconnect: updateButtons,
  });

  // ターミナル初期化
  initTerminal(
    {
      terminalContainer: elements.terminalContainer,
      sessionTabList: elements.sessionTabList,
      sessionAddBtn: elements.sessionAddBtn,
    },
    {
      onSessionChange: () => {
        updateSessionMeta();
        updateButtons();
      },
    },
  );

  // セッションUI初期化
  initSessionUI(
    {
      modeGrid: elements.modeGrid,
      cwdInput: elements.cwdInput,
      commandRow: elements.commandRow,
      commandInput: elements.commandInput,
      startBtn: elements.startBtn,
      stopBtn: elements.stopBtn,
      clearBtn: elements.clearBtn,
      sessionMeta: elements.sessionMeta,
      wsDot: elements.wsDot,
      statusText: elements.statusText,
      terminalPanel: elements.terminalPanel,
      filesPanel: elements.filesPanel,
      tabs: elements.tabs,
    },
    {
      onClearTerminal: clearActiveTerminal,
    },
  );

  // ファイルブラウザ初期化
  initFileBrowser(
    {
      fileList: elements.fileList,
      filePath: elements.filePath,
      fileName: elements.fileName,
      fileContent: elements.fileContent,
      fileStatus: elements.fileStatus,
      saveFile: elements.saveFile,
      urlList: elements.urlList,
      qrImage: elements.qrImage,
      qrLabel: elements.qrLabel,
    },
    {
      onAuthRequired: showAuth,
    },
  );

  // ==================================================
  // アプリケーション初期化
  // ==================================================

  /**
   * アプリケーション初期化
   */
  async function init(): Promise<void> {
    try {
      await loadConfig();
      updateModeUI();
      await loadAddresses();
      await loadFiles('.');
      elements.terminalPanel?.classList.add('active');

      // 初期セッションを作成
      initSessions();
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') {
        showAuth();
      }
      // その他のエラーはコンソールに出力
      console.error('初期化エラー:', error);
    }
  }

  // 初期化実行
  init();
})();
