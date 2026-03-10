/**
 * ファイルパス操作のピュア関数
 * クライアント・サーバー双方から利用可能な共有ユーティリティ
 * Node.js の path モジュールに依存しない軽量版
 */

/**
 * パスを結合
 * @param base ベースパス
 * @param name ファイル名またはサブパス
 * @returns 結合されたパス
 */
export function joinPath(base: string, name: string): string {
  if (!base || base === '.') return name;
  return `${base}/${name}`;
}

/**
 * 親パスを取得
 * @param current 現在のパス
 * @returns 親ディレクトリのパス（ルートの場合は '.'）
 */
export function parentPath(current: string): string {
  if (!current || current === '.') return '.';
  const parts = current.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}
