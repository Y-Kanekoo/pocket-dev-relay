/**
 * 設定UIコンポーネント
 * テーマ切り替えとフォントサイズ管理
 */

import {
  sessionStore,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  THEME_STORAGE_KEY,
} from '../state/sessionStore.js';

// ==================================================
// DOM要素の参照
// ==================================================

let themeToggleBtn: HTMLButtonElement | null = null;
let fontDecreaseBtn: HTMLButtonElement | null = null;
let fontIncreaseBtn: HTMLButtonElement | null = null;
let fontSizeLabel: HTMLElement | null = null;

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
  },
  callbacks: {
    onFontSizeChange: () => void;
  }
): void {
  themeToggleBtn = elements.themeToggle;
  fontDecreaseBtn = elements.fontDecrease;
  fontIncreaseBtn = elements.fontIncrease;
  fontSizeLabel = elements.fontSizeLabel;
  onFontSizeChange = callbacks.onFontSizeChange;

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

  // 初期状態のUI更新
  updateFontSizeUI();
}
