/**
 * レート制限ミドルウェア
 * express-rate-limit を使用して API のリクエスト数を制限
 */

import rateLimit from 'express-rate-limit';

import { RATE_LIMIT_API, RATE_LIMIT_AUTH } from '../config.js';

/**
 * API全体のレート制限を作成
 * デフォルト: 100リクエスト/分
 * @returns レート制限ミドルウェア
 */
export function createRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1分間
    max: RATE_LIMIT_API,
    standardHeaders: true, // RateLimit-* ヘッダーを返す
    legacyHeaders: false, // X-RateLimit-* ヘッダーは無効化
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'リクエスト数が上限を超えました。しばらく待ってから再度お試しください。',
    },
  });
}

/**
 * 認証失敗用のレート制限を作成
 * ブルートフォース攻撃を防止
 * デフォルト: 5回/分
 * @returns レート制限ミドルウェア
 */
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1分間
    max: RATE_LIMIT_AUTH,
    standardHeaders: true,
    legacyHeaders: false,
    // 認証失敗時のみカウント（skipSuccessfulRequests）
    skipSuccessfulRequests: true,
    message: {
      error: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: '認証試行回数が上限を超えました。しばらく待ってから再度お試しください。',
    },
  });
}

/**
 * WebSocket接続のレート制限を作成
 * 過剰な接続試行を防止
 * デフォルト: 10接続/分
 * @returns レート制限ミドルウェア
 */
export function createWebSocketRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1分間
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'WS_RATE_LIMIT_EXCEEDED',
      message: 'WebSocket接続の試行回数が上限を超えました。しばらく待ってから再度お試しください。',
    },
  });
}
