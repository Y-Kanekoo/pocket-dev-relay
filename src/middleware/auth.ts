/**
 * 認証ミドルウェア
 * HTTP APIとWebSocketの認証処理
 */

import { Request, Response, NextFunction } from 'express';
import http from 'http';
import { AUTH_TOKEN } from '../config.js';
import { AuthenticationError } from '../errors/AppError.js';
import { isConfiguredAuthToken } from '../utils/auth.js';

/**
 * Authorizationヘッダーを検証
 * @param header Authorizationヘッダー値
 * @returns 認証結果
 */
export function isAuthorizedHeader(header: string | undefined): boolean {
  if (!isConfiguredAuthToken(AUTH_TOKEN)) return false;
  return header === `Bearer ${AUTH_TOKEN}`;
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
  return getTokenFromRequest(req) === AUTH_TOKEN;
}
