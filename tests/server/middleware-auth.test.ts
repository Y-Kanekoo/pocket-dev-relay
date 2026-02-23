/**
 * 認証ミドルウェア（本番版）のテスト
 * src/middleware/auth.ts を直接テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type http from 'http';

// デフォルトのconfig.jsモック（AUTH_TOKEN空 → 認証無効）
vi.mock('../../src/config.js', () => ({
  AUTH_TOKEN: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

describe('middleware/auth.ts', () => {

  describe('AUTH_TOKEN未設定時', () => {
    let mod: typeof import('../../src/middleware/auth.js');

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mod = await import('../../src/middleware/auth.js');
    });

    it('isAuthorizedHeader は常にtrueを返す', () => {
      expect(mod.isAuthorizedHeader(undefined)).toBe(true);
      expect(mod.isAuthorizedHeader('Bearer anything')).toBe(true);
    });

    it('authMiddleware はnextを呼ぶ', () => {
      const req = { headers: {} } as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;
      mod.authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('authorizeWebSocket は常にtrueを返す', () => {
      const req = { url: '/ws' } as http.IncomingMessage;
      expect(mod.authorizeWebSocket(req)).toBe(true);
    });

    it('authorizeToken は常にtrueを返す', () => {
      expect(mod.authorizeToken('anything')).toBe(true);
      expect(mod.authorizeToken('')).toBe(true);
    });

    it('getTokenFromRequest はトークンを正しく取得する', () => {
      const req = { url: '/ws?token=mytoken' } as http.IncomingMessage;
      expect(mod.getTokenFromRequest(req)).toBe('mytoken');
    });

    it('getTokenFromRequest はトークンがない場合空文字を返す', () => {
      const req = { url: '/ws' } as http.IncomingMessage;
      expect(mod.getTokenFromRequest(req)).toBe('');
    });
  });

  describe('AUTH_TOKEN設定時', () => {
    let mod: typeof import('../../src/middleware/auth.js');
    const TEST_TOKEN = 'test-secret-123';

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../src/config.js', () => ({
        AUTH_TOKEN: TEST_TOKEN,
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mod = await import('../../src/middleware/auth.js');
    });

    it('isAuthorizedHeader は正しいBearerトークンでtrueを返す', () => {
      expect(mod.isAuthorizedHeader(`Bearer ${TEST_TOKEN}`)).toBe(true);
    });

    it('isAuthorizedHeader は不正なトークンでfalseを返す', () => {
      expect(mod.isAuthorizedHeader('Bearer wrong')).toBe(false);
    });

    it('isAuthorizedHeader はundefinedでfalseを返す', () => {
      expect(mod.isAuthorizedHeader(undefined)).toBe(false);
    });

    it('authMiddleware は正しいトークンでnextを呼ぶ', () => {
      const req = { headers: { authorization: `Bearer ${TEST_TOKEN}` } } as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;
      mod.authMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      // AuthenticationErrorで呼ばれていないことを確認
      const firstArg = next.mock.calls[0][0];
      expect(firstArg).toBeUndefined();
    });

    it('authMiddleware は不正なトークンでAuthenticationErrorをnextに渡す', () => {
      const req = { headers: { authorization: 'Bearer wrong' } } as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;
      mod.authMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeDefined();
      expect((err as Error).name).toBe('AuthenticationError');
    });

    it('authMiddleware はヘッダーなしでAuthenticationErrorをnextに渡す', () => {
      const req = { headers: {} } as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;
      mod.authMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeDefined();
    });

    it('authorizeWebSocket は正しいトークンでtrueを返す', () => {
      const req = { url: `/ws?token=${TEST_TOKEN}` } as http.IncomingMessage;
      expect(mod.authorizeWebSocket(req)).toBe(true);
    });

    it('authorizeWebSocket は不正なトークンでfalseを返す', () => {
      const req = { url: '/ws?token=wrong' } as http.IncomingMessage;
      expect(mod.authorizeWebSocket(req)).toBe(false);
    });

    it('authorizeWebSocket はトークンなしでfalseを返す', () => {
      const req = { url: '/ws' } as http.IncomingMessage;
      expect(mod.authorizeWebSocket(req)).toBe(false);
    });

    it('authorizeToken は正しいトークンでtrueを返す', () => {
      expect(mod.authorizeToken(TEST_TOKEN)).toBe(true);
    });

    it('authorizeToken は不正なトークンでfalseを返す', () => {
      expect(mod.authorizeToken('wrong')).toBe(false);
    });

    it('authorizeToken は空文字でfalseを返す', () => {
      expect(mod.authorizeToken('')).toBe(false);
    });
  });
});
