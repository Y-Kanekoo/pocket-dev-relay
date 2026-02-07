/**
 * トースト通知コンポーネント
 * 一時的なメッセージをユーザーに表示
 */

import type { ToastType } from '../../types/index.js';

// トーストコンテナ要素
let toastContainer: HTMLElement | null = null;

/**
 * トーストコンテナを初期化
 */
export function initToast(container: HTMLElement | null): void {
  toastContainer = container;
}

/**
 * トースト通知を表示
 * @param message - 表示するメッセージ
 * @param type - トーストの種別（success, error, warning, info）
 * @param duration - 表示時間（ミリ秒）
 * @returns 作成されたトースト要素
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = 3000,
): HTMLElement | null {
  if (!toastContainer) {
    console.warn('トーストコンテナが初期化されていません');
    return null;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons: Record<ToastType, string> = {
    success: '\u2713',
    error: '\u2715',
    warning: '!',
    info: 'i',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  toastContainer.appendChild(toast);

  // 自動で消える
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);

  return toast;
}
