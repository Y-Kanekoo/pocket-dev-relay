/**
 * トンネルサービスのテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// config.js のモック
vi.mock('../../src/config.js', () => ({
  TUNNEL_TIMEOUT: 5000,
  CLOUDFLARED_PATH: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// logger のモック
vi.mock('../../src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// binary.ts のモック
vi.mock('../../src/utils/binary.js', () => ({
  findCloudflaredBinary: vi.fn(),
  getInstallGuide: vi.fn(() => 'インストールガイド'),
}));

describe('tunnel', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TUNNEL_URL_PATTERN', () => {
    it('trycloudflare.com のURLにマッチする', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      const testUrl = 'https://my-test-tunnel.trycloudflare.com';
      expect(TUNNEL_URL_PATTERN.test(testUrl)).toBe(true);
    });

    it('複数のハイフンを含むURLにマッチする', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      const testUrl = 'https://abc-def-ghi-123.trycloudflare.com';
      expect(TUNNEL_URL_PATTERN.test(testUrl)).toBe(true);
    });

    it('無関係なURLにはマッチしない', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      expect(TUNNEL_URL_PATTERN.test('https://example.com')).toBe(false);
      expect(TUNNEL_URL_PATTERN.test('http://localhost:4173')).toBe(false);
    });

    it('cloudflaredのログ出力からURLを抽出できる', async () => {
      const { TUNNEL_URL_PATTERN } = await import('../../src/services/tunnel.js');
      const logLine =
        '2024-01-01T00:00:00Z INF +--------------------------------------------------------------------------------------------+\n' +
        '2024-01-01T00:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |\n' +
        '2024-01-01T00:00:00Z INF |  https://my-cool-tunnel-abc123.trycloudflare.com                                          |\n';
      const match = logLine.match(TUNNEL_URL_PATTERN);
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('https://my-cool-tunnel-abc123.trycloudflare.com');
    });
  });

  describe('getTunnelInfo', () => {
    it('初期状態ではnullを返す', async () => {
      const { getTunnelInfo } = await import('../../src/services/tunnel.js');
      expect(getTunnelInfo()).toBeNull();
    });
  });

  describe('startTunnel', () => {
    it('cloudflaredが見つからない場合はエラーを投げる', async () => {
      const binaryMock = await import('../../src/utils/binary.js');
      vi.mocked(binaryMock.findCloudflaredBinary).mockReturnValue(null);

      const { startTunnel } = await import('../../src/services/tunnel.js');
      await expect(startTunnel(4173)).rejects.toThrow('cloudflared が見つかりません');
    });
  });

  describe('stopTunnel', () => {
    it('未起動時でもエラーにならない', async () => {
      const { stopTunnel } = await import('../../src/services/tunnel.js');
      expect(() => stopTunnel()).not.toThrow();
    });
  });
});
