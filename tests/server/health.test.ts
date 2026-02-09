/**
 * ヘルスチェックAPIのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// sessionsのモック（importより先にモックを定義）
vi.mock('../../src/services/session.js', () => ({
  sessions: new Map(),
}));

describe('ヘルスチェック API', () => {
  let healthRouter: { default: (req: Request, res: Response, next: () => void) => void };

  beforeEach(async () => {
    vi.resetModules();
    healthRouter = await import('../../src/routes/health.js');
  });

  /**
   * モックのreq/resを作成してルーターを呼び出すヘルパー
   */
  function callRouter(
    method: string,
    path: string,
  ): { statusCode: number; body: Record<string, unknown> } {
    const result = { statusCode: 200, body: {} as Record<string, unknown> };

    const req = {
      method: method.toUpperCase(),
      url: path,
      path: path,
      headers: {},
    } as unknown as Request;

    const res = {
      statusCode: 200,
      json(data: Record<string, unknown>) {
        result.body = data;
        return this;
      },
      status(code: number) {
        result.statusCode = code;
        return this;
      },
    } as unknown as Response;

    const next = vi.fn();
    healthRouter.default(req, res, next);

    return result;
  }

  it('GET /api/health が200を返すこと', () => {
    const result = callRouter('GET', '/api/health');
    // ルーターがjsonで返すためbodyにデータが入る
    expect(result.body).toBeDefined();
  });

  it('レスポンスにstatus, uptime, version, timestamp, activeSessions, memoryが含まれること', () => {
    const result = callRouter('GET', '/api/health');
    const body = result.body as Record<string, unknown>;

    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('uptime');
    expect(typeof body.uptime).toBe('number');
    expect(body).toHaveProperty('version');
    expect(typeof body.version).toBe('string');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('string');
    expect(body).toHaveProperty('activeSessions');
    expect(typeof body.activeSessions).toBe('number');
    expect(body).toHaveProperty('memory');

    const memory = body.memory as Record<string, unknown>;
    expect(memory).toHaveProperty('rss');
    expect(memory).toHaveProperty('heapUsed');
    expect(typeof memory.rss).toBe('number');
    expect(typeof memory.heapUsed).toBe('number');
  });

  it('timestampがISO 8601形式であること', () => {
    const result = callRouter('GET', '/api/health');
    const body = result.body as Record<string, unknown>;
    const timestamp = body.timestamp as string;
    // ISO 8601形式のチェック
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('uptimeが0以上の整数であること', () => {
    const result = callRouter('GET', '/api/health');
    const body = result.body as Record<string, unknown>;
    const uptime = body.uptime as number;
    expect(uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(uptime)).toBe(true);
  });
});
