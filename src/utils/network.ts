/**
 * ネットワークユーティリティ
 * IPアドレス取得とアクセスURL構築
 */

import os from 'os';
import { AccessUrl, UrlType } from '../types/index.js';
import { PORT, ENABLE_HTTPS } from '../config.js';

/** ネットワークインターフェース情報 */
interface InterfaceEntry {
  name: string;
  address: string;
}

/**
 * ネットワークインターフェースのIPv4アドレス一覧を取得
 * @returns インターフェース情報の配列
 */
export function listInterfaceAddresses(): InterfaceEntry[] {
  const entries: InterfaceEntry[] = [];
  const nets = os.networkInterfaces();
  Object.entries(nets).forEach(([name, ifaceList]) => {
    ifaceList?.forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        entries.push({ name, address: iface.address });
      }
    });
  });
  return entries;
}

/**
 * ホスト名をmDNS形式に正規化
 * @param hostname ホスト名
 * @returns mDNS形式のホスト名
 */
export function normalizeMdns(hostname: string | undefined): string {
  if (!hostname) return '';
  return hostname.includes('.') ? hostname : `${hostname}.local`;
}

/**
 * アクセスURL一覧を構築
 * @returns アクセスURL情報の配列
 */
export function buildAccessUrls(): AccessUrl[] {
  const urls: AccessUrl[] = [];
  const hostname = os.hostname();
  const mdnsHost = normalizeMdns(hostname);
  // HTTPSが有効な場合はhttps://を使用
  const protocol = ENABLE_HTTPS ? 'https' : 'http';

  if (mdnsHost) {
    urls.push({
      type: 'mdns' as UrlType,
      name: hostname,
      host: mdnsHost,
      url: `${protocol}://${mdnsHost}:${PORT}`,
    });
  }

  listInterfaceAddresses().forEach((entry) => {
    urls.push({
      type: 'lan' as UrlType,
      name: entry.name,
      host: entry.address,
      url: `${protocol}://${entry.address}:${PORT}`,
    });
  });

  urls.push({
    type: 'local' as UrlType,
    name: 'localhost',
    host: 'localhost',
    url: `${protocol}://localhost:${PORT}`,
  });

  const seen = new Set<string>();
  return urls.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
