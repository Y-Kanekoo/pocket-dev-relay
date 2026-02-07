/**
 * SSH接続ダイアログコンポーネント
 * SSH接続パラメータの入力UIを管理
 */

import type { SSHConnectionConfig, AppConfig } from '../../types/index.js';

// ==================================================
// DOM要素の参照
// ==================================================

interface SSHDialogElements {
  overlay: HTMLElement | null;
  hostInput: HTMLInputElement | null;
  portInput: HTMLInputElement | null;
  usernameInput: HTMLInputElement | null;
  authMethodPassword: HTMLInputElement | null;
  authMethodKey: HTMLInputElement | null;
  passwordRow: HTMLElement | null;
  passwordInput: HTMLInputElement | null;
  connectBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  httpsWarning: HTMLElement | null;
}

let elements: SSHDialogElements = {
  overlay: null,
  hostInput: null,
  portInput: null,
  usernameInput: null,
  authMethodPassword: null,
  authMethodKey: null,
  passwordRow: null,
  passwordInput: null,
  connectBtn: null,
  cancelBtn: null,
  httpsWarning: null,
};

// 接続コールバック
let onConnect: ((config: SSHConnectionConfig) => void) | null = null;

// ==================================================
// ダイアログ操作
// ==================================================

/**
 * SSHダイアログを表示
 */
export function showSSHDialog(): void {
  if (elements.overlay) {
    elements.overlay.classList.remove('hidden');
  }
  // HTTPSでない場合は警告を表示
  if (elements.httpsWarning) {
    elements.httpsWarning.style.display =
      window.location.protocol === 'https:' ? 'none' : 'block';
  }
  // ホスト入力にフォーカス
  elements.hostInput?.focus();
}

/**
 * SSHダイアログを非表示
 */
export function hideSSHDialog(): void {
  if (elements.overlay) {
    elements.overlay.classList.add('hidden');
  }
  // パスワード入力をクリア（セキュリティのため）
  if (elements.passwordInput) {
    elements.passwordInput.value = '';
  }
}

/**
 * デフォルト値をセット
 * @param config アプリ設定
 */
export function setSSHDefaults(config: AppConfig): void {
  if (config.sshDefaultHost && elements.hostInput && !elements.hostInput.value) {
    elements.hostInput.value = config.sshDefaultHost;
  }
  if (config.sshDefaultPort && elements.portInput && !elements.portInput.value) {
    elements.portInput.value = String(config.sshDefaultPort);
  }
  if (config.sshDefaultUser && elements.usernameInput && !elements.usernameInput.value) {
    elements.usernameInput.value = config.sshDefaultUser;
  }
}

/**
 * 認証方式の変更を処理
 */
function handleAuthMethodChange(): void {
  if (!elements.passwordRow) return;
  const isPassword = elements.authMethodPassword?.checked ?? false;
  elements.passwordRow.style.display = isPassword ? 'grid' : 'none';
}

/**
 * フォームから接続設定を取得
 */
function getConnectionConfig(): SSHConnectionConfig | null {
  const host = elements.hostInput?.value.trim();
  const port = parseInt(elements.portInput?.value || '22', 10);
  const username = elements.usernameInput?.value.trim();
  const isPassword = elements.authMethodPassword?.checked ?? false;
  const password = elements.passwordInput?.value;

  if (!host) {
    elements.hostInput?.focus();
    return null;
  }
  if (!username) {
    elements.usernameInput?.focus();
    return null;
  }
  if (isPassword && !password) {
    elements.passwordInput?.focus();
    return null;
  }

  return {
    host,
    port: isNaN(port) ? 22 : port,
    username,
    authMethod: isPassword ? 'password' : 'key',
    password: isPassword ? password : undefined,
  };
}

/**
 * 接続ボタンクリック処理
 */
function handleConnect(): void {
  const config = getConnectionConfig();
  if (!config) return;

  hideSSHDialog();
  onConnect?.(config);
}

// ==================================================
// 初期化
// ==================================================

/**
 * SSHダイアログを初期化
 * @param elems DOM要素
 * @param callbacks コールバック
 */
export function initSSHDialog(
  elems: SSHDialogElements,
  callbacks: {
    onConnect: (config: SSHConnectionConfig) => void;
  },
): void {
  elements = elems;
  onConnect = callbacks.onConnect;

  // 認証方式の変更イベント
  elements.authMethodPassword?.addEventListener('change', handleAuthMethodChange);
  elements.authMethodKey?.addEventListener('change', handleAuthMethodChange);

  // 接続ボタン
  elements.connectBtn?.addEventListener('click', handleConnect);

  // キャンセルボタン
  elements.cancelBtn?.addEventListener('click', hideSSHDialog);

  // Enterキーで接続
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleConnect();
    } else if (event.key === 'Escape') {
      hideSSHDialog();
    }
  };

  elements.hostInput?.addEventListener('keydown', handleKeydown);
  elements.portInput?.addEventListener('keydown', handleKeydown);
  elements.usernameInput?.addEventListener('keydown', handleKeydown);
  elements.passwordInput?.addEventListener('keydown', handleKeydown);

  // 初期状態: パスワード行を非表示（鍵認証がデフォルト）
  handleAuthMethodChange();
}
