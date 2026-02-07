/**
 * REST API呼び出しサービス
 * サーバーとのHTTP通信を管理
 */

import type { AppConfig, FileItem, AccessUrl } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';

// ==================================================
// 認証関連
// ==================================================

/**
 * 認証ヘッダーを取得
 */
export function authHeaders(): Record<string, string> {
  const token = sessionStore.getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ==================================================
// 設定API
// ==================================================

/**
 * アプリケーション設定を取得
 * @throws 認証エラーの場合
 */
export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config', { headers: authHeaders() });
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    throw new Error(`設定の取得に失敗しました: ${res.status}`);
  }
  const config: AppConfig = await res.json();
  return config;
}

// ==================================================
// アドレスAPI
// ==================================================

/**
 * アクセスURL一覧を取得
 * @throws 認証エラーの場合
 */
export async function fetchAddresses(): Promise<AccessUrl[]> {
  const res = await fetch('/api/addresses', { headers: authHeaders() });
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    throw new Error(`アドレスの取得に失敗しました: ${res.status}`);
  }
  const data = await res.json();
  const urls: AccessUrl[] = Array.isArray(data.urls) ? data.urls : [];
  return urls;
}

// ==================================================
// QRコードAPI
// ==================================================

/**
 * QRコードを取得
 * @param url - QRコードにするURL
 * @returns data URL形式のQRコード画像
 * @throws 認証エラーの場合
 */
export async function fetchQrCode(url: string): Promise<string> {
  const res = await fetch(`/api/qr?text=${encodeURIComponent(url)}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    throw new Error('QRコードの生成に失敗しました');
  }
  const data = await res.json();
  return data.dataUrl;
}

// ==================================================
// ファイルAPI
// ==================================================

/**
 * ファイル一覧を取得
 * @param path - ディレクトリパス
 * @throws 認証エラーの場合
 */
export async function fetchFileList(path: string): Promise<{ path: string; items: FileItem[] }> {
  const res = await fetch(`/api/files?path=${encodeURIComponent(path || '.')}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    throw new Error(`ファイル一覧の取得に失敗しました: ${res.status}`);
  }
  const data = await res.json();
  return {
    path: data.path || '.',
    items: data.items || [],
  };
}

/**
 * ファイル内容を取得
 * @param path - ファイルパス
 * @throws 認証エラーの場合
 */
export async function fetchFileContent(path: string): Promise<{ path: string; content: string }> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const info = await res.json();
    throw new Error(info.error || 'ファイルの読み込みに失敗しました');
  }
  const data = await res.json();
  return {
    path: data.path,
    content: data.content || '',
  };
}

/**
 * ファイルを保存
 * @param path - ファイルパス
 * @param content - ファイル内容
 * @throws 認証エラーの場合
 */
export async function saveFile(path: string, content: string): Promise<void> {
  const res = await fetch('/api/file', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ path, content }),
  });
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const info = await res.json();
    throw new Error(info.error || '保存に失敗しました');
  }
}

// ==================================================
// ユーティリティ
// ==================================================

/**
 * 最適なURLを選択
 */
export function pickBestUrl(urls: AccessUrl[]): AccessUrl | undefined {
  return urls.find((entry) => entry.type !== 'local') || urls[0];
}

/**
 * URLエントリのラベルを取得
 */
export function labelForUrl(entry: AccessUrl): string {
  if (entry.type === 'mdns') return `mDNS (${entry.host})`;
  if (entry.type === 'lan') return `LAN (${entry.name})`;
  if (entry.type === 'local') return 'このPC (localhost)';
  return entry.host || entry.url || 'URL';
}

/**
 * テキストをクリップボードにコピー
 */
export async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  const original = button.textContent;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    button.textContent = 'コピー済み';
    button.classList.add('success');
  } catch {
    button.textContent = '失敗';
  }
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove('success');
  }, 1600);
}
