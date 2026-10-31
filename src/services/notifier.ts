/**
 * 通知サービス
 * PTY出力のエラーパターン検知とプロセス終了通知を管理
 */

import WebSocket from 'ws';
import { NotificationMessage, ServerMessage } from '../types/index.js';
import { send } from '../utils/ws.js';
import { stripAnsi } from '../utils/text.js';

// ============================================================
// エラーパターン定義
// ============================================================

/** エラー検知用の正規表現パターン */
const ERROR_PATTERNS: RegExp[] = [
  /error/i,
  /failed/i,
  /exception/i,
  /ENOENT/,
  /permission denied/i,
  /segmentation fault/i,
];

/** 誤検知を避けるための除外パターン */
const IGNORE_PATTERNS: RegExp[] = [
  /0 errors?/i,
  /no errors?/i,
  /error[._-]?handler/i,
  /error[._-]?message/i,
  /error[._-]?code/i,
  /on[._-]?error/i,
  /if.*error/i,
  /catch.*error/i,
];

// stripAnsi は utils/text.ts からインポート

// ============================================================
// エラー検知
// ============================================================

/** 通知の連続送信を防ぐためのクールダウン管理 */
const lastNotificationTime = new Map<string, number>();

/** クールダウン期間（ミリ秒） */
const NOTIFICATION_COOLDOWN_MS = 5000;

/**
 * PTY出力からエラーパターンを検知
 * @param data PTY出力データ
 * @returns 検知されたエラーメッセージ（検知なしの場合はnull）
 */
export function detectError(data: string): string | null {
  const clean = stripAnsi(data);
  // 行単位でチェック
  const lines = clean.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 除外パターンに該当する場合はスキップ
    const isIgnored = IGNORE_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (isIgnored) continue;

    // エラーパターンに該当するかチェック
    const matched = ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (matched) {
      // 最初にマッチした行を返す（最大200文字に切り詰め）
      return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
    }
  }

  return null;
}

/**
 * エラー検知時に通知を送信
 * クールダウン期間内は重複通知を抑制する
 * @param ws WebSocket接続
 * @param sessionId セッションID
 * @param errorLine 検知されたエラー行
 */
export function sendErrorNotification(ws: WebSocket, sessionId: string, errorLine: string): void {
  const now = Date.now();
  const lastTime = lastNotificationTime.get(sessionId) || 0;

  // クールダウン期間中は通知を送信しない
  if (now - lastTime < NOTIFICATION_COOLDOWN_MS) {
    return;
  }

  lastNotificationTime.set(sessionId, now);

  const notification: NotificationMessage = {
    type: 'notification',
    title: 'エラーを検知しました',
    body: errorLine,
    level: 'error',
    sessionId,
  };

  send(ws, notification as ServerMessage);
}

// ============================================================
// プロセス終了通知
// ============================================================

/**
 * プロセス終了時の通知を送信
 * @param ws WebSocket接続
 * @param sessionId セッションID
 * @param exitCode 終了コード
 * @param signal シグナル（任意）
 * @param label セッションラベル
 */
export function sendExitNotification(
  ws: WebSocket,
  sessionId: string,
  exitCode: number,
  signal: number | undefined,
  label: string,
): void {
  const isSuccess = exitCode === 0;
  const level = isSuccess ? 'success' : 'warning';
  const title = isSuccess ? `${label} が正常終了しました` : `${label} が異常終了しました`;
  const body = isSuccess
    ? '終了コード: 0'
    : `終了コード: ${exitCode}${signal ? ` (シグナル: ${signal})` : ''}`;

  const notification: NotificationMessage = {
    type: 'notification',
    title,
    body,
    level,
    sessionId,
  };

  send(ws, notification as ServerMessage);
}

/**
 * セッションのクールダウン情報をクリア
 * セッション終了時に呼び出す
 * @param sessionId セッションID
 */
export function clearNotificationState(sessionId: string): void {
  lastNotificationTime.delete(sessionId);
}
