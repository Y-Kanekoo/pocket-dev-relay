/**
 * 認証ミドルウェア
 * HTTP APIとWebSocketの認証処理
 */

import { Request, Response, NextFunction } from 'express';
import http from 'http';
import crypto from 'crypto';
import { AUTH_TOKEN } from '../config.js';
import { AuthenticationError } from '../errors/AppError.js';
import logger from '../services/logger.js';

// AUTH_TOKEN未設定時の警告
if (!AUTH_TOKEN) {
  logger.warn(
    'AUTH_TOKEN が未設定です。認証なしでアクセス可能な状態です。本番環境では必ず設定してください。',
  );
}

/**
 * タイミング安全な文字列比較
 *
 * crypto.timingSafeEqual は同一長のBufferを要求するため、
 * 長さが異なる入力をそのまま渡すと例外になるか、長さ差からの情報漏洩が生じる。
 * SHA-256ハッシュを介することで:
 *   1. 入力長を固定長（32バイト）に正規化し、長さの差異を隠蔽する
 *   2. timingSafeEqual による一定時間比較を確実に実行できる
 */
function timingSafeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Authorizationヘッダーを検証
 * @param header Authorizationヘッダー値
 * @returns 認証結果
 */
export function isAuthorizedHeader(header: string | undefined): boolean {
  if (!AUTH_TOKEN) return true;
  if (!header) return false;
  return timingSafeCompare(header, `Bearer ${AUTH_TOKEN}`);
}

/**
 * 認証ミドルウェア
 * 認証トークンが設定されている場合、Authorizationヘッダーを検証
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) {
    next();
    return;
  }
  if (isAuthorizedHeader(req.headers.authorization)) {
    next();
    return;
  }
  next(new AuthenticationError());
}

/**
 * トークンを直接検証する（WebSocketメッセージベース認証用）
 * @param token 認証トークン
 * @returns 認証結果
 */
export function authorizeToken(token: string): boolean {
  if (!AUTH_TOKEN) return true;
  if (!token) return false;
  return timingSafeCompare(token, AUTH_TOKEN);
}

/**
 * WebSocketリクエストからトークンを取得
 * 注意: URLクエリパラメータ経由のトークン送信はサーバーログに残る可能性がある。
 * 将来的には初回WebSocketメッセージでの認証に移行することを推奨。
 * @param req HTTPリクエスト
 * @returns トークン
 */
export function getTokenFromRequest(req: http.IncomingMessage): string {
  const url = new URL(req.url || '', 'http://localhost');
  return url.searchParams.get('token') || '';
}

/**
 * WebSocket接続を認証
 * @param req HTTPリクエスト
 * @returns 認証結果
 */
export function authorizeWebSocket(req: http.IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true;
  const token = getTokenFromRequest(req);
  if (!token) return false;
  return timingSafeCompare(token, AUTH_TOKEN);
}
