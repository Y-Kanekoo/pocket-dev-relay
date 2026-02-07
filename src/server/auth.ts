/**
 * 認証関連のユーティリティ
 */

import type { Request, Response, NextFunction } from 'express';
import type http from 'http';

// ============================================================
// 認証関数
// ============================================================

/**
 * Authorizationヘッダーを検証
 * @param header Authorizationヘッダー値
 * @param authToken 設定されているトークン
 * @returns 認証結果
 */
export function isAuthorizedHeader(header: string | undefined, authToken: string): boolean {
  if (!authToken) return true;
  return header === `Bearer ${authToken}`;
}

/**
 * 認証ミドルウェアを作成
 * @param authToken 認証トークン
 * @returns Express ミドルウェア
 */
export function createAuthMiddleware(authToken: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!authToken) {
      next();
      return;
    }
    if (isAuthorizedHeader(req.headers.authorization, authToken)) {
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized' });
  };
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
 * @param authToken 認証トークン
 * @returns 認証結果
 */
export function authorizeWebSocket(req: http.IncomingMessage, authToken: string): boolean {
  if (!authToken) return true;
  return getTokenFromRequest(req) === authToken;
}
