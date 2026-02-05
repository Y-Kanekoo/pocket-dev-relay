/**
 * 認証ミドルウェアのテスト
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type http from 'http';
import {
  isAuthorizedHeader,
  createAuthMiddleware,
  getTokenFromRequest,
  authorizeWebSocket,
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
// getTokenFromRequest のテスト
// ============================================================

describe('getTokenFromRequest', () => {
  it('URLからトークンを取得する', () => {
    const req = {
      url: '/ws?token=my-secret-token',
    } as http.IncomingMessage;

    expect(getTokenFromRequest(req)).toBe('my-secret-token');
  });

  it('トークンがない場合は空文字列を返す', () => {
    const req = {
      url: '/ws',
    } as http.IncomingMessage;

    expect(getTokenFromRequest(req)).toBe('');
  });

  it('URLがundefinedの場合は空文字列を返す', () => {
    const req = {
      url: undefined,
    } as http.IncomingMessage;

    expect(getTokenFromRequest(req)).toBe('');
  });

  it('複数のクエリパラメータがある場合でもトークンを取得できる', () => {
    const req = {
      url: '/ws?other=value&token=my-token&another=param',
    } as http.IncomingMessage;

    expect(getTokenFromRequest(req)).toBe('my-token');
  });
});

// ============================================================
// authorizeWebSocket のテスト
// ============================================================

describe('authorizeWebSocket', () => {
  it('トークンが設定されていない場合は常にtrueを返す', () => {
    const req = { url: '/ws' } as http.IncomingMessage;
    expect(authorizeWebSocket(req, '')).toBe(true);
  });

  it('正しいトークンの場合はtrueを返す', () => {
    const authToken = 'secret-token';
    const req = {
      url: `/ws?token=${authToken}`,
    } as http.IncomingMessage;

    expect(authorizeWebSocket(req, authToken)).toBe(true);
  });

  it('不正なトークンの場合はfalseを返す', () => {
    const authToken = 'secret-token';
    const req = {
      url: '/ws?token=wrong-token',
    } as http.IncomingMessage;

    expect(authorizeWebSocket(req, authToken)).toBe(false);
  });

  it('トークンがない場合はfalseを返す', () => {
    const authToken = 'secret-token';
    const req = { url: '/ws' } as http.IncomingMessage;

    expect(authorizeWebSocket(req, authToken)).toBe(false);
  });
});
