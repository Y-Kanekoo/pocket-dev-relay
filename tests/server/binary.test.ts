/**
 * バイナリ検出ユーティリティのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// config.js のモック
vi.mock('../../src/config.js', () => ({
  CLOUDFLARED_PATH: '',
  LOG_LEVEL: 'silent',
  APP_VERSION: '0.0.0-test',
}));

// child_processのモック
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

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

    it('CLOUDFLARED_PATH が空の場合はwhichコマンドで検索する', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mockExecSync.mockReturnValue('/usr/local/bin/cloudflared\n');
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      const result = findCloudflaredBinary();
      expect(result).toBe('/usr/local/bin/cloudflared');
    });

    it('複数パスが返る場合は最初の行を使用する', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mockExecSync.mockReturnValue('/usr/local/bin/cloudflared\n/usr/bin/cloudflared\n');
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      const result = findCloudflaredBinary();
      expect(result).toBe('/usr/local/bin/cloudflared');
    });

    it('whichコマンドが空文字列を返す場合はnullを返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mockExecSync.mockReturnValue('\n');
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      const result = findCloudflaredBinary();
      expect(result).toBeNull();
    });

    it('whichコマンドがエラーを投げる場合はnullを返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      const result = findCloudflaredBinary();
      expect(result).toBeNull();
    });

    it('Windows環境ではwhereコマンドを使用する', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));

      // process.platformを一時的にwin32に変更
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      mockExecSync.mockReturnValue('C:\\Program Files\\cloudflared\\cloudflared.exe\n');
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      const result = findCloudflaredBinary();

      expect(mockExecSync).toHaveBeenCalledWith(
        'where cloudflared',
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      );
      expect(result).toBe('C:\\Program Files\\cloudflared\\cloudflared.exe');

      // platformを復元
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('非Windows環境ではwhichコマンドを使用する', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));

      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

      mockExecSync.mockReturnValue('/usr/bin/cloudflared\n');
      const { findCloudflaredBinary } = await import('../../src/utils/binary.js');
      findCloudflaredBinary();

      expect(mockExecSync).toHaveBeenCalledWith(
        'which cloudflared',
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });
  });

  describe('isCloudflaredAvailable', () => {
    it('cloudflaredが見つかる場合はtrueを返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '/usr/local/bin/cloudflared',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { isCloudflaredAvailable } = await import('../../src/utils/binary.js');
      expect(isCloudflaredAvailable()).toBe(true);
    });

    it('cloudflaredが見つからない場合はfalseを返す', async () => {
      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      const { isCloudflaredAvailable } = await import('../../src/utils/binary.js');
      expect(isCloudflaredAvailable()).toBe(false);
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
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });

      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { getInstallGuide } = await import('../../src/utils/binary.js');
      const guide = getInstallGuide();
      expect(guide).toContain('brew install cloudflared');

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('Linuxではcurlコマンドを案内する', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { getInstallGuide } = await import('../../src/utils/binary.js');
      const guide = getInstallGuide();
      expect(guide).toContain('curl -L');
      expect(guide).toContain('chmod +x');

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('Windowsではwingetを案内する', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { getInstallGuide } = await import('../../src/utils/binary.js');
      const guide = getInstallGuide();
      expect(guide).toContain('winget install');

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('未知のプラットフォームでもベースメッセージを返す', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'freebsd', writable: true });

      vi.doMock('../../src/config.js', () => ({
        CLOUDFLARED_PATH: '',
        LOG_LEVEL: 'silent',
        APP_VERSION: '0.0.0-test',
      }));
      const { getInstallGuide } = await import('../../src/utils/binary.js');
      const guide = getInstallGuide();
      expect(guide).toContain('cloudflared が見つかりません');
      expect(guide).toContain('CLOUDFLARED_PATH');
      // プラットフォーム固有のインストール手順は含まない
      expect(guide).not.toContain('brew');
      expect(guide).not.toContain('curl');
      expect(guide).not.toContain('winget');

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });
  });
});
