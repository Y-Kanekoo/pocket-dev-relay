/**
 * 認証関連のユーティリティ（テスト用簡易実装）
 *
 * 注意: src/middleware/auth.ts が本番用の認証実装。
 * 本ファイルはテスト容易性のために作られた簡易版で、
 * 認証トークンを引数で注入可能なAPIを提供する（本番版はモジュール内でAUTH_TOKENを参照）。
 * また、本番版はタイミング安全な比較を行うが、本ファイルは単純比較のため本番使用不可。
 * 将来的には本番コードのテスタビリティを改善し、本ファイルを削除することを推奨する。
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
