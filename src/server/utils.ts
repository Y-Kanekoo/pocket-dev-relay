/**
 * サーバー側ユーティリティ関数
 *
 * 注意: stripAnsi は src/utils/text.ts と重複している。
 * 本ファイルはテスト容易性のために依存を最小限にした実装であり、
 * splitArgs, parseArgs, resolvePath, generateLogFileName 等の独自関数も含む。
 * 将来的には stripAnsi を src/utils/text.ts からの再エクスポートに統一し、
 * 重複を解消することを推奨する。
 */

import path from 'path';
import os from 'os';

// ============================================================
// 型定義
// ============================================================

/** ネットワークインターフェース情報 */
export interface InterfaceEntry {
  name: string;
  address: string;
}

// ============================================================
// ANSIエスケープシーケンス処理
// ============================================================

/**
 * ANSIエスケープシーケンスを除去
 * @param str 入力文字列
 * @returns ANSI除去後の文字列
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

// ============================================================
// 引数パーサー
// ============================================================

/**
 * 引数文字列をスペース区切りで分割（クォート対応）
 * @param input 引数文字列
 * @returns 引数配列
 */
export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && i + 1 < input.length) {
        i += 1;
        current += input[i];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    if (char === '\\' && i + 1 < input.length) {
      i += 1;
      current += input[i];
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

/**
 * 引数文字列をパース
 * @param input 引数文字列（JSON配列またはスペース区切り）
 * @returns 引数配列
 */
export function parseArgs(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // JSON解析失敗時はsplitArgsにフォールスルー
  }
  return splitArgs(input);
}

// ============================================================
// パス解決
// ============================================================

/**
 * 相対パスをワークスペースルート内の絶対パスに解決
 * @param rootDir ワークスペースルートディレクトリ
 * @param relativePath 相対パス
 * @returns 絶対パス
 * @throws パスがワークスペース外の場合
 */
export function resolvePath(rootDir: string, relativePath: string): string {
  const safePath = path.resolve(rootDir, relativePath || '.');
  const relative = path.relative(rootDir, safePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path outside workspace root');
  }
  return safePath;
}

// ============================================================
// ログファイル名生成
// ============================================================

/**
 * ログファイル名を生成
 * @param sessionId セッションID
 * @param mode セッションモード
 * @returns ログファイル名
 */
export function generateLogFileName(sessionId: string, mode: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `session-${timestamp}-${mode}-${sessionId}.log`;
}

// ============================================================
// ネットワーク情報
// ============================================================

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
