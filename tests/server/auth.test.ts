/**
 * 認証ミドルウェアのテスト
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  isAuthorizedHeader,
  createAuthMiddleware,
} from '../../src/server/auth.js';

// ============================================================
// isAuthorizedHeader のテスト
// ============================================================

describe('isAuthorizedHeader', () => {
  it('トークンが設定されていない場合は常にtrueを返す', () => {
    expect(isAuthorizedHeader(undefined, '')).toBe(true);
    expect(isAuthorizedHeader('Bearer invalid', '')).toBe(true);
  });

  it('正しいBearerトークンの場合はtrueを返す', () => {
    const authToken = 'secret-token';
    expect(isAuthorizedHeader(`Bearer ${authToken}`, authToken)).toBe(true);
  });

  it('不正なトークンの場合はfalseを返す', () => {
    const authToken = 'secret-token';
    expect(isAuthorizedHeader('Bearer wrong-token', authToken)).toBe(false);
  });

  it('Bearerプレフィックスがない場合はfalseを返す', () => {
    const authToken = 'secret-token';
    expect(isAuthorizedHeader(authToken, authToken)).toBe(false);
  });

  it('undefinedの場合はfalseを返す', () => {
    const authToken = 'secret-token';
    expect(isAuthorizedHeader(undefined, authToken)).toBe(false);
  });
});

// ============================================================
// createAuthMiddleware のテスト
// ============================================================

describe('createAuthMiddleware', () => {
  it('トークンが設定されていない場合はnextを呼び出す', () => {
    const middleware = createAuthMiddleware('');
    const req = { headers: {} } as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('正しいトークンの場合はnextを呼び出す', () => {
    const authToken = 'secret-token';
    const middleware = createAuthMiddleware(authToken);
    const req = {
      headers: { authorization: `Bearer ${authToken}` },
    } as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('不正なトークンの場合は401を返す', () => {
    const authToken = 'secret-token';
    const middleware = createAuthMiddleware(authToken);
    const req = {
      headers: { authorization: 'Bearer wrong-token' },
    } as Request;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  it('Authorizationヘッダーがない場合は401を返す', () => {
    const authToken = 'secret-token';
    const middleware = createAuthMiddleware(authToken);
    const req = { headers: {} } as Request;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ============================================================
// authorizeToken のテスト
// ============================================================
// authorizeToken は src/middleware/auth.ts に本番実装が統一されたため、
// テストは tests/server/middleware-auth.test.ts を参照のこと。
