/**
 * テキスト処理ユーティリティ
 */

/**
 * ANSIエスケープシーケンスを除去
 * @param str 入力文字列
 * @returns ANSI除去後の文字列
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}
