/**
 * ブラウザ通知サービス
 * Notification APIを使用したプッシュ通知を管理
 * バックグラウンド時はブラウザ通知、フォアグラウンド時はトーストで表示
 */

import type { NotificationLevel } from '../../types/index.js';
import { showToast } from '../components/toast.js';
import type { ToastType } from '../../types/index.js';

// ============================================================
// 通知設定のストレージキー
// ============================================================

const STORAGE_KEY_ENABLED = 'pdr-notification-enabled';
const STORAGE_KEY_ERROR = 'pdr-notification-error';
const STORAGE_KEY_EXIT = 'pdr-notification-exit';

// ============================================================
// 通知設定の状態
// ============================================================

/** 通知設定 */
interface NotificationSettings {
  /** 通知全体のON/OFF */
  enabled: boolean;
  /** エラー通知のON/OFF */
  errorEnabled: boolean;
  /** プロセス終了通知のON/OFF */
  exitEnabled: boolean;
}

/** 現在の通知設定 */
let settings: NotificationSettings = {
  enabled: true,
  errorEnabled: true,
  exitEnabled: true,
};

// ============================================================
// 通知許可リクエスト
// ============================================================

/**
 * ブラウザの通知許可をリクエスト
 * @returns 許可された場合はtrue
 */
export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('このブラウザはNotification APIをサポートしていません');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    console.warn('通知がブラウザ設定でブロックされています');
    return false;
  }

  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * 通知が許可されているかチェック
 * @returns 許可されている場合はtrue
 */
export function isPermissionGranted(): boolean {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

/**
 * 通知の許可状態を取得
 * @returns 許可状態の文字列
 */
export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ============================================================
// 通知設定の管理
// ============================================================

/**
 * 設定をLocalStorageから復元
 */
export function loadSettings(): NotificationSettings {
  settings.enabled = localStorage.getItem(STORAGE_KEY_ENABLED) !== 'false';
  settings.errorEnabled = localStorage.getItem(STORAGE_KEY_ERROR) !== 'false';
  settings.exitEnabled = localStorage.getItem(STORAGE_KEY_EXIT) !== 'false';
  return { ...settings };
}

/**
 * 通知全体のON/OFFを設定
 */
export function setEnabled(enabled: boolean): void {
  settings.enabled = enabled;
  localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
}

/**
 * エラー通知のON/OFFを設定
 */
export function setErrorEnabled(enabled: boolean): void {
  settings.errorEnabled = enabled;
  localStorage.setItem(STORAGE_KEY_ERROR, String(enabled));
}

/**
 * プロセス終了通知のON/OFFを設定
 */
export function setExitEnabled(enabled: boolean): void {
  settings.exitEnabled = enabled;
  localStorage.setItem(STORAGE_KEY_EXIT, String(enabled));
}

/**
 * 現在の通知設定を取得
 */
export function getSettings(): NotificationSettings {
  return { ...settings };
}

// ============================================================
// 通知表示
// ============================================================

/** NotificationLevelからToastTypeへの変換マップ */
const levelToToastType: Record<NotificationLevel, ToastType> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/**
 * 通知を表示（バックグラウンド時はブラウザ通知、フォアグラウンド時はトースト）
 * @param title 通知タイトル
 * @param body 通知本文
 * @param level 通知レベル
 */
export function showNotification(
  title: string,
  body: string,
  level: NotificationLevel = 'info',
): void {
  // 通知が無効の場合はスキップ
  if (!settings.enabled) return;

  // レベルに応じたフィルタリング
  if (level === 'error' && !settings.errorEnabled) return;
  if ((level === 'success' || level === 'warning') && !settings.exitEnabled) return;

  // フォアグラウンドの場合はトーストで表示
  if (!document.hidden) {
    const toastType = levelToToastType[level];
    showToast(`${title}: ${body}`, toastType, 5000);
    return;
  }

  // バックグラウンドの場合はブラウザ通知
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: '/icon.svg',
      tag: `pdr-${level}-${Date.now()}`,
    });

    // クリックでフォーカスを戻す
    notification.addEventListener('click', () => {
      window.focus();
      notification.close();
    });

    // 10秒後に自動で閉じる
    setTimeout(() => notification.close(), 10000);
  }
}

// ============================================================
// 初期化
// ============================================================

/**
 * 通知サービスを初期化
 * LocalStorageから設定を読み込む
 */
export function initNotification(): void {
  loadSettings();
}
