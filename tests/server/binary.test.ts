/**
 * バイナリ検出ユーティリティのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// config.js のモック
vi.mock('../../src/config.js', () => ({
  CLOUDFLARED_PATH: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

describe('binary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('findCloudflaredBinary', () => {
    it('CLOUDFLARED_PATH が設定されている場合はそのパスを返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '/custom/path/cloudflared',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      expect(findCloudflaredBinary()).toBe('/custom/path/cloudflared');
    });

    it('CLOUDFLARED_PATH が空の場合はPATHから検索する', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      // PATHに cloudflared があるかないかで結果が変わる
      const result = findCloudflaredBinary();
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('isCloudflaredAvailable', () => {
    it('boolean を返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { isCloudflaredAvailable } = await import('../../src/utils/binary.js');
      expect(typeof isCloudflaredAvailable()).toBe('boolean');
    });
  });

  describe('getInstallGuide', () => {
    it('インストールガイドメッセージを返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { getInstallGuide } = await import('../../src/utils/binary.js');
      const guide = getInstallGuide();
      expect(guide).toContain('cloudflared が見つかりません');
      expect(guide).toContain('インストール方法');
      expect(guide).toContain('CLOUDFLARED_PATH');
    });

    it('macOSではbrew installを案内する', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { getInstallGuide } = await import('../../src/utils/binary.js');
      const guide = getInstallGuide();
      // テスト実行環境がmacOSの場合のみbrew表示される
      if (process.platform === 'darwin') {
        expect(guide).toContain('brew install cloudflared');
      }
    });
  });
});
