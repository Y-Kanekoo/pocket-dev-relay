/**
 * 認証ミドルウェア
 * HTTP APIとWebSocketの認証処理
 */

import { Request, Response, NextFunction } from 'express';
import http from 'http';
import { AUTH_TOKEN } from '../config.js';
import { AuthenticationError } from '../errors/AppError.js';

/**
 * Authorizationヘッダーを検証
 * @param header Authorizationヘッダー値
 * @returns 認証結果
 */
export function isAuthorizedHeader(header: string | undefined): boolean {
  if (!AUTH_TOKEN) return true;
  return header === `Bearer ${AUTH_TOKEN}`;
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
  return getTokenFromRequest(req) === AUTH_TOKEN;
}
