/**
 * クライアントUI専用型定義
 * セッション状態管理、再接続設定、UI関連
 */

// ============================================================
// クライアント側の状態管理
// ============================================================

/**
 * クライアント側セッション情報
 */
export interface ClientSession {
  id: string;
  num: number;
  active: boolean;
  label: string;
  cwd: string;
}

/**
 * 再接続設定
 */
export interface ReconnectConfig {
  enabled: boolean;
  attempts: number;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  manualDisconnect: boolean;
}

/**
 * トースト通知の種別
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';
