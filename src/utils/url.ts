/**
 * URL・アクセスURL関連のピュア関数
 * クライアント・サーバー双方から利用可能な共有ユーティリティ
 */

import type { AccessUrl } from '../types/index.js';

/**
 * 最適なURLを選択
 * tunnel > その他（mDNS, LAN） > local の優先順で返す
 * @param urls アクセスURL一覧
 * @returns 最適なURL（空配列の場合はundefined）
 */
export function pickBestUrl(urls: AccessUrl[]): AccessUrl | undefined {
  return (
    urls.find((entry) => entry.type === 'tunnel') ||
    urls.find((entry) => entry.type !== 'local') ||
    urls[0]
  );
}

/**
 * URLエントリのラベルを取得
 * @param entry アクセスURL情報
 * @returns 表示用ラベル
 */
export function labelForUrl(entry: AccessUrl): string {
  if (entry.type === 'tunnel') return `外部アクセス (${entry.name})`;
  if (entry.type === 'mdns') return `mDNS (${entry.host})`;
  if (entry.type === 'lan') return `LAN (${entry.name})`;
  if (entry.type === 'local') return 'このPC (localhost)';
  return entry.host || entry.url || 'URL';
}
