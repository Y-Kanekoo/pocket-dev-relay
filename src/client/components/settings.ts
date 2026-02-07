/**
 * 設定UIコンポーネント
 * テーマ切り替え、フォントサイズ管理、通知設定
 */

import {
  sessionStore,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  THEME_STORAGE_KEY,
} from '../state/sessionStore.js';
import {
  requestPermission,
  getPermissionState,
  getSettings,
  setEnabled,
  setErrorEnabled,
  setExitEnabled,
  initNotification,
} from '../services/notification.js';
import { showToast } from './toast.js';

// ==================================================
// DOM要素の参照
// ==================================================

let themeToggleBtn: HTMLButtonElement | null = null;
let fontDecreaseBtn: HTMLButtonElement | null = null;
let fontIncreaseBtn: HTMLButtonElement | null = null;
let fontSizeLabel: HTMLElement | null = null;

// 通知関連のDOM要素
let notificationPermitBtn: HTMLButtonElement | null = null;
let notificationToggle: HTMLInputElement | null = null;
let notificationErrorToggle: HTMLInputElement | null = null;
let notificationExitToggle: HTMLInputElement | null = null;
let notificationStatus: HTMLElement | null = null;

// リサイズ送信コールバック（外部から設定）
let onFontSizeChange: (() => void) | null = null;

// ==================================================
// テーマ管理
// ==================================================

/**
 * 現在のテーマを取得（light / dark）
 */
export function getCurrentTheme(): 'light' | 'dark' {
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
export function applyTheme(theme: 'light' | 'dark'): void {
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
export function toggleTheme(): void {
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

// ==================================================
// フォントサイズ管理
// ==================================================

/**
 * フォントサイズのUI更新
 */
export function updateFontSizeUI(): void {
  const currentFontSize = sessionStore.getCurrentFontSize();
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
export function changeFontSize(delta: number): void {
  const currentFontSize = sessionStore.getCurrentFontSize();
  const newSize = currentFontSize + delta;
  if (newSize < FONT_SIZE_MIN || newSize > FONT_SIZE_MAX) {
    return;
  }
  sessionStore.setFontSize(newSize);

  // 全セッションのターミナルにフォントサイズを適用
  sessionStore.getSessions().forEach((session) => {
    session.term.options.fontSize = newSize;
    session.fitAddon.fit();
  });

  // リサイズコールバックを呼び出し
  if (onFontSizeChange) {
    onFontSizeChange();
  }
  updateFontSizeUI();
}

// ==================================================
// 通知設定管理
// ==================================================

/**
 * 通知許可状態のUI表示を更新
 */
export function updateNotificationUI(): void {
  const state = getPermissionState();
  const settings = getSettings();

  // 許可状態のテキスト
  if (notificationStatus) {
    switch (state) {
      case 'granted':
        notificationStatus.textContent = '許可済み';
        notificationStatus.className = 'notification-status granted';
        break;
      case 'denied':
        notificationStatus.textContent = 'ブロック中';
        notificationStatus.className = 'notification-status denied';
        break;
      case 'default':
        notificationStatus.textContent = '未設定';
        notificationStatus.className = 'notification-status default';
        break;
      case 'unsupported':
        notificationStatus.textContent = '非対応';
        notificationStatus.className = 'notification-status unsupported';
        break;
    }
  }

  // 許可ボタンの状態
  if (notificationPermitBtn) {
    notificationPermitBtn.disabled = state === 'granted' || state === 'unsupported';
    notificationPermitBtn.textContent = state === 'granted' ? '通知許可済み' : '通知を許可';
  }

  // トグルの状態
  const togglesEnabled = state === 'granted';
  if (notificationToggle) {
    notificationToggle.checked = settings.enabled;
    notificationToggle.disabled = !togglesEnabled;
  }
  if (notificationErrorToggle) {
    notificationErrorToggle.checked = settings.errorEnabled;
    notificationErrorToggle.disabled = !togglesEnabled || !settings.enabled;
  }
  if (notificationExitToggle) {
    notificationExitToggle.checked = settings.exitEnabled;
    notificationExitToggle.disabled = !togglesEnabled || !settings.enabled;
  }
}

/**
 * 通知許可をリクエストしてUIを更新
 */
async function handlePermissionRequest(): Promise<void> {
  const granted = await requestPermission();
  if (granted) {
    showToast('通知を許可しました', 'success');
  } else {
    showToast('通知が許可されませんでした', 'warning');
  }
  updateNotificationUI();
}

/**
 * 通知設定のイベントリスナーを設定
 */
function setupNotificationListeners(): void {
  // 許可ボタン
  notificationPermitBtn?.addEventListener('click', () => {
    handlePermissionRequest();
  });

  // 通知全体のON/OFF
  notificationToggle?.addEventListener('change', () => {
    if (notificationToggle) {
      setEnabled(notificationToggle.checked);
      updateNotificationUI();
    }
  });

  // エラー通知のON/OFF
  notificationErrorToggle?.addEventListener('change', () => {
    if (notificationErrorToggle) {
      setErrorEnabled(notificationErrorToggle.checked);
    }
  });

  // プロセス終了通知のON/OFF
  notificationExitToggle?.addEventListener('change', () => {
    if (notificationExitToggle) {
      setExitEnabled(notificationExitToggle.checked);
    }
  });
}

// ==================================================
// 初期化
// ==================================================

/**
 * 設定UIを初期化
 * @param elements - DOM要素
 * @param callbacks - コールバック関数
 */
export function initSettings(
  elements: {
    themeToggle: HTMLButtonElement | null;
    fontDecrease: HTMLButtonElement | null;
    fontIncrease: HTMLButtonElement | null;
    fontSizeLabel: HTMLElement | null;
    notificationPermit?: HTMLButtonElement | null;
    notificationToggle?: HTMLInputElement | null;
    notificationErrorToggle?: HTMLInputElement | null;
    notificationExitToggle?: HTMLInputElement | null;
    notificationStatus?: HTMLElement | null;
  },
  callbacks: {
    onFontSizeChange: () => void;
  },
): void {
  themeToggleBtn = elements.themeToggle;
  fontDecreaseBtn = elements.fontDecrease;
  fontIncreaseBtn = elements.fontIncrease;
  fontSizeLabel = elements.fontSizeLabel;
  onFontSizeChange = callbacks.onFontSizeChange;

  // 通知関連のDOM要素
  notificationPermitBtn = elements.notificationPermit ?? null;
  notificationToggle = elements.notificationToggle ?? null;
  notificationErrorToggle = elements.notificationErrorToggle ?? null;
  notificationExitToggle = elements.notificationExitToggle ?? null;
  notificationStatus = elements.notificationStatus ?? null;

  // テーマ初期化
  const theme = getCurrentTheme();
  applyTheme(theme);
  watchSystemTheme();

  // テーマ切替ボタンのイベントリスナー
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // フォントサイズボタンのイベントリスナー
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => changeFontSize(-1));
  }
  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => changeFontSize(1));
  }

  // 通知サービス初期化
  initNotification();
  setupNotificationListeners();

  // 初期状態のUI更新
  updateFontSizeUI();
  updateNotificationUI();
}
