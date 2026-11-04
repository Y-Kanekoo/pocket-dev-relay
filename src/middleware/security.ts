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
  // - script-src: インラインスクリプトを外部ファイルに移行済みのため 'unsafe-inline' 不要
  // - style-src: xterm.js が動的にインラインスタイルを生成するため 'unsafe-inline' が必要
  //   Google Fonts のスタイルシート読み込みのため fonts.googleapis.com を許可
  // - font-src: Google Fonts のフォントファイル読み込みのため fonts.gstatic.com を許可
  // - connect-src: 同一オリジンのWebSocket接続のみ許可（'self'がws/wssも包含）
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self' https://fonts.gstatic.com",
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

  // リファラ情報の漏洩を制御
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 不要なブラウザAPIへのアクセスを制限
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // HTTPS接続時のみ HSTS ヘッダーを設定
  if (ENABLE_HTTPS) {
    // max-age: 1年間、サブドメインも含む
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
