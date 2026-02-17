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
  logger.warn('AUTH_TOKEN が未設定です。認証なしでアクセス可能な状態です。本番環境では必ず設定してください。');
}

/** タイミング安全な文字列比較 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 長さが異なる場合もタイミング情報を漏らさないように同じ長さで比較
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b.padEnd(a.length, '\0'));
    crypto.timingSafeEqual(bufA, bufB);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
