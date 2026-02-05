/**
 * パス操作ユーティリティ
 * ファイルパスの解決とエラー処理
 */

import path from 'path';
import { ROOT_DIR } from '../config.js';
import { InvalidPathError, NotFoundError, AppError } from '../errors/AppError.js';

/**
 * 相対パスをワークスペースルート内の絶対パスに解決
 * @param relativePath 相対パス
 * @returns 絶対パス
 * @throws InvalidPathError パスがワークスペース外の場合
 */
export function resolvePath(relativePath: string): string {
  const safePath = path.resolve(ROOT_DIR, relativePath || '.');
  const relative = path.relative(ROOT_DIR, safePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new InvalidPathError();
  }
  return safePath;
}

/**
 * ファイルシステムエラーを AppError に変換
 * @param error エラーオブジェクト
 * @param resourceName リソース名（エラーメッセージ用）
 * @returns AppError インスタンス
 */
export function convertFsError(
  error: unknown,
  resourceName = 'ファイル'
): AppError {
  // InvalidPathError はそのまま再スロー
  if (error instanceof InvalidPathError) {
    return error;
  }

  const err = error as { code?: string };

  // ファイルが見つからない場合
  if (err && err.code === 'ENOENT') {
    return new NotFoundError(resourceName);
  }

  // その他のファイルシステムエラー
  return new AppError(
    'FS_ERROR',
    500,
    'ファイル操作に失敗しました',
    process.env.NODE_ENV !== 'production' ? { originalError: String(error) } : undefined
  );
}
