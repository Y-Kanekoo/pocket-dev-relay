/**
 * レート制限ミドルウェアのテスト
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config.js', () => ({
  RATE_LIMIT_API: 100,
  RATE_LIMIT_AUTH: 5,
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

import {
  createRateLimiter,
  createAuthRateLimiter,
  createWebSocketRateLimiter,
} from '../../src/middleware/rateLimit.js';

describe('レート制限ミドルウェア', () => {
  it('createRateLimiter がミドルウェア関数を返すこと', () => {
    const limiter = createRateLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createAuthRateLimiter がミドルウェア関数を返すこと', () => {
    const limiter = createAuthRateLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createWebSocketRateLimiter がミドルウェア関数を返すこと', () => {
    const limiter = createWebSocketRateLimiter();
    expect(typeof limiter).toBe('function');
  });
});
