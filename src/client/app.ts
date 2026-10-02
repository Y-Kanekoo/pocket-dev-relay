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
import { initClipboard } from './components/clipboard.js';
import { initSnippets } from './components/snippets.js';
import { initAIPanel, checkAIStatus } from './components/aiPanel.js';
import { initSSHDialog, setSSHDefaults } from './components/sshDialog.js';

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
  notificationPermitBtn: HTMLButtonElement | null;
  notificationToggle: HTMLInputElement | null;
  notificationErrorToggle: HTMLInputElement | null;
  notificationExitToggle: HTMLInputElement | null;
  notificationStatus: HTMLElement | null;
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
    notificationPermitBtn: document.getElementById(
      'notification-permit-btn',
    ) as HTMLButtonElement | null,
    notificationToggle: document.getElementById('notification-toggle') as HTMLInputElement | null,
    notificationErrorToggle: document.getElementById(
      'notification-error-toggle',
    ) as HTMLInputElement | null,
    notificationExitToggle: document.getElementById(
      'notification-exit-toggle',
    ) as HTMLInputElement | null,
    notificationStatus: document.getElementById('notification-status'),
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

    // SSHモードカードの制御
    const sshModeCard = document.getElementById('ssh-mode') as HTMLButtonElement | null;
    if (sshModeCard) {
      if (!config.sshEnabled) {
        sshModeCard.style.display = 'none';
      } else {
        sshModeCard.disabled = false;
      }
    }

    // SSHデフォルト値を設定
    if (config.sshEnabled) {
      setSSHDefaults(config);
    }

    updateModeUI();
    updateFileEditor();
  }

  // ==================================================
  // コンポーネント初期化
  // ==================================================

  // トースト初期化（最初に）
  initToast(elements.toastContainer);

  // 設定UI初期化（テーマ・通知を即座に適用）
  initSettings(
    {
      themeToggle: elements.themeToggle,
      fontDecrease: elements.fontDecrease,
      fontIncrease: elements.fontIncrease,
      fontSizeLabel: elements.fontSizeLabel,
      notificationPermit: elements.notificationPermitBtn,
      notificationToggle: elements.notificationToggle,
      notificationErrorToggle: elements.notificationErrorToggle,
      notificationExitToggle: elements.notificationExitToggle,
      notificationStatus: elements.notificationStatus,
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
      uploadBtn: document.getElementById('upload-btn') as HTMLButtonElement | null,
      uploadInput: document.getElementById('upload-input') as HTMLInputElement | null,
      uploadArea: document.getElementById('upload-area'),
      uploadProgress: document.getElementById('upload-progress'),
    },
    {
      onAuthRequired: showAuth,
    },
  );

  // クリップボード初期化
  initClipboard({
    clipboardBtn: document.getElementById('clipboard-btn') as HTMLButtonElement | null,
    clipboardModal: document.getElementById('clipboard-modal'),
    clipboardClose: document.getElementById('clipboard-close') as HTMLButtonElement | null,
    clipboardText: document.getElementById('clipboard-text') as HTMLTextAreaElement | null,
    clipboardSend: document.getElementById('clipboard-send') as HTMLButtonElement | null,
    clipboardPaste: document.getElementById('clipboard-paste') as HTMLButtonElement | null,
    clipboardCopy: document.getElementById('clipboard-copy') as HTMLButtonElement | null,
    clipboardClear: document.getElementById('clipboard-clear') as HTMLButtonElement | null,
    clipboardStatus: document.getElementById('clipboard-status'),
  });

  // スニペット初期化
  initSnippets({
    snippetBtn: document.getElementById('snippet-btn') as HTMLButtonElement | null,
    snippetDrawer: document.getElementById('snippet-drawer'),
    snippetClose: document.getElementById('snippet-close') as HTMLButtonElement | null,
    snippetList: document.getElementById('snippet-list'),
    snippetLabel: document.getElementById('snippet-label') as HTMLInputElement | null,
    snippetCommand: document.getElementById('snippet-command') as HTMLInputElement | null,
    snippetAdd: document.getElementById('snippet-add') as HTMLButtonElement | null,
    snippetOverlay: document.getElementById('snippet-overlay'),
  });

  // AIパネル初期化
  initAIPanel();

  // SSHダイアログ初期化
  initSSHDialog(
    {
      overlay: document.getElementById('ssh-overlay'),
      hostInput: document.getElementById('ssh-host') as HTMLInputElement | null,
      portInput: document.getElementById('ssh-port') as HTMLInputElement | null,
      usernameInput: document.getElementById('ssh-username') as HTMLInputElement | null,
      authMethodPassword: document.getElementById('ssh-auth-password') as HTMLInputElement | null,
      authMethodKey: document.getElementById('ssh-auth-key') as HTMLInputElement | null,
      passwordRow: document.getElementById('ssh-password-row'),
      passwordInput: document.getElementById('ssh-password') as HTMLInputElement | null,
      connectBtn: document.getElementById('ssh-connect-btn') as HTMLButtonElement | null,
      cancelBtn: document.getElementById('ssh-cancel-btn') as HTMLButtonElement | null,
      httpsWarning: document.getElementById('ssh-https-warning'),
    },
    {
      onConnect: (sshConfig) => {
        // SSH接続: セッション開始メッセージを送信
        import('./services/websocket.js').then(({ connectWebSocket, sendMessage }) => {
          import('./state/sessionStore.js').then(({ sessionStore }) => {
            const activeSessionId = sessionStore.getActiveSessionId();
            if (!activeSessionId) return;

            const session = sessionStore.getSession(activeSessionId);
            if (!session || session.active) return;

            connectWebSocket()
              .then(() => {
                sendMessage({
                  type: 'start',
                  mode: 'ssh',
                  sessionId: activeSessionId,
                  sshConfig,
                });
              })
              .catch(() => {
                session.term.writeln('\r\n[エラー] サーバーに接続できません');
              });
          });
        });
      },
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

      // AIステータスを確認（非同期、画面ブロックしない）
      checkAIStatus();
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
