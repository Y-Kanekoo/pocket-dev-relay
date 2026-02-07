/**
 * Express エラーハンドリングミドルウェア
 * 全てのエラーを統一されたフォーマットで返す
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

/**
 * エラーレスポンスの型定義
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * グローバルエラーハンドリングミドルウェア
 * AppError インスタンスは構造化されたレスポンスを返す
 * その他のエラーは内部サーバーエラーとして処理
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // AppError の場合は構造化されたレスポンスを返す
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: err.code,
      message: err.message,
    };

    // 詳細情報がある場合は追加
    if (err.details !== undefined) {
      response.details = err.details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // 予期しないエラーのログ出力
  console.error('予期しないエラーが発生しました:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  // 本番環境では詳細を隠す
  const isProduction = process.env.NODE_ENV === 'production';
  const response: ErrorResponse = {
    error: 'INTERNAL_SERVER_ERROR',
    message: isProduction ? 'サーバーエラーが発生しました' : err.message,
  };

  // 開発環境ではスタックトレースを含める
  if (!isProduction) {
    response.details = {
      stack: err.stack,
    };
  }

  res.status(500).json(response);
}

/**
 * 404 ハンドラー
 * 存在しないルートへのアクセス時に呼ばれる
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `エンドポイント ${req.method} ${req.path} は存在しません`,
  });
}

/**
 * 非同期ルートハンドラーをラップするユーティリティ
 * try-catch を省略してエラーを自動的に next() に渡す
 * @param fn 非同期ルートハンドラー関数
 * @returns ラップされたハンドラー
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
