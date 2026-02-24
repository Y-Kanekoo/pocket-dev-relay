/**
 * セキュリティミドルウェアのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ENABLE_HTTPSのモック
vi.mock('../../src/config.js', () => ({
  ENABLE_HTTPS: false,
}));

describe('セキュリティヘッダーミドルウェア', () => {
  let securityHeaders: (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/middleware/security.js');
    securityHeaders = mod.securityHeaders;
  });

  /**
   * モックのRequest/Response/NextFunctionを生成するヘルパー
   */
  function createMocks(): {
    req: Request;
    res: Response;
    next: NextFunction;
    headers: Map<string, string>;
  } {
    const headers = new Map<string, string>();

    const req = {} as Request;
    const res = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
        return this;
      },
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    return { req, res, next, headers };
  }

  it('Content-Security-Policyヘッダーが設定されること', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    const csp = headers.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    // script-src から 'unsafe-inline' が除去されていることを確認
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });

  it('style-srcにunsafe-inlineが含まれること（xterm.jsが動的インラインスタイルを生成するため）', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    const csp = headers.get('Content-Security-Policy');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('font-srcにGoogle Fontsが含まれること', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    const csp = headers.get('Content-Security-Policy');
    expect(csp).toContain('font-src');
    expect(csp).toContain('https://fonts.gstatic.com');
  });

  it('style-srcにGoogle Fontsスタイルシートが含まれること', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    const csp = headers.get('Content-Security-Policy');
    expect(csp).toContain('https://fonts.googleapis.com');
  });

  it('X-Content-Type-Optionsが設定されること', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('X-Frame-Optionsが設定されること', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('X-XSS-Protectionが設定されること', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    expect(headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });

  it('next()が呼び出されること', () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('HTTPS無効時はHSTSヘッダーが設定されないこと', () => {
    const { req, res, next, headers } = createMocks();
    securityHeaders(req, res, next);

    expect(headers.get('Strict-Transport-Security')).toBeUndefined();
  });
});

describe('セキュリティヘッダーミドルウェア（HTTPS有効時）', () => {
  let securityHeaders: (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(async () => {
    vi.resetModules();
    // HTTPS有効でモック
    vi.doMock('../../src/config.js', () => ({
      ENABLE_HTTPS: true,
    }));
    const mod = await import('../../src/middleware/security.js');
    securityHeaders = mod.securityHeaders;
  });

  it('HTTPS有効時はHSTSヘッダーが設定されること', () => {
    const headers = new Map<string, string>();
    const req = {} as Request;
    const res = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
        return this;
      },
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    securityHeaders(req, res, next);

    const hsts = headers.get('Strict-Transport-Security');
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
  });
});
