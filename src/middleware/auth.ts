/**
 * 認証ミドルウェア
 * HTTP APIとWebSocketメッセージベース認証の処理
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AUTH_TOKEN } from '../config.js';
import { AuthenticationError } from '../errors/AppError.js';
import { isConfiguredAuthToken } from '../utils/auth.js';
import type http from 'http';

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
  if (!isConfiguredAuthToken(AUTH_TOKEN)) return false;
  if (!header) return false;
  return timingSafeCompare(header, `Bearer ${AUTH_TOKEN}`);
}

/**
 * 認証ミドルウェア
 * Authorizationヘッダーを検証。不正な認証設定でもアクセスを拒否する。
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
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
  if (!isConfiguredAuthToken(AUTH_TOKEN)) return false;
  if (!token) return false;
  return timingSafeCompare(token, AUTH_TOKEN);
}

/**
 * WebSocketリクエストからトークンを取得
 * @param req HTTPリクエスト
 * @returns トークン
 */
export function getTokenFromRequest(req: http.IncomingMessage): string {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    return url.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

/**
 * WebSocket接続を認証
 * @param req HTTPリクエスト
 * @returns 認証結果
 */
export function authorizeWebSocket(req: http.IncomingMessage): boolean {
  if (!isConfiguredAuthToken(AUTH_TOKEN)) return false;
  return authorizeToken(getTokenFromRequest(req));
}
