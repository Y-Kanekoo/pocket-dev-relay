/**
 * セキュリティヘッダーミドルウェア
 * CSPやその他のセキュリティ関連ヘッダーを設定
 * helmetは使用せず、手動で設定（依存最小化）
 */

import { Request, Response, NextFunction } from 'express';

import { ENABLE_HTTPS } from '../config.js';

/**
 * セキュリティヘッダーを設定するミドルウェア
 * - Content-Security-Policy: XSS攻撃やデータインジェクションを防止
 * - X-Content-Type-Options: MIMEタイプスニッフィングを防止
 * - X-Frame-Options: クリックジャッキングを防止
 * - X-XSS-Protection: ブラウザのXSSフィルターを有効化
 * - Strict-Transport-Security: HTTPS接続を強制（HTTPS有効時のみ）
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Content-Security-Policy
  // self からのリソース読み込みを許可、インラインスクリプト・スタイルを許可
  // WebSocket接続を許可するため connect-src に ws: wss: を追加
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );

  // MIMEタイプスニッフィングを防止
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // クリックジャッキング防止
  res.setHeader('X-Frame-Options', 'DENY');

  // ブラウザのXSSフィルターを有効化
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // HTTPS接続時のみ HSTS ヘッダーを設定
  if (ENABLE_HTTPS) {
    // max-age: 1年間、サブドメインも含む
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
