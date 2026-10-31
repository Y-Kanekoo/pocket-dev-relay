/**
 * エラーハンドリングミドルウェアのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

vi.mock('../../src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AppError, ValidationError } from '../../src/errors/AppError.js';
import { errorHandler, notFoundHandler, asyncHandler } from '../../src/middleware/errorHandler.js';

/**
 * モックレスポンスを作成する
 */
function createMockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, statusCode: 200 } as unknown as Response;
}

/**
 * モックリクエストを作成する
 */
function createMockReq(overrides = {}) {
  return { url: '/api/test', method: 'GET', path: '/api/test', ...overrides } as unknown as Request;
}

// ============================================================
// errorHandler のテスト
// ============================================================

describe('errorHandler', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockReq();
    res = createMockRes();
    next = vi.fn();
  });

  it('AppErrorを渡した場合、対応するステータスコードとJSONが返されること', () => {
    const err = new AppError('CUSTOM_ERROR', 422, 'カスタムエラーメッセージ');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(
      (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json,
    ).toHaveBeenCalledWith({
      error: 'CUSTOM_ERROR',
      message: 'カスタムエラーメッセージ',
    });
  });

  it('AppErrorにdetailsがある場合、レスポンスにdetailsが含まれること', () => {
    const details = { field: 'email', reason: '不正な形式' };
    const err = new ValidationError('入力値が不正です', details);

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(
      (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json,
    ).toHaveBeenCalledWith({
      error: 'VALIDATION_ERROR',
      message: '入力値が不正です',
      details,
    });
  });

  it('通常のErrorを渡した場合、500エラーが返されること', () => {
    const err = new Error('何かが壊れた');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonCall = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json;
    expect(jsonCall).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INTERNAL_SERVER_ERROR',
      }),
    );
  });

  it('NODE_ENV=production時の通常Errorではメッセージが汎用的になること', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const err = new Error('内部的なエラー詳細');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonCall = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json;
      expect(jsonCall).toHaveBeenCalledWith({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

// ============================================================
// notFoundHandler のテスト
// ============================================================

describe('notFoundHandler', () => {
  it('404レスポンスと正しいメッセージが返されること', () => {
    const req = createMockReq({ method: 'GET', path: '/api/not-exist' });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    notFoundHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(
      (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json,
    ).toHaveBeenCalledWith({
      error: 'NOT_FOUND',
      message: 'エンドポイント GET /api/not-exist は存在しません',
    });
  });
});

// ============================================================
// asyncHandler のテスト
// ============================================================

describe('asyncHandler', () => {
  it('成功するasync関数が正常に実行されること', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;
    const fn = vi.fn().mockResolvedValue(undefined);

    const handler = asyncHandler(fn);
    handler(req, res, next);

    // 非同期処理の完了を待つ
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fn).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled();
        resolve();
      }, 0);
    });
  });

  it('async関数のエラーがnextに渡されること', () => {
    const error = new Error('テストエラー');
    const fn = vi.fn().mockRejectedValue(error);
    const handler = asyncHandler(fn);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    // asyncHandlerはPromise.resolve().catch(next)を使うのでawaitが必要
    handler(req, res as unknown as Response, next);

    // 次のtickでnextが呼ばれることを確認
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(next).toHaveBeenCalledWith(error);
        resolve();
      }, 0);
    });
  });
});
